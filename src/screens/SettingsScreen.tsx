import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ScrollView,
  Alert,
  Image,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { collection, query, where, getDocs, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useBlock } from '../context/BlockContext';
import { Colors, FontSize, BorderRadius, Spacing } from '../theme';

interface BlockedUser {
  id: string;
  username: string;
  avatar: string;
  photoBase64?: string;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function SettingRow({
  icon, iconColor = Colors.textMuted, label, sublabel, onPress, right, danger = false, showArrow = false,
}: {
  icon: string; iconColor?: string; label: string; sublabel?: string;
  onPress?: () => void; right?: React.ReactNode; danger?: boolean; showArrow?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={onPress ? 0.7 : 1} disabled={!onPress && !right}>
      <View style={[styles.rowIcon, { backgroundColor: iconColor + '18' }]}>
        <Ionicons name={icon as any} size={18} color={iconColor} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
        {sublabel ? <Text style={styles.rowSublabel}>{sublabel}</Text> : null}
      </View>
      {right ?? (showArrow && <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />)}
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user, logout, deleteAccount, changeUsername } = useAuth();
  const { blockedByMe, unblockUser } = useBlock();

  const [liveNotif, setLiveNotif] = useState(user?.liveNotifEnabled ?? false);
  const [newUsername, setNewUsername] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);
  const [mentionNotif, setMentionNotif] = useState(user?.mentionNotifEnabled ?? false);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loadingBlocked, setLoadingBlocked] = useState(false);
  const [unlockingId, setUnlockingId] = useState<string | null>(null);

  // Charger infos des utilisateurs bloqués
  useEffect(() => {
    if (!blockedByMe.length) { setBlockedUsers([]); return; }
    setLoadingBlocked(true);
    Promise.all(
      blockedByMe.map(async id => {
        const snap = await getDoc(doc(db, 'users', id));
        if (!snap.exists()) return null;
        const d = snap.data();
        return { id, username: d.username, avatar: d.avatar, photoBase64: d.photoBase64 } as BlockedUser;
      })
    ).then(results => {
      setBlockedUsers(results.filter(Boolean) as BlockedUser[]);
      setLoadingBlocked(false);
    });
  }, [blockedByMe]);

  const toggleLiveNotif = async (val: boolean) => {
    setLiveNotif(val);
    if (user) await updateDoc(doc(db, 'users', user.id), { liveNotifEnabled: val });
  };

  const toggleMentionNotif = async (val: boolean) => {
    setMentionNotif(val);
    if (user) await updateDoc(doc(db, 'users', user.id), { mentionNotifEnabled: val });
  };

  const handleUnblock = async (userId: string) => {
    setUnlockingId(userId);
    await unblockUser(userId);
    setUnlockingId(null);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Supprimer mon compte',
      'Cette action est irréversible. Tous tes posts et données seront supprimés définitivement.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer', style: 'destructive',
          onPress: async () => {
            try { await deleteAccount(); }
            catch { Alert.alert('Erreur', 'Reconnecte-toi et réessaie.'); }
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Réglages</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>

        {/* Notifications */}
        <Section title="Notifications">
          <SettingRow
            icon="football-outline"
            iconColor={Colors.secondary}
            label="Buts & matchs en direct"
            sublabel="Reçois une notif à chaque but du Barça"
            right={
              <Switch
                value={liveNotif}
                onValueChange={toggleLiveNotif}
                trackColor={{ false: '#333', true: Colors.primary + '80' }}
                thumbColor={liveNotif ? Colors.primary : '#888'}
              />
            }
          />
          <View style={styles.separator} />
          <SettingRow
            icon="at-outline"
            iconColor="#4A9EFF"
            label="Notifications d'identification"
            sublabel="Quand quelqu'un te mentionne dans un post"
            right={
              <Switch
                value={mentionNotif}
                onValueChange={toggleMentionNotif}
                trackColor={{ false: '#333', true: '#4A9EFF80' }}
                thumbColor={mentionNotif ? '#4A9EFF' : '#888'}
              />
            }
          />
        </Section>

        {/* Pseudo */}
        {(() => {
          const lastChange = user?.lastUsernameChange ? new Date(user.lastUsernameChange) : null;
          const nextAllowed = lastChange ? new Date(lastChange.getTime() + 7 * 24 * 60 * 60 * 1000) : null;
          const canChange = !nextAllowed || new Date() >= nextAllowed;
          const nextDateStr = nextAllowed?.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

          const handleSave = async () => {
            const trimmed = newUsername.trim();
            if (!trimmed || trimmed.length < 3) {
              Alert.alert('Pseudo invalide', 'Le pseudo doit contenir au moins 3 caractères.');
              return;
            }
            if (trimmed === user?.username) return;
            setSavingUsername(true);
            try {
              await changeUsername(trimmed);
              setNewUsername('');
              Alert.alert('Pseudo modifié ✅', `Ton nouveau pseudo est @${trimmed}`);
            } catch {
              Alert.alert('Erreur', 'Impossible de modifier le pseudo.');
            } finally {
              setSavingUsername(false);
            }
          };

          return (
            <Section title="Pseudo">
              <View style={styles.usernameSection}>
                <Text style={styles.currentUsername}>Actuel : @{user?.username}</Text>
                {canChange ? (
                  <View style={styles.usernameRow}>
                    <TextInput
                      style={styles.usernameInput}
                      placeholder="Nouveau pseudo..."
                      placeholderTextColor={Colors.textMuted}
                      value={newUsername}
                      onChangeText={setNewUsername}
                      maxLength={20}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TouchableOpacity
                      style={[styles.saveBtn, (!newUsername.trim() || savingUsername) && styles.saveBtnDisabled]}
                      onPress={handleSave}
                      disabled={!newUsername.trim() || savingUsername}
                      activeOpacity={0.8}
                    >
                      {savingUsername
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={styles.saveBtnText}>Sauvegarder</Text>
                      }
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.cooldownRow}>
                    <Ionicons name="time-outline" size={15} color={Colors.textMuted} />
                    <Text style={styles.cooldownText}>Prochain changement possible le {nextDateStr}</Text>
                  </View>
                )}
                <Text style={styles.usernameHint}>Modifiable une fois tous les 7 jours</Text>
              </View>
            </Section>
          );
        })()}

        {/* Utilisateurs bloqués */}
        <Section title="Utilisateurs bloqués">
          {loadingBlocked ? (
            <ActivityIndicator color={Colors.primary} style={{ padding: 20 }} />
          ) : blockedUsers.length === 0 ? (
            <View style={styles.emptyBlocked}>
              <Ionicons name="shield-checkmark-outline" size={28} color={Colors.textMuted} />
              <Text style={styles.emptyBlockedText}>Aucun utilisateur bloqué</Text>
            </View>
          ) : (
            blockedUsers.map((u, i) => (
              <View key={u.id}>
                {i > 0 && <View style={styles.separator} />}
                <View style={styles.blockedRow}>
                  <View style={styles.blockedAvatar}>
                    {u.photoBase64
                      ? <Image source={{ uri: `data:image/jpeg;base64,${u.photoBase64}` }} style={styles.blockedAvatarImg} />
                      : <Text style={{ fontSize: 18 }}>{u.avatar}</Text>
                    }
                  </View>
                  <Text style={styles.blockedUsername}>@{u.username}</Text>
                  <TouchableOpacity
                    style={styles.unblockBtn}
                    onPress={() => handleUnblock(u.id)}
                    disabled={unlockingId === u.id}
                    activeOpacity={0.8}
                  >
                    {unlockingId === u.id
                      ? <ActivityIndicator size="small" color={Colors.primary} />
                      : <Text style={styles.unblockText}>Débloquer</Text>
                    }
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </Section>

        {/* Compte */}
        <Section title="Compte">
          <SettingRow
            icon="log-out-outline"
            iconColor="#EF4444"
            label="Se déconnecter"
            danger
            onPress={() => Alert.alert('Déconnexion', 'Tu veux vraiment te déconnecter ?', [
              { text: 'Annuler', style: 'cancel' },
              { text: 'Déconnecter', style: 'destructive', onPress: logout },
            ])}
          />
          <View style={styles.separator} />
          <SettingRow
            icon="trash-outline"
            iconColor="#666"
            label="Supprimer mon compte"
            sublabel="Suppression définitive et irréversible"
            onPress={handleDeleteAccount}
          />
        </Section>

      </ScrollView>
    </View>
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
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#1a1a1a',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: Colors.text, fontSize: 17, fontWeight: '800' },

  section: { marginTop: 28, paddingHorizontal: 16 },
  sectionTitle: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
    paddingLeft: 4,
  },
  sectionCard: {
    backgroundColor: '#151515',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#242424',
    overflow: 'hidden',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  rowText: { flex: 1 },
  rowLabel: { color: Colors.text, fontSize: 14, fontWeight: '600' },
  rowLabelDanger: { color: '#EF4444' },
  rowSublabel: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },

  separator: { height: 1, backgroundColor: '#1f1f1f', marginLeft: 64 },

  usernameSection: { padding: 16, gap: 10 },
  currentUsername: { color: Colors.textMuted, fontSize: 13 },
  usernameRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  usernameInput: {
    flex: 1,
    backgroundColor: '#1e1e1e',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: Colors.text,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  saveBtnDisabled: { backgroundColor: '#2a2a2a' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  cooldownRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cooldownText: { color: Colors.textMuted, fontSize: 13 },
  usernameHint: { color: '#444', fontSize: 11 },

  emptyBlocked: {
    alignItems: 'center', gap: 8,
    paddingVertical: 28,
  },
  emptyBlockedText: { color: Colors.textMuted, fontSize: 13 },

  blockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  blockedAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  blockedAvatarImg: { width: 40, height: 40, borderRadius: 20 },
  blockedUsername: { flex: 1, color: Colors.text, fontSize: 14, fontWeight: '600' },
  unblockBtn: {
    backgroundColor: Colors.primary + '18',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
    minWidth: 80,
    alignItems: 'center',
  },
  unblockText: { color: Colors.primary, fontSize: 13, fontWeight: '700' },
});
