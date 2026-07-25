import React from 'react';
import { Text, StyleSheet, Linking } from 'react-native';
import {
  collection, query, orderBy, startAt, endAt, limit, getDocs, getDoc, doc, documentId,
} from 'firebase/firestore';
import { db } from '../config/firebase';

export interface MentionRef {
  id: string;
  username: string;
}

export interface MentionSuggestion {
  id: string;
  username: string;
  avatar: string;
  photoBase64?: string;
}

export interface RenderOptions {
  /** Rendre les URLs (http(s)://…, www.…) cliquables. Réservé aux PUBLICATIONS. */
  linkifyUrls?: boolean;
}

// URLs avec schéma explicite ou préfixe www. On NE matche PAS les domaines nus
// (« foo.com ») pour éviter les faux positifs (« e.g. », « 3.5 », emails…).
const URL_RE = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
// Ponctuation de fin à exclure de l'URL (« …/video). » → l'URL s'arrête avant « ). »).
const TRAILING_PUNCT = /[.,!?;:)\]}'"»]+$/;

function findUrlSpans(content: string): { start: number; end: number; url: string }[] {
  const spans: { start: number; end: number; url: string }[] = [];
  URL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = URL_RE.exec(content)) !== null) {
    let display = m[0];
    const trailing = TRAILING_PUNCT.exec(display);
    if (trailing) display = display.slice(0, display.length - trailing[0].length);
    if (!display) continue;
    const url = /^www\./i.test(display) ? `https://${display}` : display;
    spans.push({ start: m.index, end: m.index + display.length, url });
  }
  return spans;
}

type Span =
  | { start: number; end: number; kind: 'mention'; userId: string }
  | { start: number; end: number; kind: 'link'; url: string };

// Rend un texte de post/commentaire :
//  - les @mentions réellement enregistrées → bleu, cliquables vers le profil ;
//  - (si options.linkifyUrls) les liens → bleu souligné, ouverts dans le navigateur.
// On matche les mentions sur les pseudos EXACTS de `mentionedUsers` (jamais /@\w+/) car les
// pseudos peuvent contenir accents/espaces/ç. En cas de chevauchement (ex. une URL TikTok
// « …/@user/… »), le span qui commence le plus tôt gagne → l'URL n'est pas cassée.
export function renderWithMentions(
  content: string,
  mentionedUsers: MentionRef[] | undefined,
  onPressUser: (userId: string) => void,
  options?: RenderOptions,
): React.ReactNode {
  const spans: Span[] = [];

  if (mentionedUsers?.length) {
    const ordered = [...mentionedUsers].sort((a, b) => b.username.length - a.username.length);
    const escaped = ordered.map((m) => m.username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const re = new RegExp(`@(${escaped.join('|')})`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const found = mentionedUsers.find((u) => u.username === m![1]);
      if (found) spans.push({ start: m.index, end: m.index + m[0].length, kind: 'mention', userId: found.id });
    }
  }

  if (options?.linkifyUrls) {
    for (const u of findUrlSpans(content)) {
      spans.push({ start: u.start, end: u.end, kind: 'link', url: u.url });
    }
  }

  if (!spans.length) return content;

  // Tri par position + suppression des chevauchements (le premier commencé gagne).
  spans.sort((a, b) => a.start - b.start);
  const kept: Span[] = [];
  let cursor = 0;
  for (const s of spans) {
    if (s.start < cursor) continue;
    kept.push(s);
    cursor = s.end;
  }

  const nodes: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const s of kept) {
    if (s.start > last) nodes.push(<Text key={key++}>{content.slice(last, s.start)}</Text>);
    const label = content.slice(s.start, s.end);
    if (s.kind === 'mention') {
      nodes.push(
        <Text key={key++} style={styles.mention} onPress={() => onPressUser(s.userId)}>{label}</Text>,
      );
    } else {
      nodes.push(
        <Text key={key++} style={styles.link} onPress={() => openUrl(s.url)}>{label}</Text>,
      );
    }
    last = s.end;
  }
  if (last < content.length) nodes.push(<Text key={key++}>{content.slice(last)}</Text>);
  return nodes;
}

function openUrl(url: string) {
  Linking.openURL(url).catch(() => {});
}

// Recherche d'utilisateurs par PRÉFIXE de pseudo, insensible à la casse.
// Firestore ne sait pas faire de recherche casse-insensible sur un champ : on s'appuie
// donc sur la collection /usernames dont la clé de doc EST le pseudo normalisé
// (`trim().toLowerCase()`, cf. usernameKey() dans AuthContext — À GARDER SYNCHRO) et qui
// est en lecture publique. On fait un range sur le documentId, puis on lit users/{uid}
// pour l'avatar / la photo / la casse d'affichage.
export async function searchUsersByPrefix(
  term: string,
  excludeUserId?: string,
): Promise<MentionSuggestion[]> {
  const key = term.trim().toLowerCase();
  if (!key) return [];
  const snap = await getDocs(query(
    collection(db, 'usernames'),
    orderBy(documentId()),
    startAt(key),
    endAt(key + ''),
    limit(8),
  ));
  const uids = snap.docs
    .map((d) => d.data()?.uid as string | undefined)
    .filter((u): u is string => !!u && u !== excludeUserId)
    .slice(0, 6);
  const results = await Promise.all(uids.map(async (uid): Promise<MentionSuggestion | null> => {
    try {
      const us = await getDoc(doc(db, 'users', uid));
      if (!us.exists()) return null;
      const d = us.data();
      return {
        id: uid,
        username: d.username as string,
        avatar: (d.avatar as string) ?? '🦁',
        photoBase64: d.photoBase64 as string | undefined,
      };
    } catch {
      return null;
    }
  }));
  return results.filter((u): u is MentionSuggestion => u !== null);
}

const styles = StyleSheet.create({
  mention: { color: '#4A9EFF', fontWeight: '600' },
  link: { color: '#4A9EFF', textDecorationLine: 'underline' },
});
