import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  SafeAreaView,
  Image,
} from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme';
import { PostTag } from '../types';
import { useAuth } from '../context/AuthContext';

const TAG_OPTIONS: { tag: PostTag; label: string; color: string }[] = [
  { tag: 'match', label: '⚽ Match', color: Colors.secondary },
  { tag: 'opinion', label: '💬 Opinion', color: Colors.primary },
  { tag: 'news', label: '📰 News', color: Colors.gold },
];

const QUICK_EMOJIS = ['⚽', '🏆', '🔥', '💙', '❤️', '🌟', '👏', '😍', '💪', '🎯', '⚡'];

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (content: string, tag?: PostTag) => void;
}

export default function CreatePostModal({ visible, onClose, onSubmit }: Props) {
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [selectedTag, setSelectedTag] = useState<PostTag | undefined>();

  const handleSubmit = () => {
    if (!content.trim()) return;
    onSubmit(content.trim(), selectedTag);
    setContent('');
    setSelectedTag(undefined);
  };

  const handleClose = () => {
    setContent('');
    setSelectedTag(undefined);
    onClose();
  };

  const canSubmit = content.trim().length > 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
        <SafeAreaView style={styles.root}>
          {/* Toolbar */}
          <View style={styles.toolbar}>
            <TouchableOpacity onPress={handleClose} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Annuler</Text>
            </TouchableOpacity>
            <Text style={styles.toolbarTitle}>Nouvelle publication</Text>
            <TouchableOpacity
              onPress={handleSubmit}
              style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
              disabled={!canSubmit}
            >
              <Text style={[styles.submitText, !canSubmit && styles.submitTextDisabled]}>
                Publier
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* User row */}
            <View style={styles.userRow}>
              <View style={styles.avatar}>
                {user?.photoBase64 ? (
                  <Image
                    source={{ uri: `data:image/jpeg;base64,${user.photoBase64}` }}
                    style={styles.avatarImage}
                  />
                ) : (
                  <Text style={styles.avatarEmoji}>{user?.avatar ?? '🦁'}</Text>
                )}
              </View>
              <View>
                <Text style={styles.username}>{user?.username ?? ''}</Text>
                <Text style={styles.subtext}>Partage avec tous les fans</Text>
              </View>
            </View>

            {/* Text input */}
            <TextInput
              style={styles.input}
              placeholder="Quoi de neuf sur le Barça ?"
              placeholderTextColor={Colors.textMuted}
              multiline
              autoFocus
              value={content}
              onChangeText={setContent}
              maxLength={500}
            />

            <Text style={[styles.charCount, content.length > 450 && { color: Colors.primary }]}>
              {content.length}/500
            </Text>

            {/* Emoji row */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.emojiRow}
              contentContainerStyle={styles.emojiRowContent}
            >
              {QUICK_EMOJIS.map(emoji => (
                <TouchableOpacity
                  key={emoji}
                  onPress={() => setContent(prev => prev + emoji)}
                  style={styles.emojiBtn}
                  activeOpacity={0.7}
                >
                  <Text style={styles.emojiText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Tags */}
            <Text style={styles.sectionTitle}>Catégorie</Text>
            <View style={styles.tagRow}>
              {TAG_OPTIONS.map(({ tag, label, color }) => (
                <TouchableOpacity
                  key={tag}
                  onPress={() => setSelectedTag(selectedTag === tag ? undefined : tag)}
                  style={[
                    styles.tagChip,
                    { borderColor: color + '60' },
                    selectedTag === tag && { backgroundColor: color + '28', borderColor: color },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.tagChipText,
                    { color: selectedTag === tag ? color : Colors.textSecondary },
                  ]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  flex: {
    flex: 1,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  cancelBtn: {
    paddingVertical: Spacing.sm,
    paddingRight: Spacing.sm,
  },
  cancelText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  toolbarTitle: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  submitBtnDisabled: {
    backgroundColor: Colors.surfaceLight,
  },
  submitText: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  submitTextDisabled: {
    color: Colors.textMuted,
  },
  body: {
    flex: 1,
    padding: Spacing.md,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.primary + '60',
  },
  avatarEmoji: {
    fontSize: 22,
  },
  avatarImage: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  username: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  subtext: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  input: {
    color: Colors.text,
    fontSize: FontSize.md,
    lineHeight: 24,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  charCount: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    textAlign: 'right',
    marginBottom: Spacing.md,
    marginTop: Spacing.xs,
  },
  emojiRow: {
    marginBottom: Spacing.lg,
  },
  emojiRowContent: {
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  emojiBtn: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emojiText: {
    fontSize: 20,
  },
  sectionTitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '700',
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingBottom: Spacing.xxl,
  },
  tagChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    backgroundColor: Colors.surfaceLight,
  },
  tagChipText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
});
