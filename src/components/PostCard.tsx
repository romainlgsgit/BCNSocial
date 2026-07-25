import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useModeration } from '../context/ModerationContext';
import { usePremium } from '../context/PremiumContext';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme';
import { Post, PostTag } from '../types';
import CommentsModal from './CommentsModal';
import VerifiedBadge from './VerifiedBadge';
import { renderWithMentions } from '../utils/mentions';

const TAG_COLORS: Partial<Record<PostTag, string>> = {
  match: Colors.secondary,
  opinion: Colors.primary,
  news: Colors.gold,
};

const TAG_LABELS: Partial<Record<PostTag, string>> = {
  match: '⚽ Match',
  opinion: '💬 Opinion',
  news: '📰 News',
};

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

export default function PostCard({ post, onDelete }: { post: Post; onDelete?: () => void }) {
  const { user, isAdmin } = useAuth();
  const { deletePostAsAdmin } = useModeration();
  const { isPremium } = usePremium();
  const [imageRatio, setImageRatio] = useState<number | null>(null);
  const navigation = useNavigation<any>();
  const [showComments, setShowComments] = useState(false);

  // Like OPTIMISTE : mis à jour localement tout de suite (le feed paginé n'a plus
  // d'écouteur temps réel sur les vieux posts, donc on ne peut pas compter dessus).
  const [localLikedBy, setLocalLikedBy] = useState<string[]>(post.likedBy ?? []);
  useEffect(() => { setLocalLikedBy(post.likedBy ?? []); }, [post.likedBy]);
  const liked = user ? localLikedBy.includes(user.id) : false;
  const likeCount = localLikedBy.length;

  const isOwnPost = user?.id === post.userId;
  const isVerified = isOwnPost
    ? ((user?.verified ?? false) && isPremium)
    : (post.verified ?? false);
  // La certification or (manuelle) prend la place du badge bleu quand elle est présente
  const isGoldVerified = isOwnPost
    ? (user?.goldVerified ?? false)
    : (post.goldVerified ?? false);

  const tagColor = post.tag ? TAG_COLORS[post.tag] : undefined;

  const handleModerateDelete = () => {
    Alert.alert(
      'Supprimer ce post',
      `Post de ${post.username}. Il sera définitivement supprimé, avec ses commentaires.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try { await deletePostAsAdmin(post.id); }
            catch { Alert.alert('Erreur', 'La suppression a échoué.'); }
          },
        },
      ],
    );
  };

  const handleLike = async () => {
    if (!user) return;
    const postRef = doc(db, 'posts', post.id);
    const willLike = !liked;
    setLocalLikedBy(prev => willLike ? [...new Set([...prev, user.id])] : prev.filter(id => id !== user.id));
    try {
      await updateDoc(postRef, { likedBy: willLike ? arrayUnion(user.id) : arrayRemove(user.id) });
    } catch {
      setLocalLikedBy(prev => willLike ? prev.filter(id => id !== user.id) : [...prev, user.id]); // rollback si échec
    }
  };

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerLeft}
          onPress={() => navigation.navigate('UserProfile', { userId: post.userId })}
          activeOpacity={0.75}
        >
          <View style={[styles.avatar, tagColor && { backgroundColor: tagColor + '22' }]}>
            {post.avatarPhoto ? (
              <Image
                source={{ uri: `data:image/jpeg;base64,${post.avatarPhoto}` }}
                style={styles.avatarImage}
              />
            ) : (
              <Text style={styles.avatarEmoji}>{post.avatar}</Text>
            )}
          </View>

          <View style={styles.userMeta}>
            <View style={styles.usernameRow}>
              <Text style={styles.username}>{post.username}</Text>
              {(isGoldVerified || isVerified) && <VerifiedBadge size={15} gold={isGoldVerified} />}
            </View>
            <Text style={styles.time}>{formatTimeAgo(post.createdAt)}</Text>
          </View>
        </TouchableOpacity>

        {post.tag && tagColor && (
          <View style={[styles.tagPill, { backgroundColor: tagColor + '18', borderColor: tagColor + '40' }]}>
            <View style={[styles.tagDot, { backgroundColor: tagColor }]} />
            <Text style={[styles.tagText, { color: tagColor }]}>{TAG_LABELS[post.tag]}</Text>
          </View>
        )}

        {onDelete ? (
          <TouchableOpacity onPress={onDelete} activeOpacity={0.7} style={styles.deleteBtn}>
            <Ionicons name="trash-outline" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        ) : (isAdmin && !isOwnPost) ? (
          // Modération : l'admin peut supprimer n'importe quel post en naviguant.
          <TouchableOpacity onPress={handleModerateDelete} activeOpacity={0.7} style={styles.deleteBtn}>
            <Ionicons name="shield" size={16} color="#EF4444" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Content — @mentions en bleu cliquables + liens (TikTok/YouTube…) cliquables.
          Les liens sont activés pour les PUBLICATIONS uniquement (pas les commentaires). */}
      {post.content ? (
        <Text style={styles.content}>
          {renderWithMentions(
            post.content,
            post.mentionedUsers,
            (userId) => navigation.navigate('UserProfile', { userId }),
            { linkifyUrls: true },
          )}
        </Text>
      ) : null}

      {/* Image */}
      {post.imageBase64 ? (
        <Image
          source={{ uri: `data:image/jpeg;base64,${post.imageBase64}` }}
          style={[styles.postImage, imageRatio ? { aspectRatio: imageRatio } : { aspectRatio: 1 }]}
          resizeMode="cover"
          onLoad={e => {
            const { width, height } = e.nativeEvent.source;
            if (width && height) setImageRatio(width / height);
          }}
        />
      ) : null}

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={handleLike} activeOpacity={0.6} disabled={!user}>
          <Ionicons
            name={liked ? 'heart' : 'heart-outline'}
            size={18}
            color={liked ? '#FF4D6D' : Colors.textMuted}
          />
          <Text style={[styles.actionCount, liked && styles.likedCount]}>{likeCount}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} activeOpacity={0.6} onPress={() => setShowComments(true)}>
          <Ionicons name="chatbubble-outline" size={16} color={Colors.textMuted} />
          <Text style={styles.actionCount}>{post.comments}</Text>
        </TouchableOpacity>
      </View>

      <CommentsModal
        visible={showComments}
        postId={post.id}
        onClose={() => setShowComments(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#151515',
    marginHorizontal: 12,
    marginVertical: 5,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#242424',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarEmoji: {
    fontSize: 22,
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  userMeta: {
    flex: 1,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  username: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    lineHeight: 18,
  },
  time: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  tagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  tagDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '700',
  },
  content: {
    fontSize: 14,
    color: '#E8E8E8',
    lineHeight: 22,
    marginBottom: 10,
  },
  postImage: {
    width: '100%',
    borderRadius: 12,
    marginBottom: 14,
    backgroundColor: '#1a1a1a',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#242424',
    gap: 20,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  deleteBtn: {
    padding: 4,
    marginLeft: 4,
  },
  actionCount: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  likedCount: {
    color: '#FF4D6D',
  },
});
