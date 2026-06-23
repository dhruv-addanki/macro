import type { CompleteOnboardingRequest } from "@macro/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Check } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../src/api/client";
import { FormTextInput, KeyboardAwareScrollView } from "../src/components/KeyboardForm";
import { colors } from "../src/theme/colors";

type GoalType = CompleteOnboardingRequest["goalType"];
type ActivityLevel = CompleteOnboardingRequest["activityLevel"];
type UnitSystem = CompleteOnboardingRequest["unitSystem"];
type CalorieMode = CompleteOnboardingRequest["calorieTargetMode"];
type MacroPreference = CompleteOnboardingRequest["macroPreference"];
type Sex = NonNullable<CompleteOnboardingRequest["sex"]>;

const goalOptions: Array<{ label: string; value: GoalType }> = [
  { label: "Cut", value: "cut" },
  { label: "Maintain", value: "maintain" },
  { label: "Bulk", value: "bulk" },
  { label: "Health", value: "general_health" }
];

const activityOptions: Array<{ label: string; value: ActivityLevel }> = [
  { label: "Low", value: "low" },
  { label: "Moderate", value: "moderate" },
  { label: "High", value: "high" }
];

const sexOptions: Array<{ label: string; value: Sex }> = [
  { label: "Male", value: "male" },
  { label: "Female", value: "female" },
  { label: "Other", value: "other" },
  { label: "Skip", value: "prefer_not_to_say" }
];

const macroOptions: Array<{ label: string; value: MacroPreference }> = [
  { label: "High protein", value: "high_protein" },
  { label: "Balanced", value: "balanced" },
  { label: "Custom", value: "custom" }
];

function toKg(value: string, unitSystem: UnitSystem) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return unitSystem === "imperial" ? Math.round((parsed / 2.20462) * 10) / 10 : parsed;
}

function toCm(value: string, unitSystem: UnitSystem) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return unitSystem === "imperial" ? Math.round(parsed * 2.54) : parsed;
}

function fromKg(value: number | undefined, unitSystem: UnitSystem) {
  if (!value) return "";
  return unitSystem === "imperial" ? String(Math.round(value * 2.20462)) : String(Math.round(value));
}

function fromCm(value: number | undefined, unitSystem: UnitSystem) {
  if (!value) return "";
  return unitSystem === "imperial" ? String(Math.round(value / 2.54)) : String(Math.round(value));
}

function optionalPositive(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export default function OnboardingScreen() {
  const queryClient = useQueryClient();
  const meQuery = useQuery({ queryKey: ["me"], queryFn: api.getMe });
  const [displayName, setDisplayName] = useState("");
  const [unitSystem, setUnitSystem] = useState<UnitSystem>("imperial");
  const [goalType, setGoalType] = useState<GoalType>("cut");
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>("moderate");
  const [sex, setSex] = useState<Sex>("prefer_not_to_say");
  const [birthYear, setBirthYear] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [targetWeight, setTargetWeight] = useState("");
  const [calorieTargetMode, setCalorieTargetMode] = useState<CalorieMode>("calculate");
  const [macroPreference, setMacroPreference] = useState<MacroPreference>("high_protein");
  const [calories, setCalories] = useState("2400");
  const [proteinG, setProteinG] = useState("180");
  const [carbsG, setCarbsG] = useState("250");
  const [fatG, setFatG] = useState("70");

  useEffect(() => {
    const profile = meQuery.data?.profile;
    const goal = meQuery.data?.goal;
    if (!profile || !goal) return;
    const nextUnitSystem = profile.unitSystem;
    setDisplayName(profile.displayName);
    setUnitSystem(nextUnitSystem);
    setGoalType(profile.goalType);
    setActivityLevel(profile.activityLevel);
    setSex(profile.sex ?? "prefer_not_to_say");
    setBirthYear(profile.birthYear ? String(profile.birthYear) : "");
    setHeight(fromCm(profile.heightCm, nextUnitSystem));
    setWeight(fromKg(profile.weightKg, nextUnitSystem));
    setTargetWeight(fromKg(profile.targetWeightKg, nextUnitSystem));
    setCalories(String(Math.round(goal.calories)));
    setProteinG(String(Math.round(goal.proteinG)));
    setCarbsG(String(Math.round(goal.carbsG)));
    setFatG(String(Math.round(goal.fatG)));
  }, [meQuery.data]);

  const weightLabel = unitSystem === "imperial" ? "Current weight (lb)" : "Current weight (kg)";
  const targetWeightLabel = unitSystem === "imperial" ? "Target weight (lb)" : "Target weight (kg)";
  const heightLabel = unitSystem === "imperial" ? "Height (in)" : "Height (cm)";

  const canSubmit = useMemo(() => {
    if (!displayName.trim()) return false;
    if (calorieTargetMode === "manual" && !optionalPositive(calories)) return false;
    if (macroPreference === "custom") {
      return Boolean(optionalPositive(proteinG) && optionalPositive(carbsG) && optionalPositive(fatG));
    }
    return true;
  }, [calorieTargetMode, calories, carbsG, displayName, fatG, macroPreference, proteinG]);

  const onboardingMutation = useMutation({
    mutationFn: () =>
      api.completeOnboarding({
        displayName: displayName.trim(),
        birthYear: optionalPositive(birthYear),
        sex,
        heightCm: toCm(height, unitSystem),
        weightKg: toKg(weight, unitSystem),
        targetWeightKg: toKg(targetWeight, unitSystem),
        goalType,
        activityLevel,
        unitSystem,
        calorieTargetMode,
        macroPreference,
        calories: calorieTargetMode === "manual" ? optionalPositive(calories) : undefined,
        proteinG: macroPreference === "custom" ? optionalPositive(proteinG) : undefined,
        carbsG: macroPreference === "custom" ? optionalPositive(carbsG) : undefined,
        fatG: macroPreference === "custom" ? optionalPositive(fatG) : undefined
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      await queryClient.invalidateQueries({ queryKey: ["diary"] });
      await queryClient.invalidateQueries({ queryKey: ["progress"] });
      router.replace("/");
    }
  });

  if (meQuery.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <KeyboardAwareScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Set up Macro</Text>
        <Text style={styles.meta}>Profile, goals, and targets</Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Profile</Text>
        <LabeledInput label="Display name" onChangeText={setDisplayName} value={displayName} />
        <View style={styles.twoCol}>
          <LabeledInput keyboardType="number-pad" label="Birth year" onChangeText={setBirthYear} value={birthYear} />
          <LabeledInput keyboardType="decimal-pad" label={heightLabel} onChangeText={setHeight} value={height} />
        </View>
        <SegmentedControl label="Sex" options={sexOptions} value={sex} onChange={setSex} />
        <SegmentedControl
          label="Units"
          options={[
            { label: "Imperial", value: "imperial" },
            { label: "Metric", value: "metric" }
          ]}
          value={unitSystem}
          onChange={setUnitSystem}
        />
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Goal</Text>
        <SegmentedControl label="Goal type" options={goalOptions} value={goalType} onChange={setGoalType} />
        <SegmentedControl label="Activity" options={activityOptions} value={activityLevel} onChange={setActivityLevel} />
        <View style={styles.twoCol}>
          <LabeledInput keyboardType="decimal-pad" label={weightLabel} onChangeText={setWeight} value={weight} />
          <LabeledInput keyboardType="decimal-pad" label={targetWeightLabel} onChangeText={setTargetWeight} value={targetWeight} />
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Daily targets</Text>
        <SegmentedControl
          label="Calories"
          options={[
            { label: "Calculate", value: "calculate" },
            { label: "Manual", value: "manual" }
          ]}
          value={calorieTargetMode}
          onChange={setCalorieTargetMode}
        />
        {calorieTargetMode === "manual" ? (
          <LabeledInput keyboardType="number-pad" label="Calories" onChangeText={setCalories} value={calories} />
        ) : null}
        <SegmentedControl label="Macros" options={macroOptions} value={macroPreference} onChange={setMacroPreference} />
        {macroPreference === "custom" ? (
          <View style={styles.threeCol}>
            <LabeledInput keyboardType="number-pad" label="Protein" onChangeText={setProteinG} value={proteinG} />
            <LabeledInput keyboardType="number-pad" label="Carbs" onChangeText={setCarbsG} value={carbsG} />
            <LabeledInput keyboardType="number-pad" label="Fat" onChangeText={setFatG} value={fatG} />
          </View>
        ) : null}
      </View>

      <Pressable
        accessibilityLabel="Complete onboarding"
        disabled={!canSubmit || onboardingMutation.isPending}
        onPress={() => onboardingMutation.mutate()}
        style={[styles.submitButton, (!canSubmit || onboardingMutation.isPending) && styles.buttonDisabled]}
      >
        {onboardingMutation.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Check color="#FFFFFF" size={18} />}
        <Text style={styles.submitText}>Complete setup</Text>
      </Pressable>
    </KeyboardAwareScrollView>
  );
}

function LabeledInput({
  keyboardType = "default",
  label,
  onChangeText,
  value
}: {
  keyboardType?: "default" | "decimal-pad" | "number-pad";
  label: string;
  onChangeText: (value: string) => void;
  value: string;
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <FormTextInput
        accessibilityLabel={label}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        style={styles.input}
        value={value}
      />
    </View>
  );
}

function SegmentedControl<T extends string>({
  label,
  onChange,
  options,
  value
}: {
  label: string;
  onChange: (value: T) => void;
  options: Array<{ label: string; value: T }>;
  value: T;
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.segmentRow}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityLabel={`${label}: ${option.label}`}
              onPress={() => onChange(option.value)}
              style={[styles.segment, active && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    backgroundColor: colors.background,
    gap: 14,
    padding: 16,
    paddingBottom: 48
  },
  centered: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: "center"
  },
  header: {
    gap: 3
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900"
  },
  meta: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "700"
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 14
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900"
  },
  inputGroup: {
    flex: 1,
    gap: 6
  },
  label: {
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
  segmentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  segment: {
    backgroundColor: "#FBFAF7",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexGrow: 1,
    minHeight: 40,
    minWidth: 90,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 9
  },
  segmentActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  segmentText: {
    color: colors.accentDark,
    fontSize: 13,
    fontWeight: "900"
  },
  segmentTextActive: {
    color: "#FFFFFF"
  },
  submitButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 50,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  submitText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900"
  },
  buttonDisabled: {
    opacity: 0.55
  }
});
