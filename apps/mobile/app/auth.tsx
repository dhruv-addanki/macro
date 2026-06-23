import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { AUTH_DRIVER, DEMO_AUTH_ENABLED, api, setSessionToken, supabaseLogin, supabaseSignup } from "../src/api/client";
import { colors } from "../src/theme/colors";

type AuthMode = "login" | "signup";

export default function AuthScreen() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const usesSupabaseAuth = AUTH_DRIVER === "supabase";

  const authMutation = useMutation({
    mutationFn: async () => {
      setError(null);
      const trimmedEmail = email.trim();
      const trimmedPassword = password.trim();
      const response = usesSupabaseAuth
        ? mode === "signup"
          ? await supabaseSignup({ email: trimmedEmail, password: trimmedPassword, displayName: displayName.trim() || undefined })
          : await supabaseLogin({ email: trimmedEmail, password: trimmedPassword })
        : mode === "signup"
          ? await api.signup({ email: trimmedEmail, displayName: displayName.trim() || undefined })
          : await api.login({ email: trimmedEmail });
      await setSessionToken(response.sessionToken);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      await queryClient.invalidateQueries({ queryKey: ["auth-session"] });
      return response;
    },
    onSuccess: () => {
      router.replace("/");
    },
    onError: (mutationError) => {
      setError(mutationError instanceof Error ? mutationError.message : "Authentication failed.");
    }
  });

  const demoMutation = useMutation({
    mutationFn: async () => {
      setError(null);
      const response = await api.login({ email: "demo@macro.local" });
      await setSessionToken(response.sessionToken);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      await queryClient.invalidateQueries({ queryKey: ["auth-session"] });
      return response;
    },
    onSuccess: () => {
      router.replace("/");
    },
    onError: (mutationError) => {
      setError(mutationError instanceof Error ? mutationError.message : "Demo login failed.");
    }
  });

  const loading = authMutation.isPending || demoMutation.isPending;
  const missingRequiredInput = !email.trim() || (usesSupabaseAuth && !password.trim());

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.panel}>
        <Text style={styles.title}>Macro</Text>
        <Text style={styles.subtitle}>
          {usesSupabaseAuth
            ? mode === "signup"
              ? "Create your account"
              : "Sign in to continue"
            : mode === "signup"
              ? "Create a local account"
              : "Sign in to continue"}
        </Text>

        <View style={styles.segmented}>
          <ModeButton active={mode === "login"} label="Login" onPress={() => setMode("login")} />
          <ModeButton active={mode === "signup"} label="Sign up" onPress={() => setMode("signup")} />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="you@example.com"
            style={styles.input}
            value={email}
          />
        </View>

        {usesSupabaseAuth ? (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              onChangeText={setPassword}
              placeholder="Password"
              secureTextEntry
              style={styles.input}
              value={password}
            />
          </View>
        ) : null}

        {mode === "signup" ? (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Display name</Text>
            <TextInput onChangeText={setDisplayName} placeholder="Name" style={styles.input} value={displayName} />
          </View>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          accessibilityLabel={mode === "signup" ? "Create account" : "Login"}
          disabled={loading || missingRequiredInput}
          onPress={() => authMutation.mutate()}
          style={[styles.primaryButton, (loading || missingRequiredInput) && styles.buttonDisabled]}
        >
          {authMutation.isPending ? <ActivityIndicator color="#FFFFFF" /> : null}
          <Text style={styles.primaryButtonText}>{mode === "signup" ? "Create account" : "Login"}</Text>
        </Pressable>

        {!usesSupabaseAuth && DEMO_AUTH_ENABLED ? (
          <Pressable
            accessibilityLabel="Use demo account"
            disabled={loading}
            onPress={() => demoMutation.mutate()}
            style={[styles.secondaryButton, loading && styles.buttonDisabled]}
          >
            {demoMutation.isPending ? <ActivityIndicator color={colors.accentDark} /> : null}
            <Text style={styles.secondaryButtonText}>Use demo</Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}

function ModeButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.segmentButton, active && styles.segmentButtonActive]}>
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    backgroundColor: colors.background,
    flexGrow: 1,
    justifyContent: "center",
    padding: 16
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    padding: 16
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900"
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "700"
  },
  segmented: {
    backgroundColor: "#E6F0F3",
    borderRadius: 8,
    flexDirection: "row",
    gap: 6,
    padding: 5
  },
  segmentButton: {
    alignItems: "center",
    borderRadius: 7,
    flex: 1,
    minHeight: 38,
    justifyContent: "center"
  },
  segmentButtonActive: {
    backgroundColor: colors.accent
  },
  segmentText: {
    color: colors.accentDark,
    fontSize: 13,
    fontWeight: "900"
  },
  segmentTextActive: {
    color: "#FFFFFF"
  },
  inputGroup: {
    gap: 6
  },
  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800"
  },
  input: {
    backgroundColor: "#FBFAF7",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 11
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900"
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "#E6F0F3",
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 11
  },
  secondaryButtonText: {
    color: colors.accentDark,
    fontSize: 14,
    fontWeight: "900"
  },
  errorText: {
    color: "#B9443F",
    fontSize: 13,
    fontWeight: "800"
  },
  buttonDisabled: {
    opacity: 0.6
  }
});
