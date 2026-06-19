import type { Confidence } from "@macro/shared";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

const badgeColors: Record<Confidence, string> = {
  high: colors.success,
  medium: colors.warning,
  low: colors.danger
};

export function ConfidenceBadge({ confidence }: { confidence?: Confidence }) {
  if (!confidence) return null;

  return (
    <View style={[styles.badge, { borderColor: badgeColors[confidence] }]}>
      <Text style={[styles.text, { color: badgeColors[confidence] }]}>{confidence}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  text: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase"
  }
});
