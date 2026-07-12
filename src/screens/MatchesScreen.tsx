import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Image,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme';
import { Match, Team } from '../types';
import { useFeaturedMatch } from '../context/MatchContext';

const API_TOKEN = '3000b1fbd35442c4924a4b1c560eb630';
const BARCA_ID  = 81;

const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isBarca(team: Team) {
  return team.name.toLowerCase().includes('barcelona');
}

function formatDay(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
}

function getResult(match: Match) {
  if (match.status !== 'finished') return null;
  const home = isBarca(match.homeTeam);
  const b = home ? match.homeScore! : match.awayScore!;
  const o = home ? match.awayScore! : match.homeScore!;
  if (b > o) return { label: 'V', color: '#22C55E' };
  if (b === o) return { label: 'N', color: '#EAB308' };
  return { label: 'D', color: '#EF4444' };
}

// ─── Composants Calendrier ────────────────────────────────────────────────────

function TeamLogo({ team }: { team: Team }) {
  const isImg = team.logo.startsWith('http') || team.logo.startsWith('file://');
  return (
    <View style={styles.teamCol}>
      {isImg ? (
        <Image source={{ uri: team.logo }} style={styles.logo} resizeMode="contain" />
      ) : (
        <View style={[styles.logo, { backgroundColor: team.color ?? '#333', borderRadius: 4, alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={{ color: '#fff', fontSize: 9, fontWeight: '900' }}>{team.shortName}</Text>
        </View>
      )}
      <Text style={styles.teamName}>{team.shortName}</Text>
    </View>
  );
}

function MatchCard({ match }: { match: Match }) {
  const result = getResult(match);
  return (
    <View style={styles.card}>
      <View style={[
        styles.cardAccent,
        match.status === 'live' && { backgroundColor: '#EF4444' },
        match.status === 'finished' && result && { backgroundColor: result.color },
        match.status === 'upcoming' && { backgroundColor: Colors.primary },
      ]} />
      <View style={styles.cardContent}>
        <Text style={styles.cardCompetition}>{match.competition}</Text>
        <View style={styles.cardCenter}>
          <TeamLogo team={match.homeTeam} />
          <View style={styles.scoreCol}>
            {match.status === 'finished' ? (
              <>
                <Text style={styles.score}>{match.homeScore}<Text style={styles.scoreSep}> — </Text>{match.awayScore}</Text>
                {result && (
                  <View style={[styles.resultBadge, { backgroundColor: result.color + '22', borderColor: result.color }]}>
                    <Text style={[styles.resultBadgeText, { color: result.color }]}>
                      {result.label === 'V' ? 'Victoire' : result.label === 'N' ? 'Nul' : 'Défaite'}
                    </Text>
                  </View>
                )}
              </>
            ) : match.status === 'live' ? (
              <>
                <Text style={[styles.score, { color: '#EF4444' }]}>{match.homeScore ?? 0} — {match.awayScore ?? 0}</Text>
                <View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.livePillText}>LIVE</Text></View>
              </>
            ) : (
              <>
                <Text style={styles.matchTime}>{formatTime(match.date)}</Text>
                <Text style={styles.vsLabel}>VS</Text>
              </>
            )}
          </View>
          <TeamLogo team={match.awayTeam} />
        </View>
        <Text style={styles.cardDate}>{formatDay(match.date)}</Text>
      </View>
    </View>
  );
}

// ─── Classements ──────────────────────────────────────────────────────────────

interface StandingRow {
  position: number;
  team: { id: number; name: string; shortName?: string; tla?: string; crest: string };
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

function StandingTableRow({ row, isBarcaTeam, showFull }: { row: StandingRow; isBarcaTeam: boolean; showFull: boolean }) {
  const name = row.team.tla || row.team.shortName || row.team.name.slice(0, 3).toUpperCase();
  return (
    <View style={[stStyles.row, isBarcaTeam && stStyles.barcaRow]}>
      {isBarcaTeam && <View style={stStyles.barcaAccent} />}
      <Text style={[stStyles.pos, isBarcaTeam && stStyles.barcaText]}>{row.position}</Text>
      {row.team.crest ? (
        <Image source={{ uri: row.team.crest }} style={stStyles.crest} resizeMode="contain" />
      ) : (
        <View style={[stStyles.crest, { backgroundColor: '#222', borderRadius: 3 }]} />
      )}
      <Text style={[stStyles.name, isBarcaTeam && stStyles.barcaText]} numberOfLines={1}>{row.team.name}</Text>
      {showFull && (
        <>
          <Text style={stStyles.cell}>{row.playedGames}</Text>
          <Text style={stStyles.cell}>{row.won}</Text>
          <Text style={stStyles.cell}>{row.draw}</Text>
          <Text style={stStyles.cell}>{row.lost}</Text>
          <Text style={stStyles.cell}>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</Text>
        </>
      )}
      <Text style={[stStyles.pts, isBarcaTeam && stStyles.barcaText]}>{row.points}</Text>
    </View>
  );
}

function StandingTable({ rows, title, icon, color }: { rows: StandingRow[]; title: string; icon: keyof typeof Ionicons.glyphMap; color: string }) {
  const [expanded, setExpanded] = useState(false);
  const display = expanded ? rows : rows.slice(0, 10);

  return (
    <View style={stStyles.card}>
      <View style={[stStyles.cardHeader, { borderLeftColor: color }]}>
        <Ionicons name={icon} size={16} color={color} />
        <Text style={stStyles.cardTitle}>{title}</Text>
      </View>

      {/* En-tête tableau */}
      <View style={stStyles.tableHeader}>
        <Text style={stStyles.thPos}>#</Text>
        <View style={{ width: 22 }} />
        <Text style={[stStyles.thName]}>Équipe</Text>
        <Text style={stStyles.thCell}>J</Text>
        <Text style={stStyles.thCell}>V</Text>
        <Text style={stStyles.thCell}>N</Text>
        <Text style={stStyles.thCell}>D</Text>
        <Text style={stStyles.thCell}>+/-</Text>
        <Text style={[stStyles.thCell, stStyles.thPts]}>Pts</Text>
      </View>

      {display.map(row => (
        <StandingTableRow
          key={row.team.id}
          row={row}
          isBarcaTeam={row.team.id === BARCA_ID}
          showFull
        />
      ))}

      {rows.length > 10 && (
        <TouchableOpacity style={stStyles.expandBtn} onPress={() => setExpanded(v => !v)} activeOpacity={0.7}>
          <Text style={stStyles.expandText}>{expanded ? 'Réduire' : `Voir les ${rows.length - 10} autres équipes`}</Text>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={13} color={Colors.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// Tableau éliminatoire (bracket)
interface KnockoutMatch {
  id: string;
  homeTeam: string;
  homeCrest?: string;
  homeScore?: number;
  awayTeam: string;
  awayCrest?: string;
  awayScore?: number;
  stage: string;
  date?: string;
}

function KnockoutBracket({ matches, title, icon, color }: { matches: KnockoutMatch[]; title: string; icon: keyof typeof Ionicons.glyphMap; color: string }) {
  const byStage = new Map<string, KnockoutMatch[]>();
  for (const m of matches) {
    if (!byStage.has(m.stage)) byStage.set(m.stage, []);
    byStage.get(m.stage)!.push(m);
  }

  return (
    <View style={stStyles.card}>
      <View style={[stStyles.cardHeader, { borderLeftColor: color }]}>
        <Ionicons name={icon} size={16} color={color} />
        <Text style={stStyles.cardTitle}>{title}</Text>
      </View>
      {Array.from(byStage.entries()).map(([stage, stageMatches]) => (
        <View key={stage}>
          <Text style={stStyles.stageLabel}>{formatStageName(stage)}</Text>
          {stageMatches.map(m => (
            <View key={m.id} style={stStyles.knockoutRow}>
              <View style={stStyles.knockoutTeam}>
                {m.homeCrest ? <Image source={{ uri: m.homeCrest }} style={stStyles.knockoutCrest} resizeMode="contain" /> : null}
                <Text style={stStyles.knockoutName} numberOfLines={1}>{m.homeTeam}</Text>
              </View>
              <View style={stStyles.knockoutScore}>
                <Text style={stStyles.knockoutScoreText}>
                  {m.homeScore != null ? `${m.homeScore} - ${m.awayScore}` : 'vs'}
                </Text>
              </View>
              <View style={[stStyles.knockoutTeam, { alignItems: 'flex-end' }]}>
                <Text style={stStyles.knockoutName} numberOfLines={1}>{m.awayTeam}</Text>
                {m.awayCrest ? <Image source={{ uri: m.awayCrest }} style={stStyles.knockoutCrest} resizeMode="contain" /> : null}
              </View>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function formatStageName(stage: string): string {
  const map: Record<string, string> = {
    FINAL: 'Finale',
    SEMI_FINALS: 'Demi-finales',
    QUARTER_FINALS: 'Quarts de finale',
    LAST_16: 'Huitièmes de finale',
    LAST_32: 'Seizièmes de finale',
    LAST_64: 'Trente-deuxièmes de finale',
    GROUP_STAGE: 'Phase de groupes',
    LEAGUE_PHASE: 'Phase de ligue',
    ROUND_OF_16: 'Huitièmes',
    PLAYOFF_ROUND: 'Barrages',
  };
  return map[stage] ?? stage;
}

// ─── Hook standings ────────────────────────────────────────────────────────────

interface StandingsState {
  loading: boolean;
  laliga: StandingRow[];
  laligaSeason: string;
  cl: { type: 'table'; rows: StandingRow[] } | { type: 'bracket'; matches: KnockoutMatch[] } | null;
}

const KNOCKOUT_STAGES = ['FINAL', 'SEMI_FINALS', 'QUARTER_FINALS', 'LAST_16', 'LAST_32', 'ROUND_OF_16', 'PLAYOFF_ROUND'];

function useStandings(): StandingsState {
  const [state, setState] = useState<StandingsState>({ loading: true, laliga: [], laligaSeason: '', cl: null });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const headers = { 'X-Auth-Token': API_TOKEN };

      const [laligaRes, clRes] = await Promise.allSettled([
        fetch('https://api.football-data.org/v4/competitions/PD/standings', { headers }).then(r => r.json()),
        fetch('https://api.football-data.org/v4/competitions/CL/standings', { headers }).then(r => r.json()),
      ]);

      if (cancelled) return;

      let laliga: StandingRow[] = [];
      let cl: StandingsState['cl'] = null;

      let laligaSeason = '';
      if (laligaRes.status === 'fulfilled') {
        const d = laligaRes.value;
        const total = d.standings?.find((s: any) => s.type === 'TOTAL');
        if (total?.table) laliga = total.table;
        const start = d.season?.startDate?.slice(0, 4);
        if (start) {
          let startYear = parseInt(start);
          // L'API peut déjà pointer sur la saison suivante en off-season (juil/août)
          // alors que les données affichées sont de la saison qui vient de se terminer.
          // Détection : matchs joués ≥ 30 mais startYear >= année actuelle → données de l'ancienne saison
          const gamesPlayed = (laliga[0] as any)?.playedGames ?? 0;
          const currentYear = new Date().getFullYear();
          if (gamesPlayed >= 30 && startYear >= currentYear) startYear -= 1;
          laligaSeason = `${startYear}/${String(startYear + 1).slice(2)}`;
        }
      }

      if (clRes.status === 'fulfilled') {
        const d = clRes.value;
        const standings = d.standings ?? [];
        const leaguePhase = standings.find((s: any) => s.type === 'TOTAL' && s.stage === 'LEAGUE_PHASE');
        const knockout = standings.find((s: any) => KNOCKOUT_STAGES.includes(s.stage));

        if (leaguePhase?.table?.length) {
          cl = { type: 'table', rows: leaguePhase.table };
        } else if (knockout) {
          // Fetch les matchs pour construire le bracket
          try {
            const mRes = await fetch('https://api.football-data.org/v4/competitions/CL/matches?stage=KNOCKOUT', { headers });
            const mData = await mRes.json();
            const matches: KnockoutMatch[] = (mData.matches ?? []).map((m: any) => ({
              id: String(m.id),
              homeTeam: m.homeTeam?.name ?? '?',
              homeCrest: m.homeTeam?.crest,
              homeScore: m.score?.fullTime?.home ?? undefined,
              awayTeam: m.awayTeam?.name ?? '?',
              awayCrest: m.awayTeam?.crest,
              awayScore: m.score?.fullTime?.away ?? undefined,
              stage: m.stage,
              date: m.utcDate,
            }));
            if (matches.length) cl = { type: 'bracket', matches };
          } catch {}
        }
      }

      setState({ loading: false, laliga, laligaSeason, cl });
    }

    load().catch(() => setState(s => ({ ...s, loading: false })));
    return () => { cancelled = true; };
  }, []);

  return state;
}

// ─── Onglet Classements ────────────────────────────────────────────────────────

function StandingsTab() {
  const { loading, laliga, laligaSeason, cl } = useStandings();

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.primary} />
        <Text style={styles.loadingText}>Chargement des classements...</Text>
      </View>
    );
  }

  const hasContent = laliga.length > 0 || cl != null;

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 14, gap: 16, paddingBottom: 80 }}>
      {laliga.length > 0 && (
        <StandingTable
          rows={laliga}
          title={laligaSeason ? `La Liga · ${laligaSeason}` : 'La Liga'}
          icon="football"
          color="#EE2A35"
        />
      )}

      {cl?.type === 'table' && (
        <StandingTable
          rows={cl.rows}
          title="Champions League — Phase de ligue"
          icon="star"
          color="#0B2C5C"
        />
      )}
      {cl?.type === 'bracket' && (
        <KnockoutBracket
          matches={cl.matches}
          title="Champions League"
          icon="star"
          color="#0B2C5C"
        />
      )}

      {!hasContent && (
        <View style={styles.centered}>
          <Ionicons name="trophy-outline" size={40} color={Colors.textMuted} />
          <Text style={styles.errorText}>Classements non disponibles pour le moment</Text>
        </View>
      )}
    </ScrollView>
  );
}

// ─── Screen principal ──────────────────────────────────────────────────────────

type Tab = 'calendar' | 'standings';

export default function MatchesScreen() {
  const now = new Date();
  const { monthlyMatches, isLoadingMonthly, monthlyError, retryMonthly } = useFeaturedMatch();
  const [activeTab, setActiveTab] = useState<Tab>('calendar');

  const upcoming = monthlyMatches.filter(m => m.status !== 'finished');
  const finished = monthlyMatches
    .filter(m => m.status === 'finished')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      <LinearGradient colors={['#004D98', '#002D5A']} style={styles.header}>
        <Ionicons name="calendar" size={22} color="#fff" />
        <Text style={styles.headerTitle}>Calendrier</Text>
        <Text style={styles.headerSub}>
          {MONTH_NAMES[now.getMonth()]} {now.getFullYear()}
        </Text>
      </LinearGradient>

      {/* Onglets */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'calendar' && styles.tabActive]}
          onPress={() => setActiveTab('calendar')}
          activeOpacity={0.8}
        >
          <Ionicons name="calendar-outline" size={15} color={activeTab === 'calendar' ? Colors.primary : Colors.textMuted} />
          <Text style={[styles.tabLabel, activeTab === 'calendar' && styles.tabLabelActive]}>Calendrier</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'standings' && styles.tabActive]}
          onPress={() => setActiveTab('standings')}
          activeOpacity={0.8}
        >
          <Ionicons name="podium-outline" size={15} color={activeTab === 'standings' ? Colors.primary : Colors.textMuted} />
          <Text style={[styles.tabLabel, activeTab === 'standings' && styles.tabLabelActive]}>Classements</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'calendar' ? (
        isLoadingMonthly ? (
          <View style={styles.centered}>
            <ActivityIndicator color={Colors.primary} size="large" />
            <Text style={styles.loadingText}>Chargement des matchs...</Text>
          </View>
        ) : monthlyError ? (
          <View style={styles.centered}>
            <Ionicons name="warning-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.errorText}>Impossible de charger les matchs</Text>
            <TouchableOpacity onPress={retryMonthly} style={styles.retryBtn} activeOpacity={0.8}>
              <Text style={styles.retryText}>Réessayer</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
            {monthlyMatches.length === 0 && (
              <View style={styles.centered}>
                <Ionicons name="calendar-outline" size={40} color={Colors.textMuted} />
                <Text style={styles.errorText}>Aucun match ce mois-ci</Text>
              </View>
            )}
            {upcoming.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>À venir</Text>
                {upcoming.map(m => <MatchCard key={m.id} match={m} />)}
              </>
            )}
            {finished.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Résultats</Text>
                {finished.map(m => <MatchCard key={m.id} match={m} />)}
              </>
            )}
            <View style={{ height: 80 }} />
          </ScrollView>
        )
      ) : (
        <StandingsTab />
      )}
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0A0A' },
  header: { paddingTop: 56, paddingBottom: 14, alignItems: 'center', gap: 2 },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#fff', letterSpacing: 1 },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: '600', textTransform: 'capitalize' },

  tabBar: { flexDirection: 'row', backgroundColor: '#111', borderBottomWidth: 1, borderBottomColor: '#1e1e1e' },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: Colors.primary },
  tabLabel: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  tabLabelActive: { color: Colors.primary, fontWeight: '700' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 80 },
  loadingText: { color: Colors.textMuted, fontSize: FontSize.sm, marginTop: 8 },
  errorText: { color: Colors.textSecondary, fontSize: FontSize.sm, textAlign: 'center' },
  retryBtn: { marginTop: 8, backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 },
  retryText: { color: '#fff', fontWeight: '700', fontSize: FontSize.sm },

  list: { paddingHorizontal: 14, paddingTop: 14 },
  sectionTitle: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, marginTop: 4 },

  card: { flexDirection: 'row', backgroundColor: '#141414', borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#222', overflow: 'hidden' },
  cardAccent: { width: 3, backgroundColor: Colors.primary },
  cardContent: { flex: 1, paddingVertical: 8, paddingHorizontal: 10, gap: 4, alignItems: 'center' },
  cardCompetition: { fontSize: 9, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  cardCenter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingHorizontal: 4 },
  teamCol: { alignItems: 'center', gap: 3, width: 52 },
  logo: { width: 32, height: 32 },
  teamName: { color: Colors.text, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  scoreCol: { flex: 1, alignItems: 'center', gap: 3 },
  score: { fontSize: 20, fontWeight: '900', color: '#fff', letterSpacing: 1 },
  scoreSep: { color: 'rgba(255,255,255,0.3)', fontSize: 18, fontWeight: '300' },
  matchTime: { fontSize: 16, fontWeight: '900', color: Colors.gold },
  vsLabel: { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.2)', letterSpacing: 2 },
  resultBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, borderWidth: 1 },
  resultBadgeText: { fontSize: 9, fontWeight: '700' },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EF444422', borderWidth: 1, borderColor: '#EF4444', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#EF4444' },
  livePillText: { color: '#EF4444', fontSize: 9, fontWeight: '800' },
  cardDate: { fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: '600', textTransform: 'capitalize' },
});

const stStyles = StyleSheet.create({
  card: { backgroundColor: '#141414', borderRadius: 14, borderWidth: 1, borderColor: '#1e1e1e', overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderBottomWidth: 1, borderBottomColor: '#1e1e1e', borderLeftWidth: 3 },
  cardTitle: { color: Colors.text, fontSize: 14, fontWeight: '800' },

  tableHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#0f0f0f' },
  thPos: { width: 22, color: Colors.textMuted, fontSize: 10, fontWeight: '700', textAlign: 'center' },
  thName: { flex: 1, color: Colors.textMuted, fontSize: 10, fontWeight: '700', marginLeft: 26 },
  thCell: { width: 24, color: Colors.textMuted, fontSize: 10, fontWeight: '700', textAlign: 'center' },
  thPts: { color: Colors.text, fontWeight: '800' },

  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#181818' },
  barcaRow: { backgroundColor: Colors.primary + '10' },
  barcaAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: Colors.primary },
  barcaText: { color: '#fff', fontWeight: '800' },

  pos: { width: 22, color: Colors.textMuted, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  crest: { width: 20, height: 20, marginHorizontal: 4 },
  name: { flex: 1, color: Colors.textSecondary, fontSize: 12, fontWeight: '600' },
  cell: { width: 24, color: Colors.textMuted, fontSize: 11, textAlign: 'center' },
  pts: { width: 24, color: Colors.text, fontSize: 13, fontWeight: '800', textAlign: 'center' },

  expandBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, padding: 12, borderTopWidth: 1, borderTopColor: '#1e1e1e' },
  expandText: { color: Colors.textMuted, fontSize: 12, fontWeight: '600' },

  stageLabel: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#0f0f0f', color: Colors.textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  knockoutRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#181818' },
  knockoutTeam: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  knockoutCrest: { width: 20, height: 20 },
  knockoutName: { flex: 1, color: Colors.textSecondary, fontSize: 11, fontWeight: '600' },
  knockoutScore: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#1e1e1e', borderRadius: 8, marginHorizontal: 8 },
  knockoutScoreText: { color: Colors.text, fontSize: 13, fontWeight: '800' },
});
