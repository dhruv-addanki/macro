import type { MacroNutrients } from "@macro/shared";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

type Props = {
  label: string;
  value: number;
  target: number;
  color: string;
  unit?: string;
};

export function MacroBar({ label, value, target, color, unit = "g" }: Props) {
  const progress = target > 0 ? Math.min(1, value / target) : 0;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>
          {Math.round(value)}
          {unit} / {Math.round(target)}
          {unit}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

export function MacroSummary({ totals, goal }: { totals: MacroNutrients; goal: MacroNutrients }) {
  return (
    <View style={styles.summary}>
      <MacroBar label="Protein" value={totals.proteinG} target={goal.proteinG} color={colors.protein} />
      <MacroBar label="Carbs" value={totals.carbsG} target={goal.carbsG} color={colors.carbs} />
      <MacroBar label="Fat" value={totals.fatG} target={goal.fatG} color={colors.fat} />
      <View style={styles.secondarySummary}>
        <MacroBar label="Sugar" value={totals.sugarG ?? 0} target={goal.sugarG ?? 0} color={colors.warning} />
        <MacroBar label="Fiber" value={totals.fiberG} target={goal.fiberG} color={colors.success} />
        <MacroBar label="Sodium" value={totals.sodiumMg} target={goal.sodiumMg} color={colors.accent} unit="mg" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6
  },
  summary: {
    gap: 10
  },
  secondarySummary: {
    borderColor: colors.border,
    borderTopWidth: 1,
    gap: 10,
    paddingTop: 10
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700"
  },
  value: {
    color: colors.muted,
    fontSize: 12
  },
  track: {
    backgroundColor: "#ECE6DC",
    borderRadius: 999,
    height: 8,
    overflow: "hidden"
  },
  fill: {
    borderRadius: 999,
    height: "100%"
  }
});
