import { onSchedule } from 'firebase-functions/v2/scheduler';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Firestore, DocumentData, QueryDocumentSnapshot } from 'firebase-admin/firestore';

initializeApp();

const ESPN_BARCA_ID = '83';
// Compétitions où Barça peut jouer (même liste que le client MatchContext.tsx)
const ESPN_LEAGUES = ['esp.1', 'esp.copa_del_rey', 'esp.super_cup', 'uefa.champions', 'fifa.cwc', 'club.friendly'];

const MIN_POLL_INTERVAL_MS = 90 * 1000;
const PREMATCH_WINDOW_MS = 15 * 60 * 1000;
const MATCH_MAX_DURATION_MS = 130 * 60 * 1000;

type BetResult = 'home' | 'draw' | 'away';

// ─── Règlement des paris côté serveur ─────────────────────────────────────────

async function settleBets(db: Firestore, matchId: string, result: BetResult) {
  const betsSnapshot = await db.collection('bets').get();
  if (betsSnapshot.empty) return;

  await Promise.all(betsSnapshot.docs.map(async (betDoc: QueryDocumentSnapshot<DocumentData>) => {
    try {
      const data = betDoc.data();
      const bet = data[matchId];
      if (!bet || bet.result !== undefined) return; // pas de pari ou déjà réglé

      const userId = betDoc.id;
      const won = bet.prediction === result;
      const settledBet = {
        ...bet,
        result: won ? 'won' : 'lost',
        wonAmount: won ? bet.potentialWin : 0,
        settledAt: Date.now(),
      };

      // Garder max 5 paris réglés — supprimer les plus anciens au-delà
      const alreadySettled = Object.entries(data)
        .filter(([id, b]: [string, any]) => b.result !== undefined && id !== matchId)
        .sort(([, a]: any, [, b]: any) => (b.settledAt ?? 0) - (a.settledAt ?? 0));

      const updates: Record<string, any> = { [matchId]: settledBet };
      alreadySettled.slice(4).forEach(([id]) => { updates[id] = FieldValue.delete(); });

      await betDoc.ref.update(updates);

      // Créditer les pièces si gagné
      if (won) {
        await db.doc(`users/${userId}`).update({
          coins: FieldValue.increment(bet.potentialWin),
        });
      }
    } catch {
      // Ignorer les erreurs par utilisateur pour ne pas bloquer les autres
    }
  }));
}

// ─── ESPN : découverte du prochain match Barça (toutes compétitions) ──────────

function formatDateYmd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

async function fetchNextBarcaEvent(): Promise<{ id: string; date: string; league: string } | null> {
  const now = new Date();
  const from = formatDateYmd(now);
  const to = formatDateYmd(new Date(now.getTime() + 120 * 24 * 60 * 60 * 1000));
  const dateRange = `${from}-${to}`;

  const results = await Promise.all(
    ESPN_LEAGUES.map(league =>
      fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard?dates=${dateRange}`)
        .then(r => r.json())
        .then(json => ({ league, events: (json.events ?? []) as any[] }))
        .catch(() => ({ league, events: [] as any[] }))
    )
  );

  let best: { id: string; date: string; league: string; dt: number } | null = null;
  for (const { league, events } of results) {
    for (const ev of events) {
      const competitors = ev.competitions?.[0]?.competitors ?? [];
      const involvesBarca = competitors.some((c: any) => String(c.team?.id) === ESPN_BARCA_ID);
      if (!involvesBarca) continue;
      if (ev.competitions?.[0]?.status?.type?.state === 'post') continue; // déjà terminé
      const dt = new Date(ev.date).getTime();
      if (!best || dt < best.dt) best = { id: String(ev.id), date: ev.date, league, dt };
    }
  }
  return best ? { id: best.id, date: best.date, league: best.league } : null;
}

// ─── Mise à jour du planning (prochain match Barça) ───────────────────────────
// Tourne toutes les 6 heures pour que pollLiveMatch sache quand démarrer le polling.

export const updateMatchSchedule = onSchedule('every 6 hours', async () => {
  const db = getFirestore();
  try {
    const next = await fetchNextBarcaEvent();
    if (!next) return;

    await db.doc('liveMatch/schedule').set({
      nextMatchId: next.id,
      nextMatchDate: next.date,
      nextMatchLeague: next.league,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch {}
});

// "19'" → 19, "45+2'" → 47, "90+3'" → 93
function parseDisplayClock(s: any): number | null {
  if (typeof s !== 'string') return null;
  const m = s.match(/^(\d+)(?:\+(\d+))?/);
  if (!m) return null;
  return parseInt(m[1], 10) + (m[2] ? parseInt(m[2], 10) : 0);
}

// ─── Polling live + règlement automatique ─────────────────────────────────────

export const pollLiveMatch = onSchedule('every 1 minutes', async () => {
  const db = getFirestore();

  const [currentSnap, scheduleSnap] = await Promise.all([
    db.doc('liveMatch/current').get(),
    db.doc('liveMatch/schedule').get(),
  ]);

  const current = currentSnap.data();
  const schedule = scheduleSnap.data();

  // Rate-limit : ne pas appeler l'API si dernier appel < 90s
  const lastCall = (current?.updatedAt as { toMillis(): number } | undefined)?.toMillis() ?? 0;
  if (Date.now() - lastCall < MIN_POLL_INTERVAL_MS) return;

  const matchId = schedule?.nextMatchId as string | undefined;
  const league = schedule?.nextMatchLeague as string | undefined;
  if (!matchId || !league || !schedule?.nextMatchDate) return;

  // Fenêtre de match : ne polluer que pendant la période utile
  const matchTime = new Date(schedule.nextMatchDate as string).getTime();
  const msFromKO = Date.now() - matchTime;
  if (msFromKO < -PREMATCH_WINDOW_MS) return;
  if (msFromKO > MATCH_MAX_DURATION_MS) return;

  // ── Appel ESPN (score + statut du match) ──
  let comp: any;
  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/summary?event=${matchId}`
    );
    if (!res.ok) return;
    const json = await res.json();
    comp = json.header?.competitions?.[0];
    if (!comp) return;
  } catch {
    return;
  }

  const competitors = comp.competitors ?? [];
  const home = competitors.find((c: any) => c.homeAway === 'home') ?? competitors[0];
  const away = competitors.find((c: any) => c.homeAway === 'away') ?? competitors[1];
  const statusType = comp.status?.type;

  let status: string;
  if (['STATUS_HALFTIME', 'STATUS_END_PERIOD'].includes(statusType?.name)) status = 'PAUSED';
  else if (statusType?.state === 'in') status = 'IN_PLAY';
  else if (statusType?.state === 'post') status = 'FINISHED';
  else status = 'SCHEDULED';

  const homeScore: number = Number(home?.score ?? 0);
  const awayScore: number = Number(away?.score ?? 0);
  const minute: number | null = status === 'IN_PLAY' ? parseDisplayClock(comp.status?.displayClock) : null;

  // ── Détecter un but ──
  const prevHome = current?.homeScore as number | null;
  const prevAway = current?.awayScore as number | null;
  const goalScored =
    prevHome !== null &&
    prevAway !== null &&
    status === 'IN_PLAY' &&
    (homeScore > prevHome || awayScore > prevAway);

  if (goalScored) {
    const barcaScored = homeScore > (prevHome ?? 0);
    const scorerLabel = barcaScored ? '⚽ But du Barça !' : '⚽ But de l\'adversaire';
    const scoreLabel = `${homeScore} - ${awayScore}${minute ? ` (${minute}')` : ''}`;

    // Récupérer tous les utilisateurs avec liveNotifEnabled = true et un token
    const usersSnap = await db.collection('users')
      .where('liveNotifEnabled', '==', true)
      .get();

    const tokens: string[] = [];
    usersSnap.docs.forEach(d => {
      const token = d.data().expoPushToken as string | undefined;
      if (token && token.startsWith('ExponentPushToken')) tokens.push(token);
    });

    if (tokens.length > 0) {
      const messages = tokens.map(to => ({
        to,
        title: scorerLabel,
        body: `FC Barcelona ${scoreLabel}`,
        sound: 'default',
        data: { type: 'goal', matchId },
      }));

      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages),
      });
    }
  }

  await db.doc('liveMatch/current').set({
    status, homeScore, awayScore,
    minute,
    matchId,
    updatedAt: FieldValue.serverTimestamp(),
  });

  // ── Régler les paris si le match vient de se terminer ──
  if (status === 'FINISHED' && matchId) {
    const alreadySettled = await db.doc(`matchResults/${matchId}`).get();
    if (!alreadySettled.exists) {
      const result: BetResult = homeScore > awayScore ? 'home' : awayScore > homeScore ? 'away' : 'draw';
      await db.doc(`matchResults/${matchId}`).set({ result, finishedAt: FieldValue.serverTimestamp() });
      await settleBets(db, matchId, result);
    }
  }
});

