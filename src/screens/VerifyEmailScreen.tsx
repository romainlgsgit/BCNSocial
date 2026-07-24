import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  ActivityIndicator, Alert, AppState,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme';
import { useAuth } from '../context/AuthContext';
import { maskEmail, resendCooldownLeft, RESEND_COOLDOWN_MS } from '../utils/emailVerification';

/**
 * Écran bloquant tant que l'adresse email n'est pas confirmée.
 *
 * Firebase envoie un LIEN (et non un code) depuis son infrastructure Google :
 * sans domaine authentifié (SPF/DKIM/DMARC), un mail émis par nos soins finirait
 * en indésirables chez Gmail. Le lien s'ouvre dans le navigateur, hors de l'app —
 * d'où la vérification automatique au retour au premier plan.
 */
export default function VerifyEmailScreen() {
  const { user, logout, resendVerificationEmail, refreshEmailVerified } = useAuth();
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [lastSentAt, setLastSentAt] = useState<number | null>(Date.now());
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_MS);
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  // Décompte du délai de renvoi
  useEffect(() => {
    const id = setInterval(() => {
      setCooldown(resendCooldownLeft(lastSentAt, Date.now()));
    }, 1000);
    return () => clearInterval(id);
  }, [lastSentAt]);

  // Le lien se clique hors de l'app : on revérifie au retour au premier plan,
  // et périodiquement, pour débloquer sans que l'utilisateur ait à toucher quoi
  // que ce soit.
  useEffect(() => {
    const check = () => { refreshEmailVerified().catch(() => {}); };
    const sub = AppState.addEventListener('change', s => { if (s === 'active') check(); });
    const id = setInterval(check, 5000);
    return () => { sub.remove(); clearInterval(id); };
  }, [refreshEmailVerified]);

  const handleCheck = async () => {
    setChecking(true);
    const verified = await refreshEmailVerified();
    if (!mounted.current) return;
    setChecking(false);
    if (!verified) {
      Alert.alert(
        'Pas encore confirmée',
        'Ouvre le lien reçu par mail, puis reviens ici. Pense à regarder dans les indésirables.',
      );
    }
  };

  const handleResend = async () => {
    setSending(true);
    const res = await resendVerificationEmail();
    if (!mounted.current) return;
    setSending(false);
    if (res.success) {
      setLastSentAt(Date.now());
      setCooldown(RESEND_COOLDOWN_MS);
      Alert.alert('Mail envoyé', 'Un nouveau lien de confirmation vient de partir.');
    } else {
      Alert.alert('Erreur', res.error ?? "Le mail n'a pas pu être envoyé.");
    }
  };

  const canResend = cooldown <= 0 && !sending;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#00336B', '#001B38']} style={styles.card}>
        <View style={styles.iconCircle}>
          <Ionicons name="mail-unread-outline" size={42} color={Colors.gold} />
        </View>

        <Text style={styles.title}>Confirme ton adresse</Text>
        <Text style={styles.text}>
          Un lien de confirmation a été envoyé à{'\n'}
          <Text style={styles.email}>{user?.email ? maskEmail(user.email) : 'ton adresse'}</Text>
        </Text>
        <Text style={styles.hint}>
          Ouvre le mail et clique sur le lien pour activer ton compte. L'app se
          débloque automatiquement.
        </Text>

        <TouchableOpacity style={styles.primaryBtn} onPress={handleCheck} disabled={checking} activeOpacity={0.85}>
          {checking
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.primaryBtnText}>J'ai confirmé, vérifier</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryBtn, !canResend && styles.disabled]}
          onPress={handleResend}
          disabled={!canResend}
          activeOpacity={0.85}
        >
          {sending ? (
            <ActivityIndicator color={Colors.gold} />
          ) : (
            <Text style={styles.secondaryBtnText}>
              {cooldown > 0
                ? `Renvoyer le mail (${Math.ceil(cooldown / 1000)} s)`
                : 'Renvoyer le mail'}
            </Text>
          )}
        </TouchableOpacity>

        <View style={styles.spamBox}>
          <Ionicons name="information-circle-outline" size={15} color="rgba(255,255,255,0.55)" />
          <Text style={styles.spamText}>
            Rien reçu ? Regarde dans tes indésirables ou l'onglet Promotions, et
            vérifie que l'adresse saisie est la bonne.
          </Text>
        </View>

        <TouchableOpacity onPress={logout} activeOpacity={0.7}>
          <Text style={styles.logout}>Se déconnecter</Text>
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1, backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center', padding: Spacing.lg,
  },
  card: {
    width: '100%', borderRadius: BorderRadius.lg, padding: Spacing.xl,
    alignItems: 'center', gap: Spacing.md,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  iconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.gold + '55',
  },
  title: { color: Colors.text, fontSize: FontSize.xl, fontWeight: '900', textAlign: 'center' },
  text: {
    color: 'rgba(255,255,255,0.8)', fontSize: FontSize.sm,
    lineHeight: 21, textAlign: 'center',
  },
  email: { color: Colors.gold, fontWeight: '800' },
  hint: {
    color: 'rgba(255,255,255,0.55)', fontSize: FontSize.xs,
    lineHeight: 17, textAlign: 'center',
  },
  primaryBtn: {
    width: '100%', backgroundColor: Colors.primary, borderRadius: BorderRadius.md,
    paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.xs,
  },
  primaryBtnText: { color: '#fff', fontSize: FontSize.md, fontWeight: '800' },
  secondaryBtn: {
    width: '100%', borderRadius: BorderRadius.md, paddingVertical: 13,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: Colors.gold + '80',
  },
  secondaryBtnText: { color: Colors.gold, fontSize: FontSize.sm, fontWeight: '800' },
  disabled: { opacity: 0.45 },
  spamBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: BorderRadius.md, padding: Spacing.md,
  },
  spamText: { flex: 1, color: 'rgba(255,255,255,0.6)', fontSize: FontSize.xs, lineHeight: 17 },
  logout: {
    color: 'rgba(255,255,255,0.5)', fontSize: FontSize.sm,
    fontWeight: '700', paddingVertical: Spacing.sm,
  },
});
