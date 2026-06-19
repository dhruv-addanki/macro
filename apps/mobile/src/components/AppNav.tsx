import { usePathname, useRouter } from "expo-router";
import { BarChart3, BookMarked, CalendarDays, User } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

const items = [
  { href: "/", label: "Diary", icon: CalendarDays },
  { href: "/saved", label: "Saved", icon: BookMarked },
  { href: "/progress", label: "Progress", icon: BarChart3 },
  { href: "/profile", label: "Profile", icon: User }
] as const;

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <View style={styles.nav}>
      {items.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
        return (
          <Pressable
            key={item.href}
            accessibilityLabel={item.label}
            onPress={() => router.push(item.href)}
            style={[styles.item, active && styles.itemActive]}
          >
            <Icon color={active ? "#FFFFFF" : colors.accentDark} size={18} />
            <Text style={[styles.label, active && styles.labelActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    padding: 6
  },
  item: {
    alignItems: "center",
    borderRadius: 7,
    flex: 1,
    gap: 4,
    minHeight: 54,
    justifyContent: "center",
    paddingHorizontal: 4,
    paddingVertical: 8
  },
  itemActive: {
    backgroundColor: colors.accent
  },
  label: {
    color: colors.accentDark,
    fontSize: 11,
    fontWeight: "900"
  },
  labelActive: {
    color: "#FFFFFF"
  }
});
