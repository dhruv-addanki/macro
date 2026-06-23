import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router, Stack, useGlobalSearchParams, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api, hasSessionToken, hydrateSessionToken, setSessionToken } from "../src/api/client";

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <View style={styles.errorScreen}>
      <Text style={styles.errorTitle}>Macro could not render</Text>
      <Text style={styles.errorText}>{error.message}</Text>
      <Pressable onPress={retry} style={styles.retryButton}>
        <Text style={styles.retryText}>Retry</Text>
      </Pressable>
    </View>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const token = await hydrateSessionToken();
      if (token) {
        try {
          const session = await api.getAuthSession();
          if (!session.authenticated) {
            await setSessionToken(null);
          }
        } catch {
          // Keep the session during transient network failures so retry remains possible.
        }
      }
      if (mounted) setSessionReady(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (!sessionReady) {
    return (
      <View style={styles.loadingScreen}>
        <Text style={styles.loadingTitle}>Macro</Text>
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: "#F7F4EF" },
          headerTitleStyle: { color: "#171717", fontWeight: "700" },
          contentStyle: { backgroundColor: "#F7F4EF" }
        }}
      >
        <Stack.Screen name="auth" options={{ title: "Login" }} />
        <Stack.Screen name="index" options={{ title: "Macro" }} />
        <Stack.Screen name="add" options={{ title: "Add food", presentation: "modal" }} />
        <Stack.Screen name="entry/[id]" options={{ title: "Edit entry" }} />
        <Stack.Screen name="onboarding" options={{ title: "Setup" }} />
        <Stack.Screen name="saved" options={{ title: "Saved" }} />
        <Stack.Screen name="progress" options={{ title: "Progress" }} />
        <Stack.Screen name="profile" options={{ title: "Profile" }} />
      </Stack>
      <AuthRouteGuard />
      <ProfileReturnHandler />
    </QueryClientProvider>
  );
}

function AuthRouteGuard() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/auth" && !hasSessionToken()) {
      setTimeout(() => router.replace("/auth"), 0);
    }
  }, [pathname]);

  return null;
}

function ProfileReturnHandler() {
  const params = useGlobalSearchParams<{ goProfile?: string }>();

  useEffect(() => {
    if (params.goProfile === "1") {
      setTimeout(() => router.replace("/profile"), 0);
    }
  }, [params.goProfile]);

  return null;
}

const styles = StyleSheet.create({
  loadingScreen: {
    alignItems: "center",
    backgroundColor: "#F7F4EF",
    flex: 1,
    justifyContent: "center"
  },
  loadingTitle: {
    color: "#171717",
    fontSize: 24,
    fontWeight: "900"
  },
  errorScreen: {
    alignItems: "flex-start",
    backgroundColor: "#F7F4EF",
    flex: 1,
    gap: 12,
    justifyContent: "center",
    padding: 24
  },
  errorTitle: {
    color: "#171717",
    fontSize: 22,
    fontWeight: "900"
  },
  errorText: {
    color: "#6F6A61",
    fontSize: 14,
    lineHeight: 20
  },
  retryButton: {
    backgroundColor: "#1B6D8F",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 11
  },
  retryText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900"
  }
});
