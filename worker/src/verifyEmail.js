/**
 * Envoi du mail de vérification d'adresse — en français, depuis notre domaine.
 *
 * Pourquoi ce détour par le Worker : les modèles d'e-mail de Firebase Auth sont
 * VERROUILLÉS (sujet + corps), impossible de les traduire ni par la console ni par
 * l'API. On génère donc nous-mêmes le lien de vérification et on envoie notre propre
 * mail HTML via Resend (déjà configuré pour legrosromain.fr).
 *
 * Sécurité : l'app envoie son ID token Firebase. On le valide (accounts:lookup) et on
 * n'envoie le lien QU'À l'adresse de ce compte — impossible de déclencher un mail vers
 * une adresse arbitraire (pas d'email bombing). Un court cooldown par compte limite le
 * renvoi en boucle.
 *
 * Générer le lien SANS l'envoyer (`returnOobLink: true`) exige des droits admin : d'où
 * le compte de service (SA_CLIENT_EMAIL / SA_PRIVATE_KEY), et non le bot email/mot de
 * passe du reste du worker.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const FROM = 'BCN Social <noreply@legrosromain.fr>';
const REPLY_TO = 'legrosromain27@gmail.com';
const RESEND_COOLDOWN_MS = 45_000;

// ─── base64url ──────────────────────────────────────────────────────────────────
function b64url(bytes) {
  let bin = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlStr(str) {
  return b64url(new TextEncoder().encode(str));
}

// PEM PKCS8 → ArrayBuffer DER
function pemToDer(pem) {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');
  const bin = atob(body);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

// ─── Jeton d'accès du compte de service (JWT RS256 → OAuth2) ─────────────────────
let cachedAccessToken = null; // { token, expiresAt } — réutilisé entre requêtes chaudes
// Portée `cloud-platform` : couvre à la fois Identity Toolkit (génération de lien,
// suppression de comptes) ET Firestore (purge des docs des comptes supprimés).
export async function serviceAccountToken(env) {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }
  const clientEmail = env.SA_CLIENT_EMAIL;
  // La clé peut être stockée avec des \n littéraux (copié depuis le JSON) : on les
  // restaure en vraies fins de ligne.
  const privateKeyPem = (env.SA_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!clientEmail || !privateKeyPem) throw new Error('service account manquant');

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64urlStr(JSON.stringify(header))}.${b64urlStr(JSON.stringify(claim))}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${b64url(sig)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(`oauth SA échoué: ${json.error_description || json.error || res.status}`);
  }
  cachedAccessToken = {
    token: json.access_token,
    expiresAt: Date.now() + Number(json.expires_in ?? 3600) * 1000,
  };
  return cachedAccessToken.token;
}

// ─── Vérifie l'ID token de l'appelant et renvoie son compte ─────────────────────
async function lookupAccount(env, idToken) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    },
  );
  const json = await res.json();
  const u = json?.users?.[0];
  if (!res.ok || !u) return null;
  return { uid: u.localId, email: u.email, emailVerified: !!u.emailVerified };
}

// ─── Génère le lien de vérification (droits admin) ──────────────────────────────
async function generateVerifyLink(env, accessToken, email) {
  // En mode ADMIN (Bearer + returnOobLink), il faut l'endpoint PROJET-SCOPED et
  // SURTOUT PAS de `?key=` : passer la clé API ici déclenche
  // « API Key and authentication credential are from different projects ».
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${env.PROJECT_ID}/accounts:sendOobCode`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ requestType: 'VERIFY_EMAIL', email, returnOobLink: true }),
    },
  );
  const json = await res.json();
  if (!res.ok || !json.oobLink) {
    throw new Error(`génération du lien échouée: ${json.error?.message || res.status}`);
  }
  return json.oobLink;
}

// ─── Mail HTML français ─────────────────────────────────────────────────────────
function verifyEmailHtml(link) {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#0e0e0e;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0e0e0e;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#161616;border:1px solid #262626;border-radius:16px;overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#00336B,#001B38);padding:28px 28px 20px;text-align:center;">
          <div style="font-size:26px;font-weight:800;color:#ffffff;letter-spacing:.5px;">BCN Social</div>
        </td></tr>
        <tr><td style="padding:28px;">
          <h1 style="margin:0 0 12px;font-size:20px;color:#ffffff;">Confirme ton adresse</h1>
          <p style="margin:0 0 20px;font-size:15px;line-height:22px;color:#c8c8c8;">
            Bienvenue&nbsp;! Il ne reste qu'une étape&nbsp;: confirme ton adresse e-mail pour activer ton compte.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 22px;">
            <tr><td style="border-radius:10px;background:#A50044;">
              <a href="${link}" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">Confirmer mon adresse</a>
            </td></tr>
          </table>
          <p style="margin:0 0 6px;font-size:12px;color:#8a8a8a;">Si le bouton ne fonctionne pas, copie ce lien dans ton navigateur&nbsp;:</p>
          <p style="margin:0 0 20px;font-size:12px;color:#5c9ce6;word-break:break-all;">${link}</p>
          <p style="margin:0;font-size:12px;line-height:18px;color:#6a6a6a;">
            Si tu n'es pas à l'origine de cette inscription, ignore simplement ce message.
          </p>
        </td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid #262626;text-align:center;">
          <span style="font-size:11px;color:#5a5a5a;">BCN Social — l'appli des fans du Barça</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function sendViaResend(env, to, link) {
  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.RESEND_API_KEY}` },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      reply_to: REPLY_TO,
      subject: 'Confirme ton adresse — BCN Social',
      html: verifyEmailHtml(link),
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`resend échoué: ${res.status} ${t.slice(0, 200)}`);
  }
}

/**
 * Point d'entrée HTTP. Corps attendu : { idToken }.
 * Réponses : 200 {ok:true} · 200 {ok:true, alreadyVerified:true} · 4xx/5xx {error}.
 */
export async function handleVerifyEmail(req, env) {
  if (req.method !== 'POST') {
    return json({ error: 'method' }, 405);
  }
  let body;
  try { body = await req.json(); } catch { return json({ error: 'json' }, 400); }
  const idToken = body?.idToken;
  if (!idToken) return json({ error: 'idToken manquant' }, 400);

  const acct = await lookupAccount(env, idToken);
  if (!acct || !acct.email) return json({ error: 'compte introuvable' }, 401);
  if (acct.emailVerified) return json({ ok: true, alreadyVerified: true });

  // Cooldown par compte (KV) — évite le spam de renvois.
  const cdKey = `verifcd:${acct.uid}`;
  if (env.STATE) {
    const last = await env.STATE.get(cdKey);
    if (last && Date.now() - Number(last) < RESEND_COOLDOWN_MS) {
      return json({ ok: true, throttled: true });
    }
  }

  const accessToken = await serviceAccountToken(env);
  const link = await generateVerifyLink(env, accessToken, acct.email);
  await sendViaResend(env, acct.email, link);

  if (env.STATE) {
    await env.STATE.put(cdKey, String(Date.now()), { expirationTtl: 120 });
  }
  return json({ ok: true });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
