import { usePathname, useRouter } from "expo-router";
import { BarChart3, Home, Salad, ScanLine, User } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/colors";

const items = [
  { href: "/", label: "Home", icon: Home },
  { href: "/progress", label: "Analytics", icon: BarChart3 },
  { href: "/my-diet", label: "My Diet", icon: Salad },
  { href: "/profile", label: "Profile", icon: User }
] as const;

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.shell, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.nav}>
        {items.slice(0, 2).map((item) => (
          <NavItem key={item.href} active={pathname === item.href} item={item} onPress={() => router.push(item.href)} />
        ))}
        <View style={styles.actionSpace}>
          <Pressable accessibilityLabel="Add food" onPress={() => router.push("/add")} style={styles.actionButton}>
            <ScanLine color="#FFFFFF" size={27} strokeWidth={2.4} />
          </Pressable>
        </View>
        {items.slice(2).map((item) => (
          <NavItem key={item.href} active={pathname === item.href} item={item} onPress={() => router.push(item.href)} />
        ))}
      </View>
    </View>
  );
}

function NavItem({
  active,
  item,
  onPress
}: {
  active: boolean;
  item: (typeof items)[number];
  onPress: () => void;
}) {
  const Icon = item.icon;
  return (
    <Pressable accessibilityLabel={item.label} onPress={onPress} style={styles.item}>
      <Icon color={active ? colors.accent : colors.muted} size={20} strokeWidth={active ? 2.5 : 2} />
      <Text style={[styles.label, active && styles.labelActive]}>{item.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    shadowColor: "#10261B",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 14
  },
  nav: {
    alignItems: "flex-end",
    flexDirection: "row",
    minHeight: 68,
    paddingHorizontal: 8
  },
  item: {
    alignItems: "center",
    flex: 1,
    gap: 3,
    minHeight: 62,
    justifyContent: "center",
    paddingTop: 11
  },
  label: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "700"
  },
  labelActive: {
    color: colors.accent,
    fontWeight: "900"
  },
  actionSpace: {
    alignItems: "center",
    flex: 1,
    minHeight: 62
  },
  actionButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderColor: colors.background,
    borderRadius: 31,
    borderWidth: 6,
    height: 62,
    justifyContent: "center",
    marginTop: -23,
    shadowColor: colors.accentDark,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.24,
    shadowRadius: 12,
    width: 62
  }
});
