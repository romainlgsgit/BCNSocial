import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Platform,
  SafeAreaView,
  ActivityIndicator,
  Image,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  collection,
  addDoc,
  onSnapshot,
  orderBy,
  query,
  doc,
  updateDoc,
  deleteDoc,
  increment,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useModeration } from '../context/ModerationContext';
import { usePremium } from '../context/PremiumContext';
import { Comment } from '../types';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme';
import VerifiedBadge from './VerifiedBadge';

function formatTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'À l\'instant';
  if (mins < 60) return `${mins}min`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}j`;
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

interface Props {
  visible: boolean;
  postId: string;
  onClose: () => void;
}

export default function CommentsModal({ visible, postId, onClose }: Props) {
  const { user, isAdmin } = useAuth();
  const { isPremium } = usePremium();
  const insets = useSafeAreaInsets();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => setKeyboardHeight(e.endCoordinates.height)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardHeight(0)
    );
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  useEffect(() => {
    if (!visible || !postId) return;
    setLoading(true);
    const q = query(
      collection(db, 'posts', postId, 'comments'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setComments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Comment)));
      setLoading(false);
    });
    return () => unsub();
  }, [visible, postId]);

  const handleDelete = async (commentId: string) => {
    await deleteDoc(doc(db, 'posts', postId, 'comments', commentId));
    await updateDoc(doc(db, 'posts', postId), { comments: increment(-1) });
  };

  const handleSubmit = async () => {
    if (!user || !text.trim() || submitting) return;
    setSubmitting(true);
    const content = text.trim();
    setText('');
    try {
      await addDoc(collection(db, 'posts', postId, 'comments'), {
        userId: user.id,
        username: user.username,
        avatar: user.avatar,
        avatarPhoto: user.photoBase64 ?? null,
        verified: user.verified ?? false,
        goldVerified: user.goldVerified ?? false,
        content,
        createdAt: new Date().toISOString(),
      });
      await updateDoc(doc(db, 'posts', postId), { comments: increment(1) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.root}>
        <View style={[styles.flex, { paddingBottom: keyboardHeight > 0 ? keyboardHeight - insets.bottom : 0 }]}>
          {/* Toolbar */}
          <View style={styles.toolbar}>
            <View style={styles.dragHandle} />
            <View style={styles.toolbarRow}>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="chevron-down" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
              <Text style={styles.toolbarTitle}>Commentaires</Text>
              <View style={{ width: 40 }} />
            </View>
          </View>

          {/* Comments list */}
          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : (
            <FlatList
              data={comments}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.centered}>
                  <View style={styles.emptyIconCircle}>
                    <Ionicons name="chatbubbles-outline" size={38} color={Colors.primary} />
                  </View>
                  <Text style={styles.emptyTitle}>Aucun commentaire</Text>
                  <Text style={styles.emptyText}>Sois le premier à donner ton avis !</Text>
                </View>
              }
              renderItem={({ item }) => (
                <View style={styles.commentRow}>
                  <View style={styles.avatar}>
                    {(() => {
                      const photo = item.userId === user?.id ? user?.photoBase64 : item.avatarPhoto;
                      return photo ? (
                        <Image
                          source={{ uri: `data:image/jpeg;base64,${photo}` }}
                          style={styles.avatarImg}
                        />
                      ) : (
                        <Text style={styles.avatarEmoji}>{item.avatar}</Text>
                      );
                    })()}
                  </View>
                  <View style={styles.commentBubble}>
                    <View style={styles.commentHeader}>
                      <Text style={styles.commentUsername}>{item.username}</Text>
                      {(() => {
                        // Pour ses propres commentaires, on suit l'état live du compte
                        // plutôt que la copie figée dans le doc du commentaire.
                        const isMine = item.userId === user?.id;
                        const gold = isMine ? (user?.goldVerified ?? false) : (item.goldVerified ?? false);
                        const blue = isMine ? ((user?.verified ?? false) && isPremium) : (item.verified ?? false);
                        if (!gold && !blue) return null;
                        return <VerifiedBadge size={13} gold={gold} />;
                      })()}
                      <Text style={styles.commentTime}>{formatTimeAgo(item.createdAt)}</Text>
                      {(user?.id === item.userId || isAdmin) && (
                        <TouchableOpacity
                          onPress={() => handleDelete(item.id)}
                          style={styles.deleteCommentBtn}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="trash-outline" size={13} color={Colors.textMuted} />
                        </TouchableOpacity>
                      )}
                    </View>
                    <Text style={styles.commentText}>{item.content}</Text>
                  </View>
                </View>
              )}
            />
          )}

          {/* Input */}
          {user && (
            <View style={styles.inputRow}>
              <View style={styles.inputAvatar}>
                {user.photoBase64 ? (
                  <Image
                    source={{ uri: `data:image/jpeg;base64,${user.photoBase64}` }}
                    style={styles.avatarImg}
                  />
                ) : (
                  <Text style={styles.avatarEmoji}>{user.avatar}</Text>
                )}
              </View>
              <TextInput
                style={styles.input}
                placeholder="Ajoute un commentaire..."
                placeholderTextColor={Colors.textMuted}
                value={text}
                onChangeText={setText}
                multiline
                maxLength={300}
              />
              <TouchableOpacity
                style={[styles.sendBtn, (!text.trim() || submitting) && styles.sendBtnDisabled]}
                onPress={handleSubmit}
                disabled={!text.trim() || submitting}
              >
                <Ionicons
                  name="send"
                  size={18}
                  color={text.trim() && !submitting ? Colors.text : Colors.textMuted}
                />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </SafeAreaView>
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
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: 14,
  },
  dragHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3a3a3a',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 14,
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
  },
  toolbarTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  closeBtn: {
    width: 40,
    alignItems: 'flex-start',
  },
  listContent: {
    padding: Spacing.md,
    gap: Spacing.md,
    flexGrow: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary + '15',
    borderWidth: 1.5,
    borderColor: Colors.primary + '30',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
  },
  commentRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'flex-start',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  inputAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarEmoji: {
    fontSize: 18,
  },
  avatarImg: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  commentBubble: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  commentUsername: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  commentTime: {
    color: Colors.textMuted,
    fontSize: 11,
    flex: 1,
  },
  deleteCommentBtn: {
    paddingLeft: 4,
  },
  commentText: {
    color: '#E8E8E8',
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  input: {
    flex: 1,
    color: Colors.text,
    fontSize: FontSize.sm,
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    maxHeight: 100,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: Colors.surfaceLight,
  },
});
