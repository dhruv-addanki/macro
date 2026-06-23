import type { DiaryMeal } from "@macro/shared";
import { Plus, Save } from "lucide-react-native";
import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";
import { FoodEntryRow } from "./FoodEntryRow";

type Props = {
  meal: DiaryMeal;
  date: string;
  onDeleteEntry: (id: string) => void;
  onDuplicateEntry: (id: string) => void;
  onSaveMeal: (meal: DiaryMeal) => void;
};

export function MealSection({ meal, date, onDeleteEntry, onDuplicateEntry, onSaveMeal }: Props) {
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{meal.mealGroup.name}</Text>
          <Text style={styles.subtotal}>
            {Math.round(meal.totals.calories)} cal · {meal.entries.length} item(s)
          </Text>
        </View>
        <View style={styles.headerActions}>
          {meal.entries.length > 0 ? (
            <Pressable accessibilityLabel={`Save ${meal.mealGroup.name}`} onPress={() => onSaveMeal(meal)} style={styles.addButton}>
              <Save color={colors.accentDark} size={17} />
            </Pressable>
          ) : null}
          <Link
            asChild
            href={{
              pathname: "/add",
              params: { mealGroupId: meal.mealGroup.id, date }
            }}
          >
            <Pressable accessibilityLabel={`Add food to ${meal.mealGroup.name}`} style={styles.addButton}>
              <Plus color={colors.accentDark} size={18} />
            </Pressable>
          </Link>
        </View>
      </View>

      <View style={styles.entries}>
        {meal.entries.length === 0 ? (
          <Link
            asChild
            href={{
              pathname: "/add",
              params: { mealGroupId: meal.mealGroup.id, date }
            }}
          >
            <Pressable accessibilityLabel={`Add food to ${meal.mealGroup.name}`} style={styles.emptyAction}>
              <Plus color={colors.accent} size={18} />
              <Text style={styles.empty}>Add {meal.mealGroup.name.toLowerCase()}</Text>
            </Pressable>
          </Link>
        ) : (
          meal.entries.map((entry) => (
            <FoodEntryRow
              key={entry.id}
              date={date}
              entry={entry}
              onDelete={() => onDeleteEntry(entry.id)}
              onDuplicate={() => onDuplicateEntry(entry.id)}
            />
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 14
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  headerActions: {
    flexDirection: "row",
    gap: 8
  },
  headerCopy: {
    flex: 1,
    minWidth: 0
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900"
  },
  subtotal: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2
  },
  addButton: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: 8,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  entries: {
    gap: 8
  },
  emptyAction: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 12
  },
  empty: {
    color: colors.accentDark,
    fontSize: 13,
    fontWeight: "800"
  }
});
