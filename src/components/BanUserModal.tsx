import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme';
import { useModeration } from '../context/ModerationContext';
import { BAN_DURATIONS, evaluateBan, formatRemaining, BanState } from '../utils/ban';
import { serverNow } from '../utils/serverTime';

/**
 * Panneau de modération d'un compte (admin uniquement).
 *
 * Les durées sont converties en échéance absolue sur l'heure SERVEUR au moment de
 * la sanction — pas en « nombre d'heures » décompté par l'appareil du banni.
 */
export default function BanUserModal({
  visible, onClose, target, banState,
}: {
  visible: boolean;
  onClose: () => void;
  target: { uid: string; username: string; email?: string };
  banState: BanState | null;
}) {
  const { banUser, liftBan } = useModeration();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const verdict = evaluateBan(banState, serverNow());

  const run = async (fn: () => Promise<void>, okMsg: string) => {
    setBusy(true);
    try {
      await fn();
      onClose();
      setReason('');
      Alert.alert('Modération', okMsg);
    } catch {
      Alert.alert('Erreur', "L'action n'a pas pu être appliquée.");
    } finally {
      setBusy(false);
    }
  };

  const confirmBan = (hours: number | null, label: string) => {
    Alert.alert(
      hours === null ? 'Bannir définitivement ?' : `Bannir ${label} ?`,
      hours === null
        ? `${target.username} sera exclu définitivement. Son email et son pseudo seront bloqués : il ne pourra ni se reconnecter ni recréer de compte.`
        : `${target.username} ne pourra plus utiliser l'app pendant ${label}.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Bannir',
          style: 'destructive',
          onPress: () => run(
            () => banUser(target, hours, reason.trim() || undefined),
            hours === null ? 'Compte banni définitivement.' : `Compte banni pour ${label}.`,
          ),
        },
      ],
    );
  };

  const confirmLift = () => {
    Alert.alert('Lever le bannissement ?', `${target.username} pourra de nouveau utiliser l'app.`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Lever', onPress: () => run(() => liftBan(target), 'Bannissement levé.') },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={s.handle} />
          <View style={s.headerRow}>
            <Ionicons name="shield" size={20} color={Colors.gold} />
            <Text style={s.title}>Modérer @{target.username}</Text>
          </View>

          {/* État actuel */}
          {verdict.banned ? (
            <View style={s.statusBanned}>
              <Text style={s.statusTitle}>
                {verdict.permanent
                  ? '⛔ Banni définitivement'
                  : `⏳ Banni encore ${formatRemaining(verdict.remainingMs)}`}
              </Text>
              {verdict.reason ? <Text style={s.statusReason}>Motif : {verdict.reason}</Text> : null}
            </View>
          ) : (
            <View style={s.statusOk}>
              <Text style={s.statusOkText}>✓ Compte actif</Text>
            </View>
          )}

          <ScrollView contentContainerStyle={{ gap: Spacing.md, paddingBottom: Spacing.lg }}>
            {verdict.banned && (
              <TouchableOpacity style={s.liftBtn} onPress={confirmLift} disabled={busy} activeOpacity={0.85}>
                {busy ? <ActivityIndicator color={Colors.win} /> : (
                  <>
                    <Ionicons name="lock-open-outline" size={17} color={Colors.win} />
                    <Text style={s.liftText}>Lever le bannissement</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            <View style={{ gap: 6 }}>
              <Text style={s.label}>Motif (facultatif, visible par l'utilisateur)</Text>
              <TextInput
                style={s.input}
                placeholder="Ex : propos insultants"
                placeholderTextColor={Colors.textMuted}
                value={reason}
                onChangeText={setReason}
                editable={!busy}
                maxLength={120}
              />
            </View>

            <View style={{ gap: 6 }}>
              <Text style={s.label}>Bannissement temporaire</Text>
              <View style={s.grid}>
                {BAN_DURATIONS.map(d => (
                  <TouchableOpacity
                    key={d.hours}
                    style={s.durationBtn}
                    onPress={() => confirmBan(d.hours, d.label)}
                    disabled={busy}
                    activeOpacity={0.8}
                  >
                    <Text style={s.durationText}>{d.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity
              style={s.permaBtn}
              onPress={() => confirmBan(null, 'définitivement')}
              disabled={busy}
              activeOpacity={0.85}
            >
              <Ionicons name="ban" size={17} color="#fff" />
              <Text style={s.permaText}>Bannir définitivement</Text>
            </TouchableOpacity>
            <Text style={s.hint}>
              Le bannissement définitif bloque aussi la reconnexion et la création d'un
              nouveau compte avec cet email ou ce pseudo.
            </Text>
          </ScrollView>

          <TouchableOpacity style={s.closeBtn} onPress={onClose} disabled={busy} activeOpacity={0.8}>
            <Text style={s.closeText}>Fermer</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#141414',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: Spacing.lg,
    gap: Spacing.md,
    maxHeight: '88%',
    borderTopWidth: 1,
    borderColor: '#2A2A2A',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: '#3A3A3A', alignSelf: 'center',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: Colors.text, fontSize: FontSize.md, fontWeight: '800', flex: 1 },

  statusBanned: {
    backgroundColor: '#EF444418',
    borderWidth: 1, borderColor: '#EF444455',
    borderRadius: BorderRadius.md, padding: Spacing.md, gap: 3,
  },
  statusTitle: { color: '#FF8A8A', fontSize: FontSize.sm, fontWeight: '800' },
  statusReason: { color: Colors.textSecondary, fontSize: FontSize.xs },
  statusOk: {
    backgroundColor: Colors.win + '14',
    borderWidth: 1, borderColor: Colors.win + '40',
    borderRadius: BorderRadius.md, padding: Spacing.md,
  },
  statusOkText: { color: Colors.win, fontSize: FontSize.sm, fontWeight: '800' },

  label: {
    color: Colors.textMuted, fontSize: 11, fontWeight: '800',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#1E1E1E', borderRadius: BorderRadius.md, borderWidth: 1,
    borderColor: '#2E2E2E', paddingHorizontal: Spacing.md, paddingVertical: 11,
    color: Colors.text, fontSize: FontSize.sm,
  },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  durationBtn: {
    flexGrow: 1, minWidth: '30%', alignItems: 'center',
    backgroundColor: '#1E1E1E', borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: '#333', paddingVertical: 12,
  },
  durationText: { color: Colors.text, fontSize: FontSize.sm, fontWeight: '700' },

  permaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#B91C1C', borderRadius: BorderRadius.md, paddingVertical: 14,
  },
  permaText: { color: '#fff', fontSize: FontSize.md, fontWeight: '800' },

  liftBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.win + '18', borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.win + '55', paddingVertical: 13,
  },
  liftText: { color: Colors.win, fontSize: FontSize.sm, fontWeight: '800' },

  hint: { color: Colors.textMuted, fontSize: FontSize.xs, lineHeight: 16 },
  closeBtn: { alignItems: 'center', paddingVertical: Spacing.sm },
  closeText: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '700' },
});
