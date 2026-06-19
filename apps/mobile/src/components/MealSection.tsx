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
        <View>
          <Text style={styles.title}>{meal.mealGroup.name}</Text>
          <Text style={styles.subtotal}>
            {Math.round(meal.totals.calories)} cal · P {Math.round(meal.totals.proteinG)}g · C{" "}
            {Math.round(meal.totals.carbsG)}g · F {Math.round(meal.totals.fatG)}g
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
          <Text style={styles.empty}>No entries</Text>
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
    gap: 10
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
    backgroundColor: "#E6F0F3",
    borderRadius: 8,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  entries: {
    gap: 8
  },
  empty: {
    color: colors.muted,
    fontSize: 13,
    paddingVertical: 4
  }
});
