import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme';
import { useAuth } from '../context/AuthContext';
import { formatRemaining } from '../utils/ban';
import { serverNow } from '../utils/serverTime';

/**
 * Écran affiché à la place de l'app quand le compte est banni.
 *
 * Le compte à rebours suit l'heure SERVEUR : modifier la date de l'appareil ne
 * change pas le temps restant. La seule sortie est la déconnexion — et se
 * reconnecter ramènera ici tant que le bannissement court.
 */
export default function BannedScreen() {
  const { banVerdict, logout, user } = useAuth();
  const [, tick] = useState(0);

  // Rafraîchit le compte à rebours chaque minute (et laisse l'app repartir toute
  // seule à l'expiration, sans redémarrage).
  useEffect(() => {
    const id = setInterval(() => tick(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!banVerdict.banned) return null;
  const permanent = banVerdict.permanent;
  const remaining = permanent ? null : Math.max(0, banVerdict.until - serverNow());

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={permanent ? ['#3A0A0A', '#1A0505'] : ['#3A2A00', '#1A1200']}
        style={styles.card}
      >
        <View style={styles.iconCircle}>
          <Ionicons
            name={permanent ? 'ban' : 'time-outline'}
            size={44}
            color={permanent ? '#EF4444' : Colors.gold}
          />
        </View>

        <Text style={styles.title}>
          {permanent ? 'Compte banni définitivement' : 'Compte suspendu'}
        </Text>

        {permanent ? (
          <Text style={styles.text}>
            Ton compte a été banni définitivement pour non-respect des règles de la
            communauté. Cette décision est irréversible et la création d'un nouveau
            compte avec cette adresse ou ce pseudo est bloquée.
          </Text>
        ) : (
          <>
            <Text style={styles.text}>
              Ton compte est temporairement suspendu pour non-respect des règles de
              la communauté. Tu pourras à nouveau publier à la fin de la suspension.
            </Text>
            <View style={styles.countdownBox}>
              <Text style={styles.countdownLabel}>Temps restant</Text>
              <Text style={styles.countdownValue}>{formatRemaining(remaining ?? 0)}</Text>
            </View>
          </>
        )}

        {banVerdict.reason ? (
          <View style={styles.reasonBox}>
            <Text style={styles.reasonLabel}>Motif</Text>
            <Text style={styles.reasonText}>{banVerdict.reason}</Text>
          </View>
        ) : null}

        {user?.username ? (
          <Text style={styles.account}>Compte : {user.username}</Text>
        ) : null}

        <TouchableOpacity style={styles.btn} onPress={logout} activeOpacity={0.85}>
          <Text style={styles.btnText}>Se déconnecter</Text>
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  card: {
    width: '100%',
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  title: { color: Colors.text, fontSize: FontSize.xl, fontWeight: '900', textAlign: 'center' },
  text: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: FontSize.sm,
    lineHeight: 21,
    textAlign: 'center',
  },
  countdownBox: {
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gold + '40',
  },
  countdownLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  countdownValue: { color: Colors.gold, fontSize: FontSize.xl, fontWeight: '900', marginTop: 4 },
  reasonBox: {
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: 3,
  },
  reasonLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  reasonText: { color: 'rgba(255,255,255,0.85)', fontSize: FontSize.sm, lineHeight: 19 },
  account: { color: 'rgba(255,255,255,0.4)', fontSize: FontSize.xs },
  btn: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: BorderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    marginTop: Spacing.xs,
  },
  btnText: { color: Colors.text, fontSize: FontSize.md, fontWeight: '800' },
});
