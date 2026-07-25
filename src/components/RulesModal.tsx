import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme';
import { RULES, RULES_UPDATED, SUPPORT_EMAIL } from '../data/rules';

// Rend le corps d'une section : paragraphes séparés par une ligne vide, puces « • »,
// et l'e-mail de support rendu cliquable (mailto).
function SectionBody({ body }: { body: string }) {
  const paragraphs = body.split('\n\n');
  return (
    <>
      {paragraphs.map((para, i) => {
        if (para.trim() === SUPPORT_EMAIL) {
          return (
            <Text
              key={i}
              style={styles.email}
              onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {})}
            >
              {SUPPORT_EMAIL}
            </Text>
          );
        }
        // Bloc de puces
        if (para.includes('\n• ') || para.startsWith('• ')) {
          const lines = para.split('\n');
          return (
            <View key={i} style={styles.bulletBlock}>
              {lines.map((line, j) => {
                const isBullet = line.startsWith('• ');
                if (isBullet) {
                  return (
                    <View key={j} style={styles.bulletRow}>
                      <Text style={styles.bulletDot}>•</Text>
                      <Text style={styles.bulletText}>{line.slice(2)}</Text>
                    </View>
                  );
                }
                return <Text key={j} style={styles.paragraph}>{line}</Text>;
              })}
            </View>
          );
        }
        return <Text key={i} style={styles.paragraph}>{para}</Text>;
      })}
    </>
  );
}

export default function RulesModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <View style={{ width: 40 }} />
          <Text style={styles.headerTitle}>Règlement</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={22} color={Colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <Text style={styles.updated}>Dernière mise à jour : {RULES_UPDATED}</Text>

          {RULES.map((section, i) => (
            <View key={i} style={styles.section}>
              <Text style={styles.sectionTitle}>
                {section.icon ? `${section.icon}  ` : ''}{section.title}
              </Text>
              <SectionBody body={section.body} />
            </View>
          ))}

          <View style={{ height: Spacing.xl }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

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
  headerTitle: { color: Colors.text, fontSize: 17, fontWeight: '800' },
  closeBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#1a1a1a',
    alignItems: 'center', justifyContent: 'center',
  },

  content: { padding: Spacing.md },
  updated: {
    color: Colors.textMuted,
    fontSize: 12,
    marginBottom: Spacing.md,
    fontStyle: 'italic',
  },
  section: {
    backgroundColor: '#151515',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#242424',
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: 8,
  },
  sectionTitle: { color: Colors.text, fontSize: FontSize.md, fontWeight: '800' },
  paragraph: { color: Colors.textSecondary, fontSize: 13, lineHeight: 20 },
  bulletBlock: { gap: 5 },
  bulletRow: { flexDirection: 'row', gap: 8, paddingRight: 4 },
  bulletDot: { color: Colors.primary, fontSize: 13, lineHeight: 20 },
  bulletText: { flex: 1, color: Colors.textSecondary, fontSize: 13, lineHeight: 20 },
  email: { color: Colors.primary, fontSize: 14, fontWeight: '700', marginTop: 2 },
});
