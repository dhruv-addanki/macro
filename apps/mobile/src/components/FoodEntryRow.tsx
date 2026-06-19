import type { DiaryEntry } from "@macro/shared";
import { Copy, Pencil, Trash2 } from "lucide-react-native";
import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";
import { ConfidenceBadge } from "./ConfidenceBadge";

type Props = {
  entry: DiaryEntry;
  date: string;
  onDelete?: () => void;
  onDuplicate?: () => void;
};

export function FoodEntryRow({ date, entry, onDelete, onDuplicate }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.main}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={styles.name}>
            {entry.displayName}
          </Text>
          <ConfidenceBadge confidence={entry.confidence} />
        </View>
        <Text style={styles.meta}>
          {entry.quantity} {entry.unit} · {Math.round(entry.grams)}g
        </Text>
        <Text style={styles.macros}>
          P {Math.round(entry.macros.proteinG)}g · C {Math.round(entry.macros.carbsG)}g · F{" "}
          {Math.round(entry.macros.fatG)}g
        </Text>
      </View>
      <View style={styles.side}>
        <Text style={styles.calories}>{Math.round(entry.macros.calories)}</Text>
        <Text style={styles.calLabel}>cal</Text>
        <View style={styles.actionRow}>
          <Link asChild href={{ pathname: "/entry/[id]", params: { id: entry.id, date } }}>
            <Pressable accessibilityLabel={`Edit ${entry.displayName}`} hitSlop={8} style={styles.iconAction}>
              <Pencil color={colors.accentDark} size={15} />
            </Pressable>
          </Link>
          {onDuplicate ? (
            <Pressable accessibilityLabel={`Duplicate ${entry.displayName}`} hitSlop={8} onPress={onDuplicate} style={styles.iconAction}>
              <Copy color={colors.accentDark} size={15} />
            </Pressable>
          ) : null}
          {onDelete ? (
            <Pressable accessibilityLabel={`Delete ${entry.displayName}`} hitSlop={8} onPress={onDelete} style={styles.iconAction}>
              <Trash2 color={colors.danger} size={15} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "flex-start",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 12
  },
  main: {
    flex: 1,
    gap: 4,
    minWidth: 0
  },
  titleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  name: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: "800"
  },
  meta: {
    color: colors.muted,
    fontSize: 12
  },
  macros: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "600"
  },
  side: {
    alignItems: "flex-end",
    marginLeft: 12
  },
  calories: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900"
  },
  calLabel: {
    color: colors.muted,
    fontSize: 11
  },
  actionRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 8
  },
  iconAction: {
    alignItems: "center",
    backgroundColor: "#F7F4EF",
    borderRadius: 8,
    height: 28,
    justifyContent: "center",
    width: 28
  }
});
