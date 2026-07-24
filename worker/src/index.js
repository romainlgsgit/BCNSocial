import { handleVerifyEmail } from './verifyEmail.js';
import { sweepUnverified } from './sweepUnverified.js';

/**
 * Sentinelle du score live — Cloudflare Worker (plan gratuit, sans carte bancaire).
 *
 * Pourquoi : sans serveur, un but n'est détecté que si un téléphone a l'app ouverte.
 * Si personne n'est connecté, personne n'est notifié. Ce worker joue le rôle du
 * téléphone toujours éveillé.
 *
 * Contraintes respectées :
 *  - 0 € : cron Cloudflare (gratuit), ESPN (gratuit), Expo push (gratuit).
 *  - 1 lecture Firestore par minute PENDANT un match seulement (~110 par match, pour
 *    le worker entier, pas par utilisateur). L'état précédent était initialement gardé
 *    dans Workers KV pour économiser ces lectures, mais KV est à cohérence différée
 *    (~60 s) : au rythme d'un cron par minute on relisait un état périmé et on
 *    réécrivait Firestore pour rien — ce qui coûtait bien plus cher, une lecture par
 *    appareil abonné à chaque fausse écriture.
 *  - Écriture Firestore UNIQUEMENT si le score/statut change → ~10 écritures par match.
 *    Chaque écriture coûte 1 lecture à chaque appareil abonné, donc on n'écrit jamais
 *    « pour rien » (surtout pas la minute, que l'app extrapole toute seule).
 *  - Endpoint ESPN `scoreboard` (65 Ko) et non `summary` (485 Ko) : le worker gratuit
 *    a un budget CPU serré, et parser 485 Ko le ferait tuer. Le scoreboard contient
 *    tout ce qu'il faut : score, horloge, statut ET buteurs.
 */

const BARCA_ESPN_ID = '83';
const BARCA_LEAGUES = [
  'esp.1', 'esp.copa_del_rey', 'esp.super_cup',
  'uefa.champions', 'fifa.cwc', 'club.friendly',
];

// Test hors saison : viser une autre équipe sans toucher au code.
//   wrangler secret put TEST_TEAM_ID   → ex. 436  (Fenerbahce)
//   wrangler secret put TEST_LEAGUES   → ex. uefa.champions_qual
// Laisser vide en production. TEST_MUTE_PUSH=1 coupe l'envoi aux vrais utilisateurs.
const teamIdOf = (env) => env?.TEST_TEAM_ID || BARCA_ESPN_ID;
const leaguesOf = (env) =>
  env?.TEST_LEAGUES ? env.TEST_LEAGUES.split(',').map((s) => s.trim()) : BARCA_LEAGUES;

// Fenêtre d'activité autour du coup d'envoi
const PRE_KO_MS = 10 * 60 * 1000;
const MAX_MATCH_MS = 3.5 * 60 * 60 * 1000;
// Rafraîchissement du calendrier (quel est le prochain match ?)
const SCHEDULE_TTL_MS = 6 * 60 * 60 * 1000;
// Ré-ancrage de la minute : on ne réécrit pas le doc chaque minute, mais on corrige
// la dérive de l'extrapolation locale au-delà de ce seuil.
const MINUTE_DRIFT_TOLERANCE = 5;

const EXPO_PUSH_CHUNK = 100;

// ─── ESPN ─────────────────────────────────────────────────────────────────────

const ymd = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`;
};

const scoreboardUrl = (league, dates) =>
  `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard?dates=${dates}`;

function involvesBarca(event, teamId) {
  const competitors = event?.competitions?.[0]?.competitors ?? [];
  return competitors.some(
    (c) =>
      String(c.team?.id) === String(teamId) ||
      (teamId === BARCA_ESPN_ID &&
        (c.team?.displayName ?? '').toLowerCase().includes('barcelona'))
  );
}

async function fetchLeague(league, dates) {
  try {
    const res = await fetch(scoreboardUrl(league, dates), {
      cf: { cacheTtl: 5, cacheEverything: false },
    });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.events ?? []).map((e) => ({ ...e, __league: league }));
  } catch {
    return [];
  }
}

/** Prochain match du Barça (ou match en cours) sur les 10 prochains jours. */
export async function findNextMatch(env) {
  const now = new Date();
  const from = ymd(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const to = ymd(new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000));
  const dates = `${from}-${to}`;

  const teamId = teamIdOf(env);
  const all = (await Promise.all(leaguesOf(env).map((l) => fetchLeague(l, dates)))).flat();
  const barca = all.filter((e) => involvesBarca(e, teamId));
  if (!barca.length) return null;

  barca.sort((a, b) => new Date(a.date) - new Date(b.date));
  // Le match en cours ou le prochain à venir : on ignore ceux déjà finis depuis longtemps
  const cutoff = Date.now() - MAX_MATCH_MS;
  const next = barca.find((e) => new Date(e.date).getTime() > cutoff);
  if (!next) return null;

  return {
    eventId: String(next.id),
    leagueSlug: next.__league,
    startMs: new Date(next.date).getTime(),
    refreshedAt: Date.now(),
  };
}

export function mapStatus(name, state) {
  switch (name) {
    case 'STATUS_HALFTIME':
    case 'STATUS_END_PERIOD':
      return 'PAUSED';
    case 'STATUS_FULL_TIME':
    case 'STATUS_FINAL':
    case 'STATUS_FINAL_AET':
    case 'STATUS_FINAL_PEN':
      return 'FINISHED';
    case 'STATUS_POSTPONED':
    case 'STATUS_CANCELED':
    case 'STATUS_FORFEIT':
      return 'POSTPONED';
  }
  if (state === 'in') return 'IN_PLAY';
  if (state === 'post') return 'FINISHED';
  return 'SCHEDULED';
}

/** "19'" → 19, "45+2'" → 47 */
export function parseClock(s) {
  if (typeof s !== 'string') return null;
  const m = s.match(/^(\d+)(?:\+(\d+))?/);
  return m ? parseInt(m[1], 10) + (m[2] ? parseInt(m[2], 10) : 0) : null;
}

export function parseScore(s) {
  if (s == null) return null;
  if (typeof s === 'number') return s;
  if (typeof s === 'string') {
    const n = parseInt(s, 10);
    return Number.isNaN(n) ? null : n;
  }
  if (typeof s === 'object') {
    if (typeof s.value === 'number') return s.value;
    if (typeof s.displayValue === 'string') return parseScore(s.displayValue);
  }
  return null;
}

/** Buteurs depuis `details` du scoreboard (équivalent de keyEvents dans summary). */
export function extractGoals(comp, homeId) {
  const goals = [];
  for (const d of comp.details ?? []) {
    if (!d?.scoringPlay) continue;
    const typeText = (d.type?.text ?? '').toLowerCase();
    if (typeText.includes('shootout')) continue; // tirs au but : hors score

    const isOwnGoal = !!d.ownGoal;
    const playerTeamId = String(d.team?.id ?? '');
    // `team` désigne l'équipe du JOUEUR : sur un CSC, le but compte pour l'adversaire.
    let team = playerTeamId === String(homeId ?? '') ? 'home' : 'away';
    if (isOwnGoal) team = team === 'home' ? 'away' : 'home';

    goals.push({
      scorer: d.athletesInvolved?.[0]?.displayName?.trim() || 'Inconnu',
      team,
      minute: d.clock?.displayValue || '',
      isPenalty: !!d.penaltyKick,
      isOwnGoal,
    });
  }
  return goals;
}

/** État live d'un match précis, depuis le scoreboard du jour. */
export async function fetchLiveState(eventId, leagueSlug, startMs) {
  const dates = `${ymd(new Date(startMs - 86400000))}-${ymd(new Date(startMs + 86400000))}`;
  const events = await fetchLeague(leagueSlug, dates);
  const ev = events.find((e) => String(e.id) === String(eventId));
  if (!ev) return null;

  const comp = ev.competitions?.[0] ?? {};
  const competitors = comp.competitors ?? [];
  const home = competitors.find((c) => c.homeAway === 'home') ?? competitors[0];
  const away = competitors.find((c) => c.homeAway === 'away') ?? competitors[1];
  const st = comp.status ?? {};
  const status = mapStatus(st.type?.name ?? '', st.type?.state);

  let minute = null;
  if (status === 'IN_PLAY') {
    minute = parseClock(st.displayClock);
    if (minute === null && typeof st.clock === 'number') {
      const offset = { 1: 0, 2: 45, 3: 90, 4: 105 }[st.period ?? 1] ?? 0;
      minute = offset + Math.floor(st.clock / 60);
    }
  } else if (status === 'PAUSED') {
    minute = { 1: 45, 2: 90, 3: 105, 4: 120 }[st.period ?? 1] ?? null;
  }

  return {
    status,
    homeScore: parseScore(home?.score) ?? 0,
    awayScore: parseScore(away?.score) ?? 0,
    minute,
    goals: extractGoals(comp, home?.team?.id),
    homeTeamId: String(home?.team?.id ?? ''),
    homeName: home?.team?.displayName ?? 'Domicile',
    awayName: away?.team?.displayName ?? 'Extérieur',
    homeShort: home?.team?.abbreviation ?? 'DOM',
    awayShort: away?.team?.abbreviation ?? 'EXT',
  };
}

// ─── Firebase (REST) ──────────────────────────────────────────────────────────

/** Jeton d'un compte « bot » : /users exige request.auth != null pour lire les tokens. */
async function getIdToken(env) {
  const cached = await env.STATE.get('idToken', { type: 'json' });
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${env.FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: env.BOT_EMAIL,
        password: env.BOT_PASSWORD,
        returnSecureToken: true,
      }),
    }
  );
  if (!res.ok) throw new Error(`auth ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const token = json.idToken;
  await env.STATE.put(
    'idToken',
    JSON.stringify({ token, expiresAt: Date.now() + Number(json.expiresIn ?? 3600) * 1000 })
  );
  return token;
}

const docsUrl = (env) =>
  `https://firestore.googleapis.com/v1/projects/${env.PROJECT_ID}/databases/(default)/documents`;

const strVal = (v) => (v == null ? { nullValue: null } : { stringValue: String(v) });
const intVal = (v) => (v == null ? { nullValue: null } : { integerValue: String(v) });

function goalsToFirestore(goals) {
  return {
    arrayValue: {
      values: (goals ?? []).map((g) => ({
        mapValue: {
          fields: {
            scorer: strVal(g.scorer),
            team: strVal(g.team),
            minute: strVal(g.minute),
            isPenalty: { booleanValue: !!g.isPenalty },
            isOwnGoal: { booleanValue: !!g.isOwnGoal },
          },
        },
      })),
    },
  };
}

/** Écrit `liveMatch/current` dans le schéma exact attendu par l'app. */
async function writeLiveDoc(env, token, sched, state) {
  const fields = {
    eventId: strVal(sched.eventId),
    leagueSlug: strVal(sched.leagueSlug),
    status: strVal(state.status),
    homeScore: intVal(state.homeScore),
    awayScore: intVal(state.awayScore),
    goals: goalsToFirestore(state.goals),
    minuteAnchor: intVal(state.minute),
    minuteAnchorAt: intVal(Date.now()),
    updatedAt: { timestampValue: new Date().toISOString() },
  };

  const res = await fetch(`${docsUrl(env)}/liveMatch/current`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`write ${res.status}: ${await res.text()}`);
}

/** Tokens Expo des utilisateurs abonnés aux notifs live. */
async function fetchPushTokens(env, token) {
  const res = await fetch(`${docsUrl(env)}:runQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'users' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'liveNotifEnabled' },
            op: 'EQUAL',
            value: { booleanValue: true },
          },
        },
      },
    }),
  });
  if (!res.ok) return [];
  const rows = await res.json();
  const tokens = [];
  for (const r of rows) {
    const t = r.document?.fields?.expoPushToken?.stringValue;
    if (t && t.startsWith('ExponentPushToken')) tokens.push(t);
  }

  // Test hors saison : n'envoyer qu'aux appareils de test, pour ne pas notifier
  // « BUT DU BARÇA » à de vrais utilisateurs pour un match qui n'est pas le leur.
  // TEST_PUSH_ONLY = un ou plusieurs fragments de token, séparés par des virgules.
  if (env.TEST_PUSH_ONLY) {
    const allowed = env.TEST_PUSH_ONLY.split(',').map((s) => s.trim()).filter(Boolean);
    return tokens.filter((t) => allowed.some((frag) => t.includes(frag)));
  }
  return tokens;
}

/**
 * Réserve le droit d'émettre une notification, via le MÊME doc et le MÊME format de
 * clé que l'app (`liveMatch/lastGoalNotif`). Sans ça, le worker et un téléphone qui
 * détectent le but en même temps enverraient chacun leur push, et l'utilisateur
 * recevrait le but en double.
 */
async function claimNotif(env, token, key) {
  const url = `${docsUrl(env)}/liveMatch/lastGoalNotif`;
  try {
    const cur = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (cur.ok) {
      const j = await cur.json();
      if (j?.fields?.scoreKey?.stringValue === key) return false; // déjà envoyé
    }
  } catch {}

  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      fields: { scoreKey: strVal(key), sentAt: strVal(new Date().toISOString()) },
    }),
  });
  return res.ok;
}

async function sendPush(tokens, title, body) {
  for (let i = 0; i < tokens.length; i += EXPO_PUSH_CHUNK) {
    const messages = tokens.slice(i, i + EXPO_PUSH_CHUNK).map((to) => ({
      to, title, body, sound: 'default', data: { type: 'goal' },
    }));
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    }).catch(() => {});
  }
}

// ─── Détection de changement ──────────────────────────────────────────────────

export function scoreChanged(prev, next) {
  if (!prev) return true;
  return (
    prev.status !== next.status ||
    prev.homeScore !== next.homeScore ||
    prev.awayScore !== next.awayScore ||
    (prev.goals?.length ?? 0) !== (next.goals?.length ?? 0)
  );
}

/** L'app extrapole la minute ; on ne réécrit que si elle a trop dérivé. */
function minuteDrifted(prev, next) {
  if (next.minute == null || prev?.minute == null || prev.minuteAnchorAt == null) return false;
  const expected = prev.minute + Math.floor((Date.now() - prev.minuteAnchorAt) / 60000);
  return Math.abs(expected - next.minute) > MINUTE_DRIFT_TOLERANCE;
}

/**
 * État précédent lu depuis Firestore plutôt que depuis KV.
 * KV est à cohérence différée (~60 s) : au rythme d'un cron par minute, on relisait
 * parfois un état périmé, on croyait à un changement, et on réécrivait pour rien —
 * chaque écriture inutile coûtant une lecture à TOUS les appareils abonnés.
 * Le doc Firestore est fortement cohérent, et c'est aussi celui qu'écrivent les
 * téléphones : le worker se synchronise donc naturellement avec eux.
 */
async function readLiveDoc(env, token) {
  const res = await fetch(`${docsUrl(env)}/liveMatch/current`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const f = (await res.json())?.fields;
  if (!f) return null;
  const num = (k) => (f[k]?.integerValue != null ? Number(f[k].integerValue) : null);
  return {
    eventId: f.eventId?.stringValue ?? null,
    status: f.status?.stringValue ?? null,
    homeScore: num('homeScore'),
    awayScore: num('awayScore'),
    minute: num('minuteAnchor'),
    minuteAnchorAt: num('minuteAnchorAt'),
    goals: (f.goals?.arrayValue?.values ?? []).map((v) => ({
      scorer: v.mapValue?.fields?.scorer?.stringValue ?? '',
    })),
  };
}

// ─── Boucle principale ────────────────────────────────────────────────────────

export async function tick(env) {
  // 1. Calendrier (KV, pas Firestore) — rafraîchi toutes les 6h seulement.
  let sched = await env.STATE.get('schedule', { type: 'json' });
  const stale =
    !sched ||
    Date.now() - sched.refreshedAt > SCHEDULE_TTL_MS ||
    Date.now() > sched.startMs + MAX_MATCH_MS;

  if (stale) {
    sched = await findNextMatch(env);
    if (!sched) {
      await env.STATE.put('schedule', JSON.stringify({ refreshedAt: Date.now(), startMs: 0 }));
      return 'aucun match à venir';
    }
    await env.STATE.put('schedule', JSON.stringify(sched));
  }
  if (!sched.eventId) return 'aucun match à venir';

  // 2. Hors fenêtre de match : on ne touche à rien (0 appel ESPN, 0 Firestore).
  const now = Date.now();
  if (now < sched.startMs - PRE_KO_MS) return `en veille, KO dans ${Math.round((sched.startMs - now) / 60000)} min`;
  if (now > sched.startMs + MAX_MATCH_MS) return 'match terminé (hors fenêtre)';

  // 3. Match en fenêtre : on interroge ESPN.
  const state = await fetchLiveState(sched.eventId, sched.leagueSlug, sched.startMs);
  if (!state) return 'match introuvable sur ESPN';

  const token = await getIdToken(env);

  // 4. DÉCISION D'ÉCRITURE — comparer au doc Firestore (fortement cohérent).
  // Si un téléphone a déjà publié ce score, inutile de le réécrire : ça coûterait
  // une lecture à tous les abonnés pour rien.
  const prevDoc = await readLiveDoc(env, token);
  const docPrev = prevDoc?.eventId === sched.eventId ? prevDoc : null;
  if (scoreChanged(docPrev, state) || minuteDrifted(docPrev, state)) {
    await writeLiveDoc(env, token, sched, state);
  }

  // 5. DÉCISION DE NOTIFICATION — comparer à NOTRE dernier état notifié, jamais au
  // doc partagé : un téléphone peut l'avoir mis à jour avant nous, et le worker
  // conclurait alors « rien n'a changé » et n'enverrait jamais le but.
  // KV suffit ici malgré sa cohérence différée : au pire on retente un envoi déjà
  // fait, et claimNotif (Firestore, fortement cohérent) le bloque.
  const notifRaw = await env.STATE.get('lastNotified', { type: 'json' });
  const prev = notifRaw?.eventId === sched.eventId ? notifRaw : null;
  const changed = scoreChanged(prev, state);

  await env.STATE.put(
    'lastNotified',
    JSON.stringify({
      eventId: sched.eventId, status: state.status,
      homeScore: state.homeScore, awayScore: state.awayScore,
      goals: state.goals.map((g) => ({ scorer: g.scorer })),
    })
  );

  if (!changed) return `inchangé (${state.homeScore}-${state.awayScore})`;

  if (prev) {
    const isBarcaHome = state.homeTeamId === String(teamIdOf(env));
    const scoreLine = `${state.homeShort}  ${state.homeScore} - ${state.awayScore}  ${state.awayShort}`;
    const notifs = [];

    // Les clés reprennent EXACTEMENT le format de l'app (NotificationService.ts),
    // pour que worker et téléphones se déduplique mutuellement.
    const goalKey = `${sched.eventId}-${state.homeScore}-${state.awayScore}`;

    if ((prev.status === 'SCHEDULED' || prev.status === 'TIMED') && state.status === 'IN_PLAY') {
      notifs.push([`KO-${sched.eventId}`, "⚽ Coup d'envoi !",
        `${state.homeName} vs ${state.awayName} vient de commencer !`]);
    }

    const dHome = state.homeScore - prev.homeScore;
    const dAway = state.awayScore - prev.awayScore;
    if (dHome > 0) {
      const base = isBarcaHome ? '⚽ BUT DU BARÇA !!!' : `⚽ But de ${state.homeName}`;
      notifs.push([goalKey, dHome > 1 ? `${base} (x${dHome})` : base, scoreLine]);
    }
    if (dAway > 0) {
      const base = !isBarcaHome ? '⚽ BUT DU BARÇA !!!' : `⚽ But de ${state.awayName}`;
      notifs.push([goalKey, dAway > 1 ? `${base} (x${dAway})` : base, scoreLine]);
    }

    if ((prev.status === 'IN_PLAY' || prev.status === 'PAUSED') && state.status === 'FINISHED') {
      notifs.push([`FT-${sched.eventId}-${state.homeScore}-${state.awayScore}`,
        '🏁 Fin du match', `Score final : ${scoreLine}`]);
    }

    if (notifs.length && env.TEST_MUTE_PUSH !== '1') {
      let tokens = null;
      for (const [key, title, body] of notifs) {
        if (!(await claimNotif(env, token, key))) continue; // un téléphone a déjà émis
        if (tokens === null) tokens = await fetchPushTokens(env, token);
        await sendPush(tokens, title, body);
      }
    }
  }

  return `écrit ${state.homeScore}-${state.awayScore} (${state.status})`;
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      tick(env).then(
        (r) => console.log('[sentinelle]', r),
        (e) => console.error('[sentinelle] erreur', e?.message ?? e)
      )
    );
    // Purge des comptes non vérifiés (verrou horaire interne). Isolée de la
    // sentinelle : une erreur ici ne doit pas empêcher le suivi du score.
    ctx.waitUntil(
      sweepUnverified(env).then(
        (r) => console.log('[sweep]', r),
        (e) => console.error('[sweep] erreur', e?.message ?? e)
      )
    );
  },

  async fetch(req, env) {
    const url = new URL(req.url);

    // Préflight CORS pour l'appel depuis l'app.
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // Mail de vérification d'adresse en français (voir verifyEmail.js).
    if (url.pathname === '/verify-email') {
      try {
        return await handleVerifyEmail(req, env);
      } catch (e) {
        console.error('[verify-email]', e?.message ?? e);
        return new Response(JSON.stringify({ error: 'send-failed' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
    }

    // Endpoint manuel pour tester la sentinelle sans attendre le cron : GET /run
    if (url.pathname !== '/run') return new Response('sentinelle score live — GET /run', { status: 200 });
    try {
      return new Response(await tick(env), { status: 200 });
    } catch (e) {
      return new Response(`erreur: ${e?.message ?? e}`, { status: 500 });
    }
  },
};
