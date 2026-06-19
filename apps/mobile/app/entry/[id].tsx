import type { DiaryEntry, MacroNutrients } from "@macro/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { Check } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../../src/api/client";
import { ConfidenceBadge } from "../../src/components/ConfidenceBadge";
import { colors } from "../../src/theme/colors";
import { todayIso } from "../../src/utils/date";

type EntryDraft = {
  displayName: string;
  quantity: string;
  unit: string;
  grams: string;
  calories: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
  sugarG: string;
  fiberG: string;
  sodiumMg: string;
  mealGroupId: string;
};

function draftFromEntry(entry: DiaryEntry): EntryDraft {
  return {
    displayName: entry.displayName,
    quantity: String(entry.quantity),
    unit: entry.unit,
    grams: String(Math.round(entry.grams)),
    calories: String(Math.round(entry.macros.calories)),
    proteinG: String(Math.round(entry.macros.proteinG)),
    carbsG: String(Math.round(entry.macros.carbsG)),
    fatG: String(Math.round(entry.macros.fatG)),
    sugarG: String(Math.round(entry.macros.sugarG ?? 0)),
    fiberG: String(Math.round(entry.macros.fiberG)),
    sodiumMg: String(Math.round(entry.macros.sodiumMg)),
    mealGroupId: entry.mealGroupId
  };
}

function positive(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function zeroable(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export default function EditEntryScreen() {
  const params = useLocalSearchParams<{ id?: string; date?: string }>();
  const id = params.id ?? "";
  const date = params.date ?? todayIso();
  const queryClient = useQueryClient();
  const diaryQuery = useQuery({ queryKey: ["diary", date], queryFn: () => api.getDiary(date) });
  const meQuery = useQuery({ queryKey: ["me"], queryFn: api.getMe });

  const entry = useMemo(
    () => diaryQuery.data?.meals.flatMap((meal) => meal.entries).find((item) => item.id === id),
    [diaryQuery.data, id]
  );

  const [draft, setDraft] = useState<EntryDraft | null>(null);

  useEffect(() => {
    if (entry) {
      setDraft(draftFromEntry(entry));
    }
  }, [entry]);

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!entry || !draft) throw new Error("Entry is not ready");
      const macros: MacroNutrients = {
        calories: zeroable(draft.calories, entry.macros.calories),
        proteinG: zeroable(draft.proteinG, entry.macros.proteinG),
        carbsG: zeroable(draft.carbsG, entry.macros.carbsG),
        fatG: zeroable(draft.fatG, entry.macros.fatG),
        sugarG: zeroable(draft.sugarG, entry.macros.sugarG ?? 0),
        fiberG: zeroable(draft.fiberG, entry.macros.fiberG),
        sodiumMg: zeroable(draft.sodiumMg, entry.macros.sodiumMg)
      };

      return api.updateEntry(entry.id, {
        displayName: draft.displayName.trim() || entry.displayName,
        quantity: positive(draft.quantity, entry.quantity),
        unit: draft.unit.trim() || entry.unit,
        grams: positive(draft.grams, entry.grams),
        macros,
        mealGroupId: draft.mealGroupId
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["diary", date] });
      router.back();
    }
  });

  if (diaryQuery.isLoading || meQuery.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!entry || !draft) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>Entry not found</Text>
        <Text style={styles.emptyBody}>Go back to the diary and try again.</Text>
      </View>
    );
  }

  const mealGroups = meQuery.data?.mealGroups ?? [];

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.panel}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Edit food entry</Text>
            <Text style={styles.meta}>{date}</Text>
          </View>
          <ConfidenceBadge confidence={entry.confidence} />
        </View>

        <EditField
          accessibilityLabel="Entry food name"
          label="Name"
          onChangeText={(value) => setDraft((current) => current && { ...current, displayName: value })}
          value={draft.displayName}
        />

        <Text style={styles.sectionLabel}>Meal</Text>
        <View style={styles.chipRow}>
          {mealGroups.map((mealGroup) => (
            <Pressable
              key={mealGroup.id}
              accessibilityLabel={`Move to ${mealGroup.name}`}
              onPress={() => setDraft((current) => current && { ...current, mealGroupId: mealGroup.id })}
              style={[styles.chip, draft.mealGroupId === mealGroup.id && styles.chipActive]}
            >
              <Text style={[styles.chipText, draft.mealGroupId === mealGroup.id && styles.chipTextActive]}>
                {mealGroup.name}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.twoCol}>
          <EditField
            accessibilityLabel="Entry quantity"
            keyboardType="decimal-pad"
            label="Qty"
            onChangeText={(value) => setDraft((current) => current && { ...current, quantity: value })}
            value={draft.quantity}
          />
          <EditField
            accessibilityLabel="Entry unit"
            label="Unit"
            onChangeText={(value) => setDraft((current) => current && { ...current, unit: value })}
            value={draft.unit}
          />
        </View>

        <View style={styles.twoCol}>
          <EditField
            accessibilityLabel="Entry grams"
            keyboardType="decimal-pad"
            label="Grams"
            onChangeText={(value) => setDraft((current) => current && { ...current, grams: value })}
            value={draft.grams}
          />
          <EditField
            accessibilityLabel="Entry calories"
            keyboardType="decimal-pad"
            label="Calories"
            onChangeText={(value) => setDraft((current) => current && { ...current, calories: value })}
            value={draft.calories}
          />
        </View>

        <View style={styles.threeCol}>
          <EditField
            accessibilityLabel="Entry protein"
            keyboardType="decimal-pad"
            label="Protein"
            onChangeText={(value) => setDraft((current) => current && { ...current, proteinG: value })}
            value={draft.proteinG}
          />
          <EditField
            accessibilityLabel="Entry carbs"
            keyboardType="decimal-pad"
            label="Carbs"
            onChangeText={(value) => setDraft((current) => current && { ...current, carbsG: value })}
            value={draft.carbsG}
          />
          <EditField
            accessibilityLabel="Entry fat"
            keyboardType="decimal-pad"
            label="Fat"
            onChangeText={(value) => setDraft((current) => current && { ...current, fatG: value })}
            value={draft.fatG}
          />
        </View>

        <View style={styles.threeCol}>
          <EditField
            accessibilityLabel="Entry sugar"
            keyboardType="decimal-pad"
            label="Sugar"
            onChangeText={(value) => setDraft((current) => current && { ...current, sugarG: value })}
            value={draft.sugarG}
          />
          <EditField
            accessibilityLabel="Entry fiber"
            keyboardType="decimal-pad"
            label="Fiber"
            onChangeText={(value) => setDraft((current) => current && { ...current, fiberG: value })}
            value={draft.fiberG}
          />
          <EditField
            accessibilityLabel="Entry sodium"
            keyboardType="decimal-pad"
            label="Sodium mg"
            onChangeText={(value) => setDraft((current) => current && { ...current, sodiumMg: value })}
            value={draft.sodiumMg}
          />
        </View>

        <Pressable
          accessibilityLabel="Save entry changes"
          disabled={updateMutation.isPending}
          onPress={() => updateMutation.mutate()}
          style={[styles.saveButton, updateMutation.isPending && styles.buttonDisabled]}
        >
          {updateMutation.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Check color="#FFFFFF" size={18} />}
          <Text style={styles.saveButtonText}>Save changes</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function EditField({
  accessibilityLabel,
  keyboardType = "default",
  label,
  onChangeText,
  value
}: {
  accessibilityLabel: string;
  keyboardType?: "default" | "decimal-pad" | "number-pad";
  label: string;
  onChangeText: (value: string) => void;
  value: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={accessibilityLabel}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        style={styles.input}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    backgroundColor: colors.background,
    padding: 16,
    paddingBottom: 48
  },
  centered: {
    alignItems: "flex-start",
    backgroundColor: colors.background,
    flex: 1,
    gap: 8,
    justifyContent: "center",
    padding: 24
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 14
  },
  headerRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  headerText: {
    flex: 1,
    minWidth: 0
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900"
  },
  meta: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900"
  },
  emptyBody: {
    color: colors.muted,
    fontSize: 14
  },
  field: {
    flex: 1,
    gap: 5
  },
  fieldLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  input: {
    backgroundColor: "#FBFAF7",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    minHeight: 43,
    paddingHorizontal: 11,
    paddingVertical: 9
  },
  twoCol: {
    flexDirection: "row",
    gap: 8
  },
  threeCol: {
    flexDirection: "row",
    gap: 8
  },
  sectionLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  chip: {
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  chipActive: {
    backgroundColor: "#E6F0F3",
    borderColor: colors.accent
  },
  chipText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800"
  },
  chipTextActive: {
    color: colors.accentDark
  },
  saveButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 46
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900"
  },
  buttonDisabled: {
    opacity: 0.6
  }
});
