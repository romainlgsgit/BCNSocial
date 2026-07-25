import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Linking,
  Alert,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, BorderRadius, Spacing } from '../theme';
import { FAQ, FaqItem, SUPPORT_EMAIL } from '../data/faq';
import RulesModal from '../components/RulesModal';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Minuscule + sans accents → recherche tolérante (« pseudo » trouve « Pseudo », « prefere »
// trouve « préfère »).
function normalize(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function matchesQuery(item: FaqItem, tokens: string[]): boolean {
  const haystack = normalize(
    `${item.question} ${item.answer} ${item.category} ${(item.keywords ?? []).join(' ')}`,
  );
  return tokens.every((t) => haystack.includes(t));
}

// ─── FAQ item (accordéon) ─────────────────────────────────────────────────────

function FaqRow({
  item,
  open,
  onToggle,
}: {
  item: FaqItem;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={styles.faqCard}>
      <TouchableOpacity style={styles.faqHead} onPress={onToggle} activeOpacity={0.7}>
        <View style={styles.faqHeadText}>
          <Text style={styles.faqCategory}>{item.category}</Text>
          <Text style={styles.faqQuestion}>{item.question}</Text>
        </View>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={Colors.textMuted}
        />
      </TouchableOpacity>
      {open && <Text style={styles.faqAnswer}>{item.answer}</Text>}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HelpScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [rulesVisible, setRulesVisible] = useState(false);

  const tokens = useMemo(
    () => normalize(search.trim()).split(/\s+/).filter(Boolean),
    [search],
  );

  const results = useMemo(
    () => (tokens.length === 0 ? FAQ : FAQ.filter((f) => matchesQuery(f, tokens))),
    [tokens],
  );

  const toggle = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenId((cur) => (cur === id ? null : id));
  };

  const contactSupport = async () => {
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Support BCN Social')}`;
    try {
      const ok = await Linking.canOpenURL(url);
      if (!ok) throw new Error('no mail app');
      await Linking.openURL(url);
    } catch {
      Alert.alert(
        'Contacter le support',
        `Écris-nous à :\n${SUPPORT_EMAIL}`,
      );
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Aide</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Barre de recherche */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Rechercher un problème…"
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 32, paddingHorizontal: 16 }}
      >
        {/* Résultats FAQ */}
        {tokens.length > 0 && (
          <Text style={styles.resultCount}>
            {results.length === 0
              ? 'Aucun résultat'
              : `${results.length} résultat${results.length > 1 ? 's' : ''}`}
          </Text>
        )}

        {results.length > 0 ? (
          <View style={styles.faqList}>
            {results.map((item) => (
              <FaqRow
                key={item.id}
                item={item}
                open={openId === item.id}
                onToggle={() => toggle(item.id)}
              />
            ))}
          </View>
        ) : (
          <View style={styles.noResult}>
            <Ionicons name="help-buoy-outline" size={34} color={Colors.textMuted} />
            <Text style={styles.noResultTitle}>Pas de réponse à ta question ?</Text>
            <Text style={styles.noResultText}>
              Écris-nous, on te répond par e-mail.
            </Text>
          </View>
        )}

        {/* Support */}
        <Text style={styles.supportLabel}>Support</Text>
        <View style={styles.supportCard}>
          <View style={styles.supportIcon}>
            <Ionicons name="mail-outline" size={22} color={Colors.primary} />
          </View>
          <Text style={styles.supportTitle}>Besoin d'aide ?</Text>
          <Text style={styles.supportText}>
            Une question, un bug, un souci de compte ou de paiement ? Notre équipe te répond par e-mail.
          </Text>
          <Text selectable style={styles.supportEmail}>{SUPPORT_EMAIL}</Text>
          <TouchableOpacity style={styles.supportBtn} onPress={contactSupport} activeOpacity={0.85}>
            <Ionicons name="send" size={15} color="#fff" />
            <Text style={styles.supportBtnText}>Contacter le support</Text>
          </TouchableOpacity>
        </View>

        {/* Règlement */}
        <TouchableOpacity style={styles.rulesRow} onPress={() => setRulesVisible(true)} activeOpacity={0.7}>
          <Ionicons name="document-text-outline" size={18} color={Colors.textSecondary} />
          <Text style={styles.rulesRowText}>Règlement & conditions d'utilisation</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
        </TouchableOpacity>
      </ScrollView>

      <RulesModal visible={rulesVisible} onClose={() => setRulesVisible(false)} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#1a1a1a',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: Colors.text, fontSize: 17, fontWeight: '800' },

  searchWrap: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#151515',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: '#242424',
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 11 : 4,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: 14, padding: 0 },

  resultCount: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 14,
    marginBottom: 4,
    paddingLeft: 4,
  },

  faqList: { marginTop: 14, gap: 10 },
  faqCard: {
    backgroundColor: '#151515',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#242424',
    overflow: 'hidden',
  },
  faqHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  faqHeadText: { flex: 1 },
  faqCategory: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  faqQuestion: { color: Colors.text, fontSize: 14, fontWeight: '600', lineHeight: 19 },
  faqAnswer: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    paddingHorizontal: 14,
    paddingBottom: 14,
    marginTop: -2,
  },

  noResult: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 34,
    paddingHorizontal: 20,
  },
  noResultTitle: { color: Colors.text, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  noResultText: { color: Colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19 },

  supportLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 28,
    marginBottom: 10,
    paddingLeft: 4,
  },
  supportCard: {
    backgroundColor: '#151515',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#242424',
    padding: Spacing.lg,
    alignItems: 'center',
    gap: 8,
  },
  supportIcon: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.primary + '18',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 2,
  },
  supportTitle: { color: Colors.text, fontSize: FontSize.md, fontWeight: '800' },
  supportText: {
    color: Colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  supportEmail: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  supportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingVertical: 12,
    paddingHorizontal: 22,
    marginTop: 8,
    alignSelf: 'stretch',
  },
  supportBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  rulesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#151515',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#242424',
  },
  rulesRowText: { flex: 1, color: Colors.text, fontSize: 14, fontWeight: '600' },
});

