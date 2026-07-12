import React, { useState, useRef, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Image,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme';
import { PostTag } from '../types';
import { useAuth } from '../context/AuthContext';

const MAX_LENGTH = 500;

const TAGS: { tag: PostTag; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { tag: 'match',   label: 'Match',   icon: 'football',  color: Colors.secondary },
  { tag: 'opinion', label: 'Opinion', icon: 'chatbubble-ellipses', color: Colors.primary },
  { tag: 'news',    label: 'News',    icon: 'newspaper',  color: Colors.gold },
];

interface MentionUser { id: string; username: string; avatar: string; photoBase64?: string }

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (content: string, tag?: PostTag, imageBase64?: string, mentions?: MentionUser[]) => void;
  isPremium?: boolean;
}

export default function CreatePostModal({ visible, onClose, onSubmit, isPremium }: Props) {
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [selectedTag, setSelectedTag] = useState<PostTag | undefined>();
  const [imageBase64, setImageBase64] = useState<string | undefined>();
  const [mentions, setMentions] = useState<MentionUser[]>([]);
  const [mentionSearch, setMentionSearch] = useState<string | null>(null);
  const [mentionSuggestions, setMentionSuggestions] = useState<MentionUser[]>([]);
  const inputRef = useRef<TextInput>(null);

  // Détecter @mention en cours de frappe
  useEffect(() => {
    const words = content.split(/\s/);
    const last = words[words.length - 1];
    if (last.startsWith('@') && last.length > 1) {
      setMentionSearch(last.slice(1));
    } else {
      setMentionSearch(null);
      setMentionSuggestions([]);
    }
  }, [content]);

  // Chercher les utilisateurs correspondants
  useEffect(() => {
    if (!mentionSearch || mentionSearch.length < 1) { setMentionSuggestions([]); return; }
    const search = mentionSearch.toLowerCase();
    getDocs(query(
      collection(db, 'users'),
      where('username', '>=', search),
      where('username', '<=', search + ''),
      limit(5)
    )).then(snap => {
      const results: MentionUser[] = snap.docs
        .filter(d => d.id !== user?.id)
        .map(d => ({ id: d.id, username: d.data().username, avatar: d.data().avatar, photoBase64: d.data().photoBase64 }));
      setMentionSuggestions(results);
    }).catch(() => {});
  }, [mentionSearch]);

  const selectMention = (mentioned: MentionUser) => {
    const words = content.split(/(\s)/);
    const lastIdx = words.length - 1;
    words[lastIdx] = `@${mentioned.username} `;
    setContent(words.join(''));
    setMentions(prev => prev.find(m => m.id === mentioned.id) ? prev : [...prev, mentioned]);
    setMentionSuggestions([]);
    setMentionSearch(null);
  };

  const handleSubmit = () => {
    if (!content.trim()) return;
    onSubmit(content.trim(), selectedTag, imageBase64, mentions);
    setContent('');
    setSelectedTag(undefined);
    setImageBase64(undefined);
    setMentions([]);
  };

  const handleClose = () => {
    setContent('');
    setSelectedTag(undefined);
    setImageBase64(undefined);
    setMentions([]);
    onClose();
  };

  const pickImage = async () => {
    if (!isPremium) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission refusée', 'Autorise l\'accès à ta galerie dans les réglages.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
    });
    if (result.canceled) return;
    const manipulated = await ImageManipulator.manipulateAsync(
      result.assets[0].uri,
      [{ resize: { width: 800 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    setImageBase64(manipulated.base64 ?? undefined);
  };

  const remaining = MAX_LENGTH - content.length;
  const canSubmit = content.trim().length > 0;
  const isWarning = remaining <= 50;
  const isDanger = remaining <= 20;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <SafeAreaView style={styles.root}>

          {/* ── Header ── */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={22} color={Colors.text} />
            </TouchableOpacity>

            <Text style={styles.headerTitle}>Nouvelle publication</Text>

            <TouchableOpacity
              onPress={handleSubmit}
              style={[styles.publishBtn, !canSubmit && styles.publishBtnDisabled]}
              disabled={!canSubmit}
              activeOpacity={0.8}
            >
              <Ionicons name="send" size={14} color={canSubmit ? '#fff' : Colors.textMuted} />
              <Text style={[styles.publishText, !canSubmit && styles.publishTextDisabled]}>
                Publier
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          {/* ── Corps ── */}
          <ScrollView
            style={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Avatar + input */}
            <View style={styles.composeRow}>
              <View style={styles.leftCol}>
                <View style={styles.avatar}>
                  {user?.photoBase64 ? (
                    <Image
                      source={{ uri: `data:image/jpeg;base64,${user.photoBase64}` }}
                      style={styles.avatarImg}
                    />
                  ) : (
                    <Text style={styles.avatarEmoji}>{user?.avatar ?? '🦁'}</Text>
                  )}
                </View>
                {content.length > 0 && <View style={styles.avatarThread} />}
              </View>

              <View style={styles.rightCol}>
                <Text style={styles.username}>{user?.username ?? ''}</Text>
                <TextInput
                  ref={inputRef}
                  style={styles.input}
                  placeholder="Quoi de neuf sur le Barça ?"
                  placeholderTextColor={Colors.textMuted}
                  multiline
                  autoFocus
                  value={content}
                  onChangeText={setContent}
                  maxLength={MAX_LENGTH}
                  scrollEnabled={false}
                />
              </View>
            </View>

            {/* Aperçu image */}
            {imageBase64 && (
              <View style={styles.imagePreviewWrap}>
                <Image
                  source={{ uri: `data:image/jpeg;base64,${imageBase64}` }}
                  style={styles.imagePreview}
                  resizeMode="cover"
                />
                <TouchableOpacity style={styles.imageRemove} onPress={() => setImageBase64(undefined)}>
                  <Ionicons name="close-circle" size={22} color="#fff" />
                </TouchableOpacity>
              </View>
            )}

            {/* Suggestions @mention */}
            {mentionSuggestions.length > 0 && (
              <View style={styles.mentionBox}>
                {mentionSuggestions.map(u => (
                  <TouchableOpacity key={u.id} style={styles.mentionRow} onPress={() => selectMention(u)} activeOpacity={0.75}>
                    <View style={styles.mentionAvatar}>
                      {u.photoBase64
                        ? <Image source={{ uri: `data:image/jpeg;base64,${u.photoBase64}` }} style={styles.mentionAvatarImg} />
                        : <Text style={{ fontSize: 14 }}>{u.avatar}</Text>
                      }
                    </View>
                    <Text style={styles.mentionUsername}>@{u.username}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* ── Catégorie + outils ── */}
            <View style={styles.tagSection}>
              <View style={styles.tagSectionHeader}>
                <Ionicons name="pricetag-outline" size={13} color={Colors.textMuted} />
                <Text style={styles.tagSectionLabel}>Catégorie</Text>
                <View style={{ flex: 1 }} />
                {isWarning && (
                  <Text style={[styles.counter, isDanger && styles.counterDanger]}>{remaining}</Text>
                )}
                <View style={styles.progressRing}>
                  <View style={[styles.progressFill, {
                    width: `${(content.length / MAX_LENGTH) * 100}%`,
                    backgroundColor: isDanger ? Colors.primary : isWarning ? Colors.gold : Colors.secondary,
                  }]} />
                </View>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagRow}>
                <TouchableOpacity onPress={() => setSelectedTag(undefined)} style={[styles.tagChip, !selectedTag && styles.tagChipDefault]} activeOpacity={0.75}>
                  <Ionicons name="apps-outline" size={14} color={!selectedTag ? '#fff' : Colors.textMuted} />
                  <Text style={[styles.tagLabel, { color: !selectedTag ? '#fff' : Colors.textSecondary }]}>Par défaut</Text>
                </TouchableOpacity>
                {TAGS.map(({ tag, label, icon, color }) => {
                  const active = selectedTag === tag;
                  return (
                    <TouchableOpacity key={tag} onPress={() => setSelectedTag(active ? undefined : tag)}
                      style={[styles.tagChip, { borderColor: active ? color : '#2a2a2a' }, active && { backgroundColor: color + '18' }]}
                      activeOpacity={0.75}>
                      <Ionicons name={icon} size={14} color={active ? color : Colors.textMuted} />
                      <Text style={[styles.tagLabel, { color: active ? color : Colors.textSecondary }]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Outils : photo + @ */}
              <View style={styles.toolsRow}>
                <TouchableOpacity style={[styles.toolBtn, !isPremium && styles.toolBtnLocked]} onPress={isPremium ? pickImage : undefined} activeOpacity={0.7}>
                  <Ionicons name="image-outline" size={20} color={isPremium ? (imageBase64 ? Colors.primary : Colors.textMuted) : '#444'} />
                  {!isPremium && <View style={styles.premiumLock}><Ionicons name="diamond" size={8} color={Colors.gold} /></View>}
                </TouchableOpacity>
                <TouchableOpacity style={styles.toolBtn} activeOpacity={0.7} onPress={() => { setContent(p => p + '@'); inputRef.current?.focus(); }}>
                  <Ionicons name="at-outline" size={20} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>

        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d0d0d' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1e1e1e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  publishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
  },
  publishBtnDisabled: {
    backgroundColor: '#1e1e1e',
  },
  publishText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  publishTextDisabled: {
    color: Colors.textMuted,
  },
  divider: { height: 1, backgroundColor: '#1a1a1a' },

  // Body
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },

  composeRow: { flexDirection: 'row', gap: 12 },

  leftCol: { alignItems: 'center' },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.primary + '50',
    overflow: 'hidden',
  },
  avatarImg: { width: 44, height: 44, borderRadius: 22 },
  avatarEmoji: { fontSize: 22 },
  avatarThread: {
    flex: 1,
    width: 2,
    backgroundColor: '#2a2a2a',
    borderRadius: 1,
    marginTop: 8,
    minHeight: 20,
  },

  rightCol: { flex: 1, paddingBottom: 16 },
  username: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: '700',
    marginBottom: 6,
  },
  input: {
    color: Colors.text,
    fontSize: 16,
    lineHeight: 24,
    minHeight: 100,
    textAlignVertical: 'top',
  },

  // Emojis
  emojiPanel: {
    backgroundColor: '#141414',
    borderRadius: BorderRadius.md,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#222',
  },
  emojiList: { padding: 8, gap: 8 },
  emojiBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e1e1e',
    borderRadius: 10,
  },
  emojiText: { fontSize: 20 },

  // Tags + outils
  tagSection: { marginTop: 8, marginBottom: 8, borderTopWidth: 1, borderTopColor: '#1a1a1a', paddingTop: 12 },
  tagSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  tagSectionLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tagRow: { flexDirection: 'row', gap: 8, paddingBottom: 2 },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: '#2a2a2a',
    backgroundColor: '#141414',
  },
  tagChipDefault: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  tagLabel: { fontSize: FontSize.sm, fontWeight: '600' },

  toolsRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
  },
  toolBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
  },
  toolBtnActive: { backgroundColor: Colors.primary + '18' },
  toolBtnLocked: { opacity: 0.4 },
  mentionBox: {
    backgroundColor: '#161616',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginBottom: 8,
    overflow: 'hidden',
  },
  mentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e1e',
  },
  mentionAvatar: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  mentionAvatarImg: { width: 30, height: 30, borderRadius: 15 },
  mentionUsername: { color: '#fff', fontSize: 14, fontWeight: '600' },

  counter: { color: Colors.gold, fontSize: 12, fontWeight: '700' },
  counterDanger: { color: Colors.primary },
  progressRing: {
    width: 32, height: 4,
    backgroundColor: '#222',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 2 },

  imagePreviewWrap: { position: 'relative', marginBottom: 12, borderRadius: 12, overflow: 'hidden' },
  imagePreview: { width: '100%', height: 200, borderRadius: 12 },
  imageRemove: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12,
  },
  premiumLock: {
    position: 'absolute', top: 2, right: 2,
    backgroundColor: '#111', borderRadius: 6, padding: 1,
  },
});
