import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Modal,
  SafeAreaView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme';
import { useAuth } from '../context/AuthContext';

type Tab = 'login' | 'register';

function ForgotPasswordModal({ visible, initialIdentifier, onClose }: { visible: boolean; initialIdentifier: string; onClose: () => void }) {
  const { resetPassword } = useAuth();
  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setIdentifier(initialIdentifier);
      setSent(false);
      setError('');
    }
  }, [visible, initialIdentifier]);

  const handleSend = async () => {
    if (!identifier.trim()) {
      setError('Renseigne ton email ou ton pseudo.');
      return;
    }
    setError('');
    setSending(true);
    const result = await resetPassword(identifier);
    setSending(false);
    if (result.success) setSent(true);
    else setError(result.error ?? 'Impossible d\'envoyer le lien.');
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.forgotOverlay}>
        <View style={styles.forgotCard}>
          <View style={styles.forgotHeader}>
            <Text style={styles.forgotTitle}>Mot de passe oublié</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {sent ? (
            <View style={styles.forgotSentBox}>
              <Ionicons name="checkmark-circle" size={40} color={Colors.success} />
              <Text style={styles.forgotSentText}>
                Si un compte existe pour « {identifier.trim()} », un email de réinitialisation vient d'être envoyé.
              </Text>
              <TouchableOpacity style={styles.submitBtn} onPress={onClose} activeOpacity={0.85}>
                <Text style={styles.submitBtnText}>OK</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.forgotSub}>
                Entre ton email ou ton pseudo, on t'envoie un lien pour réinitialiser ton mot de passe.
              </Text>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email ou pseudo</Text>
                <TextInput
                  style={styles.input}
                  placeholder="email@exemple.com ou ton_pseudo"
                  placeholderTextColor={Colors.textMuted}
                  value={identifier}
                  onChangeText={setIdentifier}
                  autoCapitalize="none"
                />
              </View>

              {error !== '' && (
                <View style={styles.errorBox}>
                  <Ionicons name="warning-outline" size={15} color={Colors.error} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleSend}
                disabled={sending}
                activeOpacity={0.85}
              >
                {sending ? (
                  <ActivityIndicator color={Colors.text} />
                ) : (
                  <Text style={styles.submitBtnText}>Envoyer le lien</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function LinkAppleAccountModal({
  visible,
  email,
  onForgotPassword,
}: {
  visible: boolean;
  email: string;
  onForgotPassword: () => void;
}) {
  const { completeAppleLink, cancelAppleLink } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) { setPassword(''); setError(''); }
  }, [visible]);

  const handleClose = () => {
    cancelAppleLink();
  };

  const handleLink = async () => {
    if (!password) { setError('Entre ton mot de passe.'); return; }
    setError('');
    setLoading(true);
    const result = await completeAppleLink(password);
    setLoading(false);
    if (!result.success) setError(result.error ?? 'Mot de passe incorrect.');
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.forgotOverlay}>
        <View style={styles.forgotCard}>
          <View style={styles.forgotHeader}>
            <Text style={styles.forgotTitle}>Lier ton compte Apple</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.forgotSub}>
            Un compte existe déjà avec {email}. Entre son mot de passe pour connecter Apple à ce même compte (pas de nouveau compte créé).
          </Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Mot de passe</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={Colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <TouchableOpacity onPress={onForgotPassword} style={styles.forgotLink}>
            <Text style={styles.forgotLinkText}>Mot de passe oublié ?</Text>
          </TouchableOpacity>

          {error !== '' && (
            <View style={styles.errorBox}>
              <Ionicons name="warning-outline" size={15} color={Colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity style={styles.submitBtn} onPress={handleLink} disabled={loading} activeOpacity={0.85}>
            {loading ? (
              <ActivityIndicator color={Colors.text} />
            ) : (
              <Text style={styles.submitBtnText}>Lier le compte</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function AuthScreen() {
  const { login, register, loginWithApple, pendingAppleLinkEmail, cancelAppleLink } = useAuth();
  const [tab, setTab] = useState<Tab>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [forgotVisible, setForgotVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError('');
    if (!email || !password) {
      setError('Remplis tous les champs.');
      return;
    }
    if (tab === 'register' && !username) {
      setError('Choisis un pseudo.');
      return;
    }

    setSubmitting(true);
    const result = tab === 'login'
      ? await login(email, password)
      : await register(username, email, password);
    setSubmitting(false);
    if (!result.success) setError(result.error ?? 'Une erreur est survenue.');
  };

  const handleAppleSignIn = async () => {
    if (submitting) return;
    setError('');
    setSubmitting(true);
    const result = await loginWithApple();
    setSubmitting(false);
    if (!result.success && result.error) setError(result.error);
  };

  const handleForgotFromAppleLink = () => {
    setEmail(pendingAppleLinkEmail ?? '');
    cancelAppleLink();
    setForgotVisible(true);
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.authContainer}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <LinearGradient
            colors={[Colors.primary, '#6B0030']}
            style={styles.authHeader}
          >
            <View style={styles.authHeaderIcon}>
              <Ionicons name="football" size={32} color="#fff" />
            </View>
            <Text style={styles.authHeaderTitle}>
              {tab === 'login' ? 'Bon retour !' : 'Rejoins la Culer Nation !'}
            </Text>
            <Text style={styles.authHeaderSub}>
              {tab === 'login'
                ? 'Connecte-toi pour accéder à ton compte'
                : '200 pièces offertes à l\'inscription 🪙'}
            </Text>
          </LinearGradient>

          {/* Tabs */}
          <View style={styles.tabRow}>
            {(['login', 'register'] as Tab[]).map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
                onPress={() => { setTab(t); setError(''); }}
              >
                <Text style={[styles.tabBtnText, tab === t && styles.tabBtnTextActive]}>
                  {t === 'login' ? 'Connexion' : 'Inscription'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.formContainer}>
            {tab === 'register' && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Pseudo</Text>
                <TextInput
                  style={styles.input}
                  placeholder="ton_pseudo"
                  placeholderTextColor={Colors.textMuted}
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                />
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{tab === 'login' ? 'Email ou pseudo' : 'Email'}</Text>
              <TextInput
                style={styles.input}
                placeholder={tab === 'login' ? 'email ou pseudo' : 'email@exemple.com'}
                placeholderTextColor={Colors.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType={tab === 'login' ? 'default' : 'email-address'}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Mot de passe</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor={Colors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>

            {tab === 'login' && (
              <TouchableOpacity onPress={() => setForgotVisible(true)} style={styles.forgotLink}>
                <Text style={styles.forgotLinkText}>Mot de passe oublié ?</Text>
              </TouchableOpacity>
            )}

            {error !== '' && (
              <View style={styles.errorBox}>
                <Ionicons name="warning-outline" size={15} color={Colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color={Colors.text} />
              ) : (
                <Text style={styles.submitBtnText}>
                  {tab === 'login' ? 'Se connecter' : 'Créer mon compte'}
                </Text>
              )}
            </TouchableOpacity>

            {Platform.OS === 'ios' && (
              <>
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>ou</Text>
                  <View style={styles.dividerLine} />
                </View>
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                  cornerRadius={BorderRadius.md}
                  style={styles.appleBtn}
                  onPress={handleAppleSignIn}
                />
              </>
            )}
          </View>
        </ScrollView>

        <ForgotPasswordModal
          visible={forgotVisible}
          initialIdentifier={email}
          onClose={() => setForgotVisible(false)}
        />
        <LinkAppleAccountModal
          visible={!!pendingAppleLinkEmail}
          email={pendingAppleLinkEmail ?? ''}
          onForgotPassword={handleForgotFromAppleLink}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  authContainer: {
    flex: 1,
  },
  authHeader: {
    paddingTop: 60,
    paddingBottom: Spacing.xl,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
  },
  authHeaderIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  authHeaderTitle: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
  },
  authHeaderSub: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.7)',
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
  tabRow: {
    flexDirection: 'row',
    margin: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
  },
  tabBtnActive: {
    backgroundColor: Colors.primary,
  },
  tabBtnText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  tabBtnTextActive: {
    color: Colors.text,
    fontWeight: '700',
  },
  formContainer: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
  },
  inputGroup: {
    gap: Spacing.xs,
  },
  inputLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    color: Colors.text,
    fontSize: FontSize.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#3A0000',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.error,
  },
  errorText: {
    flex: 1,
    color: Colors.error,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  submitBtnText: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: '800',
  },
  forgotLink: {
    alignSelf: 'flex-end',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  appleBtn: {
    width: '100%',
    height: 48,
  },
  forgotLinkText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  forgotOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: Spacing.md,
  },
  forgotCard: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.md,
  },
  forgotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  forgotTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
  },
  forgotSub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  forgotSentBox: {
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  forgotSentText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
