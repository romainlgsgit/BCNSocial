import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Modal,
  TextInput,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { collection, query, where, getDocs, doc, updateDoc, writeBatch, limit } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme';
import VerifiedBadge from '../components/VerifiedBadge';
import { useFeaturedMatch } from '../context/MatchContext';
import { useProno, BetPrediction, MatchOdds, PronoMatch } from '../context/PronoContext';
import { useAuth } from '../context/AuthContext';
import { useRatings } from '../context/RatingsContext';
import { PLAYERS } from '../data/mockData';

import { Team, Match } from '../types';

// ─── Club Presets ──────────────────────────────────────────────────────────────

const CLUBS: (Team & { color: string })[] = [
  { name: 'FC Barcelona',       shortName: 'FCB', logo: '🔵🔴', color: '#A50044' },
  { name: 'Real Madrid',        shortName: 'RMA', logo: '⚪',   color: '#FEBE10' },
  { name: 'Atletico Madrid',    shortName: 'ATM', logo: '🔴⚪', color: '#CB3524' },
  { name: 'PSG',                shortName: 'PSG', logo: '🔵🔴', color: '#004170' },
  { name: 'Man. City',          shortName: 'MCI', logo: '🔵',   color: '#6CABDD' },
  { name: 'Liverpool',          shortName: 'LIV', logo: '🔴',   color: '#C8102E' },
  { name: 'Arsenal',            shortName: 'ARS', logo: '🔴',   color: '#EF0107' },
  { name: 'Chelsea',            shortName: 'CHE', logo: '🔵',   color: '#034694' },
  { name: 'Man. United',        shortName: 'MUN', logo: '🔴',   color: '#DA291C' },
  { name: 'Tottenham',          shortName: 'TOT', logo: '⚪',   color: '#132257' },
  { name: 'Bayern Munich',      shortName: 'BAY', logo: '🔴',   color: '#DC052D' },
  { name: 'Borussia Dortmund',  shortName: 'BVB', logo: '🟡⚫', color: '#FDE100' },
  { name: 'Juventus',           shortName: 'JUV', logo: '⚫⚪', color: '#1D1D1B' },
  { name: 'Inter Milan',        shortName: 'INT', logo: '🔵⚫', color: '#010E80' },
  { name: 'AC Milan',           shortName: 'MIL', logo: '🔴⚫', color: '#FB090B' },
  { name: 'SL Benfica',         shortName: 'BEN', logo: '🔴',   color: '#E4001B' },
  { name: 'Porto',              shortName: 'POR', logo: '🔵',   color: '#003087' },
  { name: 'Ajax',               shortName: 'AJX', logo: '🔴',   color: '#D2001F' },
  { name: 'Villarreal CF',      shortName: 'VIL', logo: '🟡',   color: '#FFC91C' },
  { name: 'Sevilla FC',         shortName: 'SEV', logo: '⚪',   color: '#D7282F' },
  { name: 'Valencia CF',        shortName: 'VAL', logo: '⚫',   color: '#EE7000' },
  { name: 'Athletic Bilbao',    shortName: 'ATH', logo: '🔴',   color: '#EE2523' },
  { name: 'Getafe CF',          shortName: 'GET', logo: '🔵',   color: '#005BAC' },
  { name: 'Osasuna',            shortName: 'OSA', logo: '🔴',   color: '#D0021B' },
  { name: 'Celtic',             shortName: 'CEL', logo: '🍀',   color: '#1B8B27' },
  { name: 'Rangers',            shortName: 'RAN', logo: '🔵',   color: '#1B458F' },
  { name: 'Bayer Leverkusen',   shortName: 'LEV', logo: '🔴',   color: '#E32221' },
  { name: 'RB Leipzig',         shortName: 'RBL', logo: '🔴⚪', color: '#DD0741' },
  { name: 'Galatasaray',        shortName: 'GAL', logo: '🔴🟡', color: '#E83020' },
  { name: 'Marseille',          shortName: 'OM',  logo: '🔵⚪', color: '#009BDE' },
  { name: 'Lyon',               shortName: 'OL',  logo: '🔴',   color: '#2C2B5E' },
];

const COMPETITIONS = ['La Liga', 'Champions League', 'Copa del Rey', 'Supercoupe', 'Amical'];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function isLightColor(hex: string) {
  const light = ['#FEBE10', '#FDE100', '#FFC91C', '#EE7000', '#6CABDD'];
  return light.some(c => hex.toUpperCase() === c.toUpperCase());
}

function isImageUri(logo?: string) {
  if (!logo) return false;
  return logo.startsWith('file://') || logo.startsWith('http') || logo.startsWith('data:');
}

function BadgePreview({ team, size = 48 }: { team: Partial<Team> & { color?: string }; size?: number }) {
  const bg = team.color ?? '#333';
  const textColor = isLightColor(bg) ? '#111' : '#fff';
  const fontSize = size <= 40 ? 9 : size <= 52 ? 11 : 14;
  const radius = size * 0.22;

  if (isImageUri(team.logo)) {
    return (
      <View style={[styles.badge, { width: size, height: size, borderRadius: radius, backgroundColor: bg }]}>
        <Image
          source={{ uri: team.logo }}
          style={{ width: size, height: size, borderRadius: radius }}
          resizeMode="contain"
        />
      </View>
    );
  }

  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: radius, backgroundColor: bg }]}>
      <Text style={{ color: textColor, fontWeight: '900', fontSize, letterSpacing: 0.3 }}>
        {team.shortName || '?'}
      </Text>
    </View>
  );
}

// ─── Club Picker Modal ─────────────────────────────────────────────────────────

function ClubPicker({ visible, onSelect, onClose }: {
  visible: boolean;
  onSelect: (club: Team & { color: string }) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = CLUBS.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.shortName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.pickerRoot}>
        <View style={styles.pickerHeader}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.pickerCloseText}>Fermer</Text>
          </TouchableOpacity>
          <Text style={styles.pickerTitle}>Choisir un club</Text>
          <View style={{ width: 56 }} />
        </View>

        <View style={styles.pickerSearchWrap}>
          <TextInput
            style={styles.pickerSearchInput}
            placeholder="Rechercher..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
        </View>

        <ScrollView contentContainerStyle={styles.pickerGrid} showsVerticalScrollIndicator={false}>
          {filtered.map(club => (
            <TouchableOpacity
              key={club.name}
              style={styles.pickerItem}
              onPress={() => { onSelect(club); setSearch(''); onClose(); }}
              activeOpacity={0.7}
            >
              <BadgePreview team={club} size={44} />
              <Text style={styles.pickerItemName} numberOfLines={2}>{club.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Team Editor ───────────────────────────────────────────────────────────────

function TeamEditor({ label, team, onChange }: {
  label: string;
  team: Team & { color?: string };
  onChange: (t: Team & { color?: string }) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);

  const pickLogo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission refusée', 'L\'accès à la galerie est nécessaire pour choisir un logo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) {
      onChange({ ...team, logo: result.assets[0].uri });
    }
  };

  return (
    <View style={styles.teamEditor}>
      <Text style={styles.sectionLabel}>{label}</Text>

      <TouchableOpacity style={styles.teamPickerRow} onPress={() => setShowPicker(true)} activeOpacity={0.8}>
        <BadgePreview team={team} size={48} />
        <View style={{ flex: 1 }}>
          <Text style={styles.teamPickerName}>{team.name}</Text>
          <Text style={styles.teamPickerHint}>Appuie pour changer de club</Text>
        </View>
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoPickerBtn} onPress={pickLogo} activeOpacity={0.8}>
        {isImageUri(team.logo) ? (
          <Image source={{ uri: team.logo }} style={styles.logoPickerThumb} resizeMode="contain" />
        ) : (
          <Text style={styles.logoPickerIcon}>🖼️</Text>
        )}
        <Text style={styles.logoPickerText}>
          {isImageUri(team.logo) ? 'Changer le logo (galerie)' : 'Importer depuis la galerie'}
        </Text>
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>

      <Text style={styles.inputLabel}>URL du logo (optionnel)</Text>
      <TextInput
        style={[styles.input, { marginBottom: 8 }]}
        value={isImageUri(team.logo) ? team.logo : ''}
        onChangeText={v => onChange({ ...team, logo: v })}
        placeholder="https://upload.wikimedia.org/..."
        placeholderTextColor={Colors.textMuted}
        autoCapitalize="none"
        keyboardType="url"
      />

      <View style={styles.row}>
        <View style={{ flex: 2 }}>
          <Text style={styles.inputLabel}>Nom</Text>
          <TextInput
            style={styles.input}
            value={team.name}
            onChangeText={v => onChange({ ...team, name: v })}
            placeholder="FC Barcelona"
            placeholderTextColor={Colors.textMuted}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.inputLabel}>Sigle</Text>
          <TextInput
            style={styles.input}
            value={team.shortName}
            onChangeText={v => onChange({ ...team, shortName: v.toUpperCase().slice(0, 3) })}
            placeholder="FCB"
            placeholderTextColor={Colors.textMuted}
            maxLength={3}
            autoCapitalize="characters"
          />
        </View>
      </View>

      <ClubPicker
        visible={showPicker}
        onSelect={club => onChange({ ...club })}
        onClose={() => setShowPicker(false)}
      />
    </View>
  );
}

// ─── Edit Match Modal ──────────────────────────────────────────────────────────

function EditMatchModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { featuredMatch, setFeaturedMatch, apiMatchId, setApiMatchId } = useFeaturedMatch();

  const init = featuredMatch ?? {
    id: 'custom',
    homeTeam: { name: 'FC Barcelona', shortName: 'FCB', logo: '🔵🔴', color: '#A50044' },
    awayTeam: { name: 'Adversaire', shortName: 'ADV', logo: '⚪', color: '#555555' },
    date: new Date(Date.now() + 7 * 86400000).toISOString(),
    competition: 'La Liga',
    venue: 'Estadi Olímpic Lluís Companys',
    status: 'upcoming' as const,
  };

  const [homeTeam, setHomeTeam] = useState<Team & { color?: string }>(init.homeTeam);
  const [awayTeam, setAwayTeam] = useState<Team & { color?: string }>(init.awayTeam);
  const [competition, setCompetition] = useState(init.competition);
  const [dateStr, setDateStr] = useState(init.date.slice(0, 10));
  const [timeStr, setTimeStr] = useState(init.date.slice(11, 16));
  const [venue, setVenue] = useState(init.venue);
  const [matchIdInput, setMatchIdInput] = useState(apiMatchId ?? '');

  const handleSave = () => {
    if (!dateStr.match(/^\d{4}-\d{2}-\d{2}$/) || !timeStr.match(/^\d{2}:\d{2}$/)) {
      Alert.alert('Format invalide', 'Date : AAAA-MM-JJ  ·  Heure : HH:MM');
      return;
    }
    setFeaturedMatch({
      id: featuredMatch?.id ?? 'custom',
      homeTeam,
      awayTeam,
      date: `${dateStr}T${timeStr}:00`,
      competition,
      venue,
      status: 'upcoming',
    });
    setApiMatchId(matchIdInput.trim() || null);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={styles.editRoot}>

          <View style={styles.editHeader}>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.editCancelText}>Annuler</Text>
            </TouchableOpacity>
            <Text style={styles.editTitle}>Match à la une</Text>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>Enregistrer</Text>
            </TouchableOpacity>
          </View>

          {/* Live preview */}
          <LinearGradient colors={['#00336B', '#004D98']} style={styles.previewBar}>
            <BadgePreview team={homeTeam} size={48} />
            <View style={styles.previewMid}>
              <Text style={styles.previewComp}>{competition}</Text>
              <Text style={styles.previewVs}>VS</Text>
              <Text style={styles.previewTime}>{timeStr}</Text>
            </View>
            <BadgePreview team={awayTeam} size={48} />
          </LinearGradient>

          <ScrollView contentContainerStyle={styles.editBody} showsVerticalScrollIndicator={false}>

            {/* Compétition */}
            <Text style={styles.sectionLabel}>Compétition</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.compRow}>
              {COMPETITIONS.map(c => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setCompetition(c)}
                  style={[styles.compChip, competition === c && styles.compChipActive]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.compChipText, competition === c && styles.compChipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TextInput
              style={[styles.input, { marginTop: 8 }]}
              value={competition}
              onChangeText={setCompetition}
              placeholder="Ou saisir une compétition personnalisée..."
              placeholderTextColor={Colors.textMuted}
            />

            {/* Équipes */}
            <TeamEditor label="Équipe domicile" team={homeTeam} onChange={setHomeTeam} />
            <TeamEditor label="Équipe extérieure" team={awayTeam} onChange={setAwayTeam} />

            {/* Date & Stade */}
            <Text style={styles.sectionLabel}>Date, heure & stade</Text>
            <View style={styles.row}>
              <View style={{ flex: 3 }}>
                <Text style={styles.inputLabel}>Date (AAAA-MM-JJ)</Text>
                <TextInput
                  style={styles.input}
                  value={dateStr}
                  onChangeText={setDateStr}
                  placeholder="2026-04-12"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
              <View style={{ flex: 2 }}>
                <Text style={styles.inputLabel}>Heure (HH:MM)</Text>
                <TextInput
                  style={styles.input}
                  value={timeStr}
                  onChangeText={setTimeStr}
                  placeholder="21:00"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            </View>
            <Text style={styles.inputLabel}>Stade</Text>
            <TextInput
              style={styles.input}
              value={venue}
              onChangeText={setVenue}
              placeholder="Nom du stade"
              placeholderTextColor={Colors.textMuted}
            />

            {/* Score live */}
            <Text style={styles.sectionLabel}>Score en direct (football-data.org)</Text>
            <Text style={styles.inputLabel}>ID du match</Text>
            <TextInput
              style={styles.input}
              value={matchIdInput}
              onChangeText={setMatchIdInput}
              placeholder="ex: 556720"
              placeholderTextColor={Colors.textMuted}
              keyboardType="number-pad"
            />
            <Text style={[styles.inputLabel, { marginTop: 6, lineHeight: 16 }]}>
              Trouve l'ID avec : curl "https://api.football-data.org/v4/teams/81/matches?status=SCHEDULED&limit=1" -H "X-Auth-Token: TON_TOKEN"
            </Text>

            <View style={{ height: 60 }} />
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Prono Match Admin Card ─────────────────────────────────────────────────────

const RESULT_LABELS: Record<BetPrediction, string> = { home: 'Domicile', draw: 'Nul', away: 'Extérieur' };

function PronoMatchAdmin({ match }: { match: PronoMatch }) {
  const { setOdds, setMatchLive, finishMatch, getBet } = useProno();

  const [homeOdds, setHomeOdds] = useState(match.odds.home?.toFixed(2) ?? '');
  const [drawOdds, setDrawOdds] = useState(match.odds.draw?.toFixed(2) ?? '');
  const [awayOdds, setAwayOdds] = useState(match.odds.away?.toFixed(2) ?? '');
  const [selectedResult, setSelectedResult] = useState<BetPrediction | null>(null);

  const bet = getBet(match.id);

  const parseOdd = (s: string) => parseFloat(s.replace(',', '.'));

  const handleSaveOdds = async () => {
    const h = parseOdd(homeOdds);
    const d = parseOdd(drawOdds);
    const a = parseOdd(awayOdds);
    if ([h, d, a].some(v => isNaN(v) || v < 1)) {
      Alert.alert('Cotes invalides', 'Chaque cote doit être ≥ 1.00');
      return;
    }
    await setOdds(match.id, { home: h, draw: d, away: a });
    Alert.alert('Cotes enregistrées ✅');
  };

  const handleSetLive = () => {
    Alert.alert('Marquer EN COURS ?', `${match.homeTeam.name} vs ${match.awayTeam.name}`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Confirmer', onPress: () => setMatchLive(match.id) },
    ]);
  };

  const handleFinish = () => {
    if (!selectedResult) {
      Alert.alert('Résultat manquant', 'Sélectionne le résultat du match avant de terminer.');
      return;
    }
    Alert.alert(
      'Terminer le match ?',
      `Résultat : ${RESULT_LABELS[selectedResult]}`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          onPress: async () => {
            await finishMatch(match.id, selectedResult!);
            Alert.alert('Match terminé ✅', 'Résultat enregistré, pièces attribuées.');
          },
        },
      ]
    );
  };

  const statusColor = match.effectiveStatus === 'live' ? Colors.primary : Colors.win;
  const statusLabel = match.effectiveStatus === 'live' ? '🔴 EN COURS' : '🟢 À VENIR';

  return (
    <View style={styles.pronoMatchCard}>
      {/* Match info */}
      <View style={styles.pronoMatchHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.pronoMatchComp}>{match.competition}</Text>
          <Text style={styles.pronoMatchTeams}>{match.homeTeam.shortName} vs {match.awayTeam.shortName}</Text>
          <Text style={styles.pronoMatchDate}>{match.date.slice(0, 10)} · {match.date.slice(11, 16)}</Text>
        </View>
        <View style={[styles.statusBadge, { borderColor: statusColor }]}>
          <Text style={[styles.statusBadgeText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>

      {/* Bet info */}
      {bet && (
        <View style={styles.betInfo}>
          <Text style={styles.betInfoText}>
            🎯 Prono : <Text style={{ color: Colors.gold }}>{RESULT_LABELS[bet.prediction]}</Text> · {bet.coins} 🪙 · gain potentiel {bet.potentialWin} 🪙
          </Text>
        </View>
      )}

      {/* Odds inputs */}
      <Text style={styles.pronoSectionLabel}>COTES</Text>
      <View style={styles.oddsInputRow}>
        {[
          { label: match.homeTeam.shortName, value: homeOdds, onChange: setHomeOdds },
          { label: 'Nul', value: drawOdds, onChange: setDrawOdds },
          { label: match.awayTeam.shortName, value: awayOdds, onChange: setAwayOdds },
        ].map(field => (
          <View key={field.label} style={{ flex: 1 }}>
            <Text style={styles.oddsInputLabel}>{field.label}</Text>
            <TextInput
              style={styles.oddsInput}
              value={field.value}
              onChangeText={field.onChange}
              placeholder="1.00"
              placeholderTextColor={Colors.textMuted}
              keyboardType="decimal-pad"
              maxLength={5}
            />
          </View>
        ))}
      </View>
      <TouchableOpacity style={styles.saveOddsBtn} onPress={handleSaveOdds} activeOpacity={0.8}>
        <Text style={styles.saveOddsBtnText}>💾 Enregistrer les cotes</Text>
      </TouchableOpacity>

      {/* Status actions */}
      <Text style={[styles.pronoSectionLabel, { marginTop: 12 }]}>ACTIONS</Text>
      {match.effectiveStatus === 'upcoming' && (
        <TouchableOpacity style={styles.actionBtnLive} onPress={handleSetLive} activeOpacity={0.8}>
          <Text style={styles.actionBtnText}>🔴 Marquer comme EN COURS</Text>
        </TouchableOpacity>
      )}
      {match.effectiveStatus === 'live' && (
        <>
          <Text style={styles.resultPickerLabel}>Résultat du match :</Text>
          <View style={styles.resultPickerRow}>
            {(['home', 'draw', 'away'] as BetPrediction[]).map(p => (
              <TouchableOpacity
                key={p}
                style={[styles.resultBtn, selectedResult === p && styles.resultBtnSelected]}
                onPress={() => setSelectedResult(p)}
                activeOpacity={0.8}
              >
                <Text style={[styles.resultBtnText, selectedResult === p && styles.resultBtnTextSelected]}>
                  {RESULT_LABELS[p]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={[styles.actionBtnFinish, !selectedResult && { opacity: 0.4 }]}
            onPress={handleFinish}
            activeOpacity={0.8}
          >
            <Text style={styles.actionBtnText}>✅ Terminer le match</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

// ─── Settle Past Match Modal ──────────────────────────────────────────────────

function SettlePastMatchModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { finishMatch } = useProno();
  const [matchIdInput, setMatchIdInput] = useState('');
  const [selectedResult, setSelectedResult] = useState<BetPrediction | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSettle = () => {
    if (!matchIdInput.trim()) { Alert.alert('Match ID manquant'); return; }
    if (!selectedResult) { Alert.alert('Résultat manquant', 'Sélectionne le résultat.'); return; }
    Alert.alert(
      'Régler ce match ?',
      `ID: ${matchIdInput.trim()}  ·  Résultat: ${RESULT_LABELS[selectedResult]}`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          onPress: async () => {
            setLoading(true);
            try {
              await finishMatch(matchIdInput.trim(), selectedResult!);
              Alert.alert('Réglé ✅', 'matchResults enregistré. Rouvre l\'app pour voir les pièces.');
              onClose();
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
        <View style={styles.editHeader}>
          <View style={{ width: 60 }} />
          <Text style={styles.editTitle}>Régler un match passé</Text>
          <TouchableOpacity onPress={onClose} style={{ width: 60, alignItems: 'flex-end' }}>
            <Text style={styles.editCancelText}>Fermer</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: Spacing.md, gap: Spacing.lg }}>
          <Text style={{ color: Colors.textSecondary, fontSize: FontSize.sm, lineHeight: 20 }}>
            Écrit le résultat dans matchResults/&#123;matchId&#125; pour déclencher le règlement des paris au prochain démarrage de l'app.
          </Text>
          <View>
            <Text style={styles.inputLabel}>ID du match (football-data.org)</Text>
            <TextInput
              style={styles.input}
              value={matchIdInput}
              onChangeText={setMatchIdInput}
              placeholder="ex: 544532"
              placeholderTextColor={Colors.textMuted}
              keyboardType="number-pad"
            />
          </View>
          <View>
            <Text style={styles.inputLabel}>Résultat</Text>
            <View style={styles.resultPickerRow}>
              {(['home', 'draw', 'away'] as BetPrediction[]).map(p => (
                <TouchableOpacity
                  key={p}
                  style={[styles.resultBtn, selectedResult === p && styles.resultBtnSelected]}
                  onPress={() => setSelectedResult(p)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.resultBtnText, selectedResult === p && styles.resultBtnTextSelected]}>
                    {RESULT_LABELS[p]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <TouchableOpacity
            style={[styles.actionBtnFinish, (!matchIdInput.trim() || !selectedResult || loading) && { opacity: 0.4 }]}
            onPress={handleSettle}
            disabled={!matchIdInput.trim() || !selectedResult || loading}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.actionBtnText}>✅ Enregistrer le résultat</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Certification Modal ────────────────────────────────────────────────────────

function CertificationModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ uid: string; username: string; verified: boolean } | null>(null);
  const [toggling, setToggling] = useState(false);

  const handleSearch = async () => {
    if (!search.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const snap = await getDocs(
        query(collection(db, 'users'), where('username', '==', search.trim()), limit(1))
      );
      if (snap.empty) {
        Alert.alert('Introuvable', `Aucun compte avec le pseudo "${search.trim()}"`);
      } else {
        const d = snap.docs[0];
        setResult({ uid: d.id, username: d.data().username, verified: d.data().verified ?? false });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async () => {
    if (!result) return;
    setToggling(true);
    const newVerified = !result.verified;
    try {
      // Mettre à jour le doc utilisateur
      await updateDoc(doc(db, 'users', result.uid), { verified: newVerified });

      // Mettre à jour tous les posts de l'utilisateur
      const postsSnap = await getDocs(
        query(collection(db, 'posts'), where('userId', '==', result.uid))
      );
      if (!postsSnap.empty) {
        const batch = writeBatch(db);
        postsSnap.docs.forEach(d => batch.update(d.ref, { verified: newVerified }));
        await batch.commit();
      }

      setResult({ ...result, verified: newVerified });
    } finally {
      setToggling(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
        <View style={styles.editHeader}>
          <View style={{ width: 60 }} />
          <Text style={styles.editTitle}>Certifications</Text>
          <TouchableOpacity onPress={onClose} style={{ width: 60, alignItems: 'flex-end' }}>
            <Text style={styles.editCancelText}>Fermer</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: Spacing.md, gap: Spacing.lg }}>
          <Text style={{ color: Colors.textSecondary, fontSize: FontSize.sm, lineHeight: 20 }}>
            Recherche un utilisateur par son pseudo exact pour lui accorder ou retirer la certification.
          </Text>

          {/* Search */}
          <View style={styles.certSearchRow}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              placeholder="Pseudo exact..."
              placeholderTextColor={Colors.textMuted}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              onSubmitEditing={handleSearch}
            />
            <TouchableOpacity
              style={styles.certSearchBtn}
              onPress={handleSearch}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator size="small" color={Colors.text} />
                : <Ionicons name="search" size={18} color={Colors.text} />
              }
            </TouchableOpacity>
          </View>

          {/* Result */}
          {result && (
            <View style={styles.certResultCard}>
              <View style={styles.certResultLeft}>
                <View style={styles.certResultAvatar}>
                  <Text style={{ fontSize: 22 }}>🦁</Text>
                </View>
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.certResultName}>{result.username}</Text>
                    {result.verified && <VerifiedBadge size={16} />}
                  </View>
                  <Text style={{ color: Colors.textMuted, fontSize: FontSize.xs, marginTop: 2 }}>
                    {result.verified ? 'Compte certifié' : 'Compte non certifié'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.certToggleBtn, result.verified ? styles.certToggleBtnRevoke : styles.certToggleBtnGrant]}
                onPress={handleToggle}
                disabled={toggling}
              >
                {toggling ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.certToggleText}>
                    {result.verified ? 'Retirer' : 'Certifier'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Prono Management Modal ─────────────────────────────────────────────────────

function PronoManageModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { pronoMatches } = useProno();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
        <View style={styles.editHeader}>
          <View style={{ width: 60 }} />
          <Text style={styles.editTitle}>Gestion des pronos</Text>
          <TouchableOpacity onPress={onClose} style={{ width: 60, alignItems: 'flex-end' }}>
            <Text style={styles.editCancelText}>Fermer</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: Spacing.md, gap: Spacing.md }} showsVerticalScrollIndicator={false}>
          {pronoMatches.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 48 }}>
              <Text style={{ color: Colors.textMuted, fontSize: FontSize.md }}>Aucun match prono actif</Text>
            </View>
          ) : (
            pronoMatches.map(m => <PronoMatchAdmin key={m.id} match={m} />)
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Lineup Modal ──────────────────────────────────────────────────────────────

const POS_ORDER = ['GK', 'DEF', 'MID', 'ATT'];
const POS_LABELS: Record<string, string> = {
  GK: '🧤  Gardiens',
  DEF: '🛡️  Défenseurs',
  MID: '⚙️  Milieux',
  ATT: '⚡  Attaquants',
};

function LineupModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { setLineup, getLineup } = useRatings();
  const { monthlyMatches } = useFeaturedMatch();
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Vrais matchs terminés depuis l'API, triés du plus récent au plus ancien
  const finishedMatches = monthlyMatches
    .filter((m) => m.status === 'finished')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const handleSelectMatch = (matchId: string) => {
    const existing = getLineup(matchId);
    setSelectedIds(existing ? new Set(existing.map((p) => p.id)) : new Set());
    setSelectedMatchId(matchId);
  };

  const togglePlayer = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleValidate = () => {
    if (!selectedMatchId) return;
    const lineup = PLAYERS.filter((p) => selectedIds.has(p.id));
    if (lineup.length === 0) {
      Alert.alert('Aucun joueur sélectionné', 'Sélectionne au moins 1 joueur.');
      return;
    }
    setLineup(selectedMatchId, lineup);
    Alert.alert(
      'Compo validée ✅',
      `${lineup.length} joueur(s) enregistrés.\nLe vote est maintenant ouvert pour ce match.`,
      [{ text: 'OK', onPress: () => setSelectedMatchId(null) }]
    );
  };

  const playersByPos = POS_ORDER.map((pos) => ({
    pos,
    label: POS_LABELS[pos],
    players: PLAYERS.filter((p) => p.position === pos),
  }));

  const selectedMatch = finishedMatches.find((m) => m.id === selectedMatchId);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>

        {/* Header */}
        <View style={styles.editHeader}>
          {selectedMatchId ? (
            <TouchableOpacity onPress={() => setSelectedMatchId(null)}>
              <Text style={styles.editCancelText}>← Retour</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 60 }} />
          )}
          <Text style={styles.editTitle}>
            {selectedMatchId ? 'Choisir les joueurs' : 'Compo du match'}
          </Text>
          <TouchableOpacity onPress={() => { setSelectedMatchId(null); onClose(); }} style={{ width: 60, alignItems: 'flex-end' }}>
            <Text style={styles.editCancelText}>Fermer</Text>
          </TouchableOpacity>
        </View>

        {!selectedMatchId ? (
          /* ── Étape 1 : liste des matchs terminés ── */
          <ScrollView contentContainerStyle={{ padding: Spacing.md, gap: Spacing.sm }} showsVerticalScrollIndicator={false}>
            <Text style={{ color: Colors.textSecondary, fontSize: FontSize.sm, lineHeight: 20, marginBottom: 4 }}>
              Sélectionne un match terminé pour valider la compo. Le vote ne s'ouvre qu'après validation.
            </Text>
            {finishedMatches.length === 0 ? (
              <Text style={{ color: Colors.textMuted, textAlign: 'center', paddingTop: 40, fontSize: FontSize.sm }}>
                Aucun match terminé
              </Text>
            ) : (
              finishedMatches.map((match) => {
                const hasLineup = !!getLineup(match.id);
                const isBarcaHome = match.homeTeam.shortName === 'FCB';
                const opp = isBarcaHome ? match.awayTeam : match.homeTeam;
                const bScore = isBarcaHome ? match.homeScore : match.awayScore;
                const oScore = isBarcaHome ? match.awayScore : match.homeScore;
                return (
                  <TouchableOpacity
                    key={match.id}
                    onPress={() => handleSelectMatch(match.id)}
                    style={lStyles.matchRow}
                    activeOpacity={0.75}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={lStyles.matchComp}>{match.competition}</Text>
                      <Text style={lStyles.matchTeams}>
                        FCB {bScore ?? '?'} – {oScore ?? '?'} {opp.shortName}
                      </Text>
                      <Text style={lStyles.matchDate}>{match.date.slice(0, 10)}</Text>
                    </View>
                    <View style={[lStyles.statusChip, hasLineup ? lStyles.chipOk : lStyles.chipPending]}>
                      <Text style={[lStyles.statusText, { color: hasLineup ? Colors.win : Colors.draw }]}>
                        {hasLineup ? '✅ Validée' : '⏳ En attente'}
                      </Text>
                    </View>
                    <Text style={styles.arrow}>›</Text>
                  </TouchableOpacity>
                );
              })
            )}
            <View style={{ height: 40 }} />
          </ScrollView>
        ) : (
          /* ── Étape 2 : sélection des joueurs ── */
          <>
            {selectedMatch && (
              <View style={lStyles.matchRecap}>
                <Text style={lStyles.matchRecapScore}>
                  {selectedMatch.homeTeam.shortName} {selectedMatch.homeScore ?? '?'} – {selectedMatch.awayScore ?? '?'} {selectedMatch.awayTeam.shortName}
                </Text>
                <Text style={lStyles.matchRecapSub}>
                  {selectedMatch.competition} · {selectedMatch.date.slice(0, 10)}
                </Text>
                <Text style={lStyles.selectionCount}>
                  {selectedIds.size} joueur(s) sélectionné(s)
                </Text>
              </View>
            )}

            <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
              {playersByPos.map(({ pos, label, players }) => (
                <View key={pos}>
                  <View style={lStyles.posHeader}>
                    <Text style={lStyles.posHeaderText}>{label}</Text>
                  </View>
                  {players.map((player) => {
                    const selected = selectedIds.has(player.id);
                    return (
                      <TouchableOpacity
                        key={player.id}
                        style={[lStyles.playerRow, selected && lStyles.playerRowSelected]}
                        onPress={() => togglePlayer(player.id)}
                        activeOpacity={0.75}
                      >
                        <View style={[lStyles.checkbox, selected && lStyles.checkboxSelected]}>
                          {selected && <Text style={lStyles.checkmark}>✓</Text>}
                        </View>
                        <Text style={lStyles.playerNumber}>
                          {String(player.number).padStart(2, '0')}
                        </Text>
                        <Text style={lStyles.playerEmoji}>{player.photo}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={lStyles.playerName}>{player.name}</Text>
                          <Text style={lStyles.playerNat}>{player.nationality}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </ScrollView>

            {/* Bouton de validation flottant */}
            <View style={lStyles.validateBar}>
              <TouchableOpacity
                style={[lStyles.validateBtn, selectedIds.size === 0 && { opacity: 0.4 }]}
                onPress={handleValidate}
                activeOpacity={0.8}
              >
                <Text style={lStyles.validateBtnText}>
                  ✅  Valider la compo ({selectedIds.size} joueurs)
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ─── Main Admin Screen ─────────────────────────────────────────────────────────

export default function AdminScreen() {
  const navigation = useNavigation();
  const { featuredMatch } = useFeaturedMatch();
  const [showEditMatch, setShowEditMatch] = useState(false);
  const [showPronoManage, setShowPronoManage] = useState(false);
  const [showSettlePast, setShowSettlePast] = useState(false);
  const [showCertification, setShowCertification] = useState(false);
  const [showLineup, setShowLineup] = useState(false);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      <LinearGradient colors={['#004D98', '#002D5A']} style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.headerEmoji}>🛡️</Text>
        <Text style={styles.headerTitle}>Panel Admin</Text>
        <Text style={styles.headerSub}>legrosromain27@gmail.com</Text>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        <Text style={styles.sectionTitleMain}>Match à la une</Text>
        <TouchableOpacity style={styles.featuredCard} onPress={() => setShowEditMatch(true)} activeOpacity={0.8}>
          <LinearGradient colors={['#00336B', '#003D80']} style={styles.featuredTop}>
            {featuredMatch ? (
              <View style={styles.featuredRow}>
                <BadgePreview team={featuredMatch.homeTeam} size={42} />
                <View style={styles.featuredMid}>
                  <Text style={styles.featuredComp}>{featuredMatch.competition}</Text>
                  <Text style={styles.featuredTeams}>
                    {featuredMatch.homeTeam.shortName} — {featuredMatch.awayTeam.shortName}
                  </Text>
                  <Text style={styles.featuredDate}>{featuredMatch.date.slice(0, 10)} · {featuredMatch.date.slice(11, 16)}</Text>
                </View>
                <BadgePreview team={featuredMatch.awayTeam} size={42} />
              </View>
            ) : (
              <Text style={styles.featuredEmpty}>Aucun match configuré</Text>
            )}
          </LinearGradient>
          <View style={styles.featuredBottom}>
            <Text style={styles.featuredEditLabel}>✏️  Modifier le match à la une</Text>
            <Text style={styles.arrow}>›</Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.sectionTitleMain}>Gestion du contenu</Text>
        {[
          { icon: '🏆', title: 'Gestion des pronos', desc: 'Définir les cotes et valider les résultats', onPress: () => setShowPronoManage(true) },
          { icon: '🔧', title: 'Régler un match passé', desc: 'Enregistrer le résultat d\'un match déjà terminé', onPress: () => setShowSettlePast(true) },
          { icon: '✅', title: 'Certifications', desc: 'Accorder ou retirer le badge certifié', onPress: () => setShowCertification(true) },
          { icon: '📰', title: 'Actualités', desc: 'Publier et modifier les articles', onPress: undefined },
          { icon: '📋', title: 'Compo du match', desc: 'Valider la composition après chaque match', onPress: () => setShowLineup(true) },
          { icon: '🪙', title: 'Pièces', desc: 'Attribuer ou retirer des pièces aux membres', onPress: undefined },
        ].map(s => (
          <TouchableOpacity key={s.title} style={styles.card} activeOpacity={0.75} onPress={s.onPress}>
            <View style={styles.cardIcon}>
              <Text style={{ fontSize: 22 }}>{s.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{s.title}</Text>
              <Text style={styles.cardDesc}>{s.desc}</Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
        ))}

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>

      <EditMatchModal visible={showEditMatch} onClose={() => setShowEditMatch(false)} />
      <PronoManageModal visible={showPronoManage} onClose={() => setShowPronoManage(false)} />
      <SettlePastMatchModal visible={showSettlePast} onClose={() => setShowSettlePast(false)} />
      <CertificationModal visible={showCertification} onClose={() => setShowCertification(false)} />
      <LineupModal visible={showLineup} onClose={() => setShowLineup(false)} />
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: { paddingTop: 60, paddingBottom: Spacing.xl, paddingHorizontal: Spacing.md, alignItems: 'center' },
  backBtn: { position: 'absolute', top: 60, left: Spacing.md },
  backText: { color: 'rgba(255,255,255,0.8)', fontSize: FontSize.md, fontWeight: '600' },
  headerEmoji: { fontSize: 48, marginBottom: Spacing.sm },
  headerTitle: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.text },
  headerSub: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
  content: { padding: Spacing.md },

  sectionTitleMain: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text, marginBottom: 10, marginTop: 4 },

  badge: { alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 4, elevation: 5 },

  // Featured card
  featuredCard: { borderRadius: BorderRadius.lg, overflow: 'hidden', borderWidth: 1, borderColor: '#2A2A2A', marginBottom: Spacing.lg },
  featuredTop: { padding: Spacing.md },
  featuredRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featuredMid: { flex: 1, alignItems: 'center' },
  featuredComp: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  featuredTeams: { color: '#fff', fontSize: 15, fontWeight: '800', marginTop: 3 },
  featuredDate: { color: Colors.gold, fontSize: 11, marginTop: 3 },
  featuredEmpty: { color: 'rgba(255,255,255,0.4)', textAlign: 'center', fontSize: FontSize.sm, paddingVertical: 8 },
  featuredBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md, backgroundColor: '#181818', borderTopWidth: 1, borderTopColor: '#2A2A2A' },
  featuredEditLabel: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600' },

  // Cards
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#151515', borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: '#222' },
  cardIcon: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#222', alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  cardTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  cardDesc: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  arrow: { fontSize: 20, color: Colors.textMuted },

  // Club picker
  pickerRoot: { flex: 1, backgroundColor: Colors.background },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: '#222', backgroundColor: '#151515' },
  pickerCloseText: { color: Colors.textSecondary, fontSize: FontSize.sm },
  pickerTitle: { color: Colors.text, fontSize: FontSize.md, fontWeight: '700' },
  pickerSearchWrap: { padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: '#222' },
  pickerSearchInput: { backgroundColor: '#1A1A1A', borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 10, color: Colors.text, fontSize: FontSize.sm, borderWidth: 1, borderColor: '#2A2A2A' },
  pickerGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 8, gap: 4 },
  pickerItem: { width: '22%', alignItems: 'center', paddingVertical: 10, gap: 6 },
  pickerItemName: { color: Colors.textSecondary, fontSize: 9, textAlign: 'center', lineHeight: 12 },

  // Team editor
  teamEditor: { marginTop: Spacing.lg },
  teamPickerRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#151515', borderRadius: BorderRadius.md, padding: Spacing.md, gap: Spacing.sm, borderWidth: 1, borderColor: '#2A2A2A', marginBottom: 8 },
  teamPickerName: { color: Colors.text, fontSize: FontSize.sm, fontWeight: '700' },
  teamPickerHint: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  logoPickerBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#151515', borderRadius: BorderRadius.md, padding: Spacing.md, gap: Spacing.sm, borderWidth: 1, borderColor: '#2A2A2A', marginBottom: 8 },
  logoPickerIcon: { fontSize: 22, width: 48, textAlign: 'center' },
  logoPickerThumb: { width: 48, height: 48, borderRadius: 8 },
  logoPickerText: { flex: 1, color: Colors.textSecondary, fontSize: FontSize.sm },

  row: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  inputLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: '600', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 },
  input: { backgroundColor: '#151515', borderRadius: BorderRadius.md, padding: 12, color: Colors.text, fontSize: FontSize.sm, borderWidth: 1, borderColor: '#2A2A2A' },

  // Edit modal
  editRoot: { flex: 1, backgroundColor: Colors.background },
  editHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: '#222', backgroundColor: '#151515' },
  editCancelText: { color: Colors.textSecondary, fontSize: FontSize.sm },
  editTitle: { color: Colors.text, fontSize: FontSize.md, fontWeight: '700' },
  saveBtn: { backgroundColor: Colors.primary, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full },
  saveBtnText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '700' },

  previewBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md, paddingHorizontal: 24 },
  previewMid: { alignItems: 'center', gap: 2 },
  previewComp: { color: Colors.gold, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  previewVs: { color: 'rgba(255,255,255,0.25)', fontSize: 20, fontWeight: '900' },
  previewTime: { color: '#fff', fontSize: 18, fontWeight: '900' },

  editBody: { padding: Spacing.md },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, marginBottom: 8, marginTop: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
  compRow: { gap: 8, paddingBottom: 4 },
  compChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: BorderRadius.full, borderWidth: 1.5, borderColor: '#2A2A2A', backgroundColor: '#1A1A1A' },
  compChipActive: { backgroundColor: Colors.secondary + '25', borderColor: Colors.secondary },
  compChipText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' },
  compChipTextActive: { color: Colors.secondary, fontWeight: '700' },

  // Prono match admin card
  pronoMatchCard: { backgroundColor: '#151515', borderRadius: BorderRadius.lg, padding: Spacing.md, borderWidth: 1, borderColor: '#2A2A2A', gap: 8 },
  pronoMatchHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  pronoMatchComp: { color: Colors.textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  pronoMatchTeams: { color: Colors.text, fontSize: FontSize.md, fontWeight: '800', marginTop: 2 },
  pronoMatchDate: { color: Colors.gold, fontSize: FontSize.xs, marginTop: 2 },
  statusBadge: { borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1.5 },
  statusBadgeText: { fontSize: 10, fontWeight: '800' },
  betInfo: { backgroundColor: Colors.gold + '15', borderRadius: BorderRadius.sm, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.gold + '33' },
  betInfoText: { color: Colors.textSecondary, fontSize: FontSize.xs },
  pronoSectionLabel: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  oddsInputRow: { flexDirection: 'row', gap: 8 },
  oddsInputLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: '600', marginBottom: 4, textAlign: 'center' },
  oddsInput: { backgroundColor: '#1A1A1A', borderRadius: BorderRadius.sm, padding: 10, color: Colors.text, fontSize: FontSize.md, fontWeight: '700', borderWidth: 1, borderColor: '#2A2A2A', textAlign: 'center' },
  saveOddsBtn: { backgroundColor: Colors.secondary, borderRadius: BorderRadius.md, paddingVertical: 10, alignItems: 'center' },
  saveOddsBtnText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '700' },
  actionBtnLive: { backgroundColor: Colors.primary + 'CC', borderRadius: BorderRadius.md, paddingVertical: 10, alignItems: 'center' },
  actionBtnFinish: { backgroundColor: Colors.win + 'CC', borderRadius: BorderRadius.md, paddingVertical: 10, alignItems: 'center' },
  actionBtnText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '700' },
  resultPickerLabel: { color: Colors.textSecondary, fontSize: FontSize.xs, fontWeight: '600' },
  resultPickerRow: { flexDirection: 'row', gap: 8 },
  resultBtn: { flex: 1, paddingVertical: 10, borderRadius: BorderRadius.md, alignItems: 'center', backgroundColor: '#222', borderWidth: 1.5, borderColor: '#333' },
  resultBtnSelected: { backgroundColor: Colors.gold + '22', borderColor: Colors.gold },
  resultBtnText: { color: Colors.textSecondary, fontSize: FontSize.xs, fontWeight: '700' },
  resultBtnTextSelected: { color: Colors.gold },

  // Certification
  certSearchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  certSearchBtn: { width: 46, height: 46, borderRadius: BorderRadius.md, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  certResultCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#151515', borderRadius: BorderRadius.md, padding: Spacing.md, borderWidth: 1, borderColor: '#2A2A2A' },
  certResultLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  certResultAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' },
  certResultName: { color: Colors.text, fontSize: FontSize.md, fontWeight: '700' },
  certToggleBtn: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full },
  certToggleBtnGrant: { backgroundColor: '#1D9BF0' },
  certToggleBtnRevoke: { backgroundColor: Colors.error },
  certToggleText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '700' },
});

// ─── Lineup Modal Styles ───────────────────────────────────────────────────────

const lStyles = StyleSheet.create({
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#151515',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: '#222',
    gap: Spacing.sm,
  },
  matchComp: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  matchTeams: { color: Colors.text, fontSize: FontSize.md, fontWeight: '800', marginTop: 2 },
  matchDate: { color: Colors.gold, fontSize: FontSize.xs, marginTop: 2 },
  statusChip: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  chipOk: { borderColor: Colors.win + '55', backgroundColor: Colors.win + '11' },
  chipPending: { borderColor: Colors.draw + '55', backgroundColor: Colors.draw + '11' },
  statusText: { fontSize: 11, fontWeight: '700' },

  matchRecap: {
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    padding: Spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  matchRecapScore: { color: Colors.text, fontSize: FontSize.lg, fontWeight: '900' },
  matchRecapSub: { color: Colors.textMuted, fontSize: FontSize.xs },
  selectionCount: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: '700', marginTop: 4 },

  posHeader: {
    backgroundColor: '#0D0D0D',
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#1A1A1A',
  },
  posHeaderText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700' },

  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 13,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#111',
  },
  playerRowSelected: { backgroundColor: Colors.primary + '14' },

  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '900', lineHeight: 18 },

  playerNumber: { color: Colors.textMuted, fontSize: 12, fontWeight: '700', width: 22, textAlign: 'right' },
  playerEmoji: { fontSize: 22 },
  playerName: { color: Colors.text, fontSize: FontSize.sm, fontWeight: '700' },
  playerNat: { color: Colors.textMuted, fontSize: 11, marginTop: 1 },

  validateBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.md,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  validateBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  validateBtnText: { color: '#fff', fontSize: FontSize.md, fontWeight: '800' },
});
