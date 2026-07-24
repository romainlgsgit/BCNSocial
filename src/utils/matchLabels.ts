import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BARCA_LEAGUES } from '../context/MatchContext';

// Libellé d'un match ("FCB – RMA") pour les paris dont le match n'est plus dans
// le calendrier chargé (les vieux paris survivent aux matchs, qui eux sortent de
// `monthlyMatches` une fois joués). Résolu via ESPN — gratuit, sans clé, donc
// aucune lecture Firestore (quota partagé, cf. optimisations du feed).

const CACHE_KEY = 'cache_match_labels_v1';

export const formatMatchLabel = (home: string, away: string) => `${home} – ${away}`;

const shortNameOf = (competitor: any): string => {
  const team = competitor?.team ?? {};
  const displayName: string = team.displayName ?? team.name ?? '';
  return team.abbreviation ?? displayName.slice(0, 3).toUpperCase();
};

// On ne connaît pas la compétition d'un matchId isolé : on interroge toutes les
// ligues où le Barça joue et on garde la première réponse exploitable.
async function fetchLabelFromEspn(matchId: string): Promise<string | null> {
  try {
    const responses = await Promise.all(
      BARCA_LEAGUES.map(league =>
        fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/summary?event=${matchId}`)
          .then(r => (r.ok ? r.json() : null))
          .catch(() => null)
      )
    );

    for (const json of responses) {
      const competitors = json?.header?.competitions?.[0]?.competitors ?? [];
      if (competitors.length < 2) continue;
      const home = competitors.find((c: any) => c.homeAway === 'home') ?? competitors[0];
      const away = competitors.find((c: any) => c.homeAway === 'away') ?? competitors[1];
      const h = shortNameOf(home);
      const a = shortNameOf(away);
      if (h && a) return formatMatchLabel(h, a);
    }
  } catch {}
  return null;
}

/**
 * Résout les libellés des matchs demandés (cache disque permanent → ESPN).
 * Un id qui échoue n'est pas retenté pendant la session.
 */
export function useMatchLabels(matchIds: string[]): Record<string, string> {
  const [labels, setLabels] = useState<Record<string, string>>({});
  const attemptedRef = useRef<Set<string>>(new Set());
  const key = matchIds.join(',');

  useEffect(() => {
    if (!matchIds.length) return;
    let cancelled = false;

    (async () => {
      let cache: Record<string, string> = {};
      try {
        cache = JSON.parse((await AsyncStorage.getItem(CACHE_KEY)) ?? '{}');
      } catch {}
      if (cancelled) return;

      const fromCache = matchIds.filter(id => cache[id]);
      if (fromCache.length) {
        setLabels(prev => ({ ...prev, ...Object.fromEntries(fromCache.map(id => [id, cache[id]])) }));
      }

      const missing = matchIds.filter(id => !cache[id] && !attemptedRef.current.has(id));
      if (!missing.length) return;
      missing.forEach(id => attemptedRef.current.add(id));

      const resolved = await Promise.all(
        missing.map(async id => [id, await fetchLabelFromEspn(id)] as const)
      );
      if (cancelled) return;

      const found = Object.fromEntries(
        resolved.filter((entry): entry is readonly [string, string] => entry[1] !== null)
      );
      if (!Object.keys(found).length) return;

      setLabels(prev => ({ ...prev, ...found }));
      try {
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ ...cache, ...found }));
      } catch {}
    })();

    return () => { cancelled = true; };
  }, [key]);

  return labels;
}
