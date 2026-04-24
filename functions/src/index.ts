import { onSchedule } from 'firebase-functions/v2/scheduler';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Firestore, DocumentData, QueryDocumentSnapshot } from 'firebase-admin/firestore';

initializeApp();

const APIFOOTBALL_KEY = '6e329e6f75ffdaa7d69a869d6764ed37';
const APIFOOTBALL_BARCA_ID = 529;
const FOOTBALLDATA_KEY = '3000b1fbd35442c4924a4b1c560eb630';
const FOOTBALLDATA_BARCA_ID = 81;

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

// ─── Mise à jour du planning (prochain match Barça) ───────────────────────────
// Tourne toutes les 6 heures pour que pollLiveMatch sache quand démarrer le polling.

export const updateMatchSchedule = onSchedule('every 6 hours', async () => {
  const db = getFirestore();
  try {
    const res = await fetch(
      `https://api.football-data.org/v4/teams/${FOOTBALLDATA_BARCA_ID}/matches?status=SCHEDULED&limit=1`,
      { headers: { 'X-Auth-Token': FOOTBALLDATA_KEY } }
    );
    if (!res.ok) return;
    const json = await res.json();
    const match = json.matches?.[0];
    if (!match) return;

    await db.doc('liveMatch/schedule').set({
      nextMatchId: String(match.id),
      nextMatchDate: match.utcDate,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch {}
});

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

  // Fenêtre de match : ne polluer que pendant la période utile
  if (schedule?.nextMatchDate) {
    const matchTime = new Date(schedule.nextMatchDate as string).getTime();
    const msFromKO = Date.now() - matchTime;
    if (msFromKO < -PREMATCH_WINDOW_MS) return;
    if (msFromKO > MATCH_MAX_DURATION_MS) return;
  } else {
    return;
  }

  const matchId = schedule?.nextMatchId ?? current?.matchId ?? null;
  const prevStatus = current?.status as string | null;

  // ── Appel API-Football (scores live) ──
  let json: any;
  try {
    const res = await fetch(
      `https://v3.football.api-sports.io/fixtures?team=${APIFOOTBALL_BARCA_ID}&live=all`,
      { headers: { 'x-apisports-key': APIFOOTBALL_KEY } }
    );
    if (!res.ok) return;
    json = await res.json();
  } catch {
    return;
  }

  // ── Aucun match live ──
  if (!json.response?.length) {
    // Si le match était en cours et api-sports ne le renvoie plus → probablement terminé
    // On confirme via football-data.org (pas de quota journalier)
    if ((prevStatus === 'IN_PLAY' || prevStatus === 'PAUSED') && matchId) {
      try {
        const fdRes = await fetch(
          `https://api.football-data.org/v4/matches/${matchId}`,
          { headers: { 'X-Auth-Token': FOOTBALLDATA_KEY } }
        );
        if (fdRes.ok) {
          const fdJson = await fdRes.json();
          if (fdJson.status === 'FINISHED') {
            const homeScore = fdJson.score?.fullTime?.home ?? 0;
            const awayScore = fdJson.score?.fullTime?.away ?? 0;
            const result: BetResult = homeScore > awayScore ? 'home' : awayScore > homeScore ? 'away' : 'draw';

            await db.doc('liveMatch/current').set({
              status: 'FINISHED', homeScore, awayScore, minute: null, matchId,
              updatedAt: FieldValue.serverTimestamp(),
            });

            // Régler les paris si pas encore fait
            const alreadySettled = await db.doc(`matchResults/${matchId}`).get();
            if (!alreadySettled.exists) {
              await db.doc(`matchResults/${matchId}`).set({ result, finishedAt: FieldValue.serverTimestamp() });
              await settleBets(db, matchId, result);
            }
            return;
          }
        }
      } catch {}
    }

    await db.doc('liveMatch/current').set({
      status: null, homeScore: null, awayScore: null, minute: null, matchId,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }

  // ── Match live trouvé ──
  const f = json.response[0];
  const short: string = f.fixture.status.short;

  let status: string;
  if (['1H', '2H', 'ET', 'P', 'LIVE', 'INT'].includes(short)) status = 'IN_PLAY';
  else if (['HT', 'BT'].includes(short)) status = 'PAUSED';
  else if (['FT', 'AET', 'PEN'].includes(short)) status = 'FINISHED';
  else status = 'SCHEDULED';

  const homeScore: number = f.goals.home ?? 0;
  const awayScore: number = f.goals.away ?? 0;

  await db.doc('liveMatch/current').set({
    status, homeScore, awayScore,
    minute: f.fixture.status.elapsed ?? null,
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
