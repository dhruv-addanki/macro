import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { BookMarked, ChevronLeft, ChevronRight, Copy, Sparkles } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../src/api/client";
import { MacroBar } from "../src/components/MacroBar";
import { MealSection } from "../src/components/MealSection";
import { ProgressRing } from "../src/components/NutritionVisuals";
import { TabScreen } from "../src/components/TabScreen";
import { colors } from "../src/theme/colors";
import { formatDateLabel, shiftDate, todayIso } from "../src/utils/date";

export default function DiaryScreen() {
  const [date, setDate] = useState(todayIso());
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const meQuery = useQuery({ queryKey: ["me"], queryFn: api.getMe });
  const diaryQuery = useQuery({
    queryKey: ["diary", date],
    queryFn: () => api.getDiary(date)
  });

  useEffect(() => {
    if (meQuery.data && !meQuery.data.profile.onboardingCompleted) {
      router.replace("/onboarding");
    }
  }, [meQuery.data]);

  const deleteMutation = useMutation({
    mutationFn: (entryId: string) => api.deleteEntry(entryId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["diary", date] })
  });

  const duplicateMutation = useMutation({
    mutationFn: (entryId: string) => api.duplicateEntry(entryId, date),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["diary", date] })
  });

  const copyDayMutation = useMutation({
    mutationFn: () => api.copyDiaryDay({ fromDate: shiftDate(date, -1), toDate: date }),
    onSuccess: async (response) => {
      setSaveMessage(response.entries.length > 0 ? `Copied ${response.entries.length} item(s)` : "Previous day is empty");
      await queryClient.invalidateQueries({ queryKey: ["diary", date] });
    }
  });

  const saveMealMutation = useMutation({
    mutationFn: (input: { name: string; entryIds: string[] }) => api.saveMeal(input),
    onSuccess: async (savedMeal) => {
      setSaveMessage(`Saved ${savedMeal.name}`);
      await queryClient.invalidateQueries({ queryKey: ["saved-meals"] });
    }
  });

  const diary = diaryQuery.data;
  const calorieProgress = diary && diary.goal.calories > 0 ? diary.totals.calories / diary.goal.calories : 0;
  const progressPercent = Math.round(Math.min(1, calorieProgress) * 100);

  return (
    <TabScreen contentContainerStyle={styles.content}>
      <View style={styles.topRow}>
        <View>
          <Text style={styles.eyebrow}>{formatDateLabel(date)}</Text>
          <Text style={styles.pageTitle}>Today</Text>
        </View>
        <Pressable accessibilityLabel="Open saved meals" onPress={() => router.push("/saved")} style={styles.headerButton}>
          <BookMarked color={colors.accentDark} size={21} />
        </Pressable>
      </View>

      <View style={styles.dateControl}>
        <Pressable accessibilityLabel="Previous day" onPress={() => setDate((value) => shiftDate(value, -1))} style={styles.dateButton}>
          <ChevronLeft color={colors.accentDark} size={19} />
        </Pressable>
        <Text style={styles.dateText}>{date}</Text>
        <Pressable accessibilityLabel="Next day" onPress={() => setDate((value) => shiftDate(value, 1))} style={styles.dateButton}>
          <ChevronRight color={colors.accentDark} size={19} />
        </Pressable>
      </View>

      {diaryQuery.isLoading || meQuery.isLoading || (meQuery.data && !meQuery.data.profile.onboardingCompleted) ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : diaryQuery.error ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Could not load your diary</Text>
          <Pressable onPress={() => diaryQuery.refetch()} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Try again</Text>
          </Pressable>
        </View>
      ) : diary ? (
        <>
          <View style={styles.progressCard}>
            <View style={styles.progressCopy}>
              <View style={styles.progressLabelRow}>
                <Sparkles color="#FFFFFF" size={18} />
                <Text style={styles.progressLabel}>Daily progress</Text>
              </View>
              <Text style={styles.progressPercent}>{progressPercent}%</Text>
              <Text style={styles.progressMeta}>
                {Math.max(0, Math.round(diary.remaining.calories))} calories left
              </Text>
            </View>
            <ProgressRing
              label="calories"
              progress={calorieProgress}
              value={Math.round(diary.totals.calories).toString()}
            />
          </View>

          <View style={styles.macroCard}>
            <MacroBar compact color={colors.protein} label="Protein" target={diary.goal.proteinG} value={diary.totals.proteinG} />
            <MacroBar compact color={colors.carbs} label="Carbs" target={diary.goal.carbsG} value={diary.totals.carbsG} />
            <MacroBar compact color={colors.fat} label="Fat" target={diary.goal.fatG} value={diary.totals.fatG} />
          </View>

          <View style={styles.actionRow}>
            <Pressable
              accessibilityLabel="Copy previous day"
              disabled={copyDayMutation.isPending}
              onPress={() => copyDayMutation.mutate()}
              style={[styles.secondaryAction, copyDayMutation.isPending && styles.buttonDisabled]}
            >
              {copyDayMutation.isPending ? <ActivityIndicator color={colors.accentDark} /> : <Copy color={colors.accentDark} size={17} />}
              <Text style={styles.secondaryActionText}>Copy yesterday</Text>
            </Pressable>
            <Pressable accessibilityLabel="Open saved meals" onPress={() => router.push("/saved")} style={styles.secondaryAction}>
              <BookMarked color={colors.accentDark} size={17} />
              <Text style={styles.secondaryActionText}>Saved meals</Text>
            </Pressable>
          </View>

          {saveMessage ? (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>{saveMessage}</Text>
            </View>
          ) : null}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Meals</Text>
            <Text style={styles.sectionMeta}>{diary.meals.reduce((sum, meal) => sum + meal.entries.length, 0)} items</Text>
          </View>

          <View style={styles.mealList}>
            {diary.meals.map((meal) => (
              <MealSection
                key={meal.mealGroup.id}
                date={date}
                meal={meal}
                onDeleteEntry={(id) => deleteMutation.mutate(id)}
                onDuplicateEntry={(id) => duplicateMutation.mutate(id)}
                onSaveMeal={(value) =>
                  saveMealMutation.mutate({
                    name: `${value.mealGroup.name} ${date}`,
                    entryIds: value.entries.map((entry) => entry.id)
                  })
                }
              />
            ))}
          </View>
        </>
      ) : null}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
    padding: 18,
    paddingTop: 14
  },
  topRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  eyebrow: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700"
  },
  pageTitle: {
    color: colors.text,
    fontSize: 31,
    fontWeight: "900",
    marginTop: 1
  },
  headerButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    height: 46,
    justifyContent: "center",
    width: 46
  },
  dateControl: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 5
  },
  dateButton: {
    alignItems: "center",
    backgroundColor: colors.accentPale,
    borderRadius: 7,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  dateText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800"
  },
  progressCard: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 184,
    overflow: "hidden",
    padding: 20
  },
  progressCopy: {
    flex: 1,
    gap: 8
  },
  progressLabelRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7
  },
  progressLabel: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800"
  },
  progressPercent: {
    color: "#FFFFFF",
    fontSize: 48,
    fontWeight: "900",
    lineHeight: 54
  },
  progressMeta: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 12,
    fontWeight: "700"
  },
  macroCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 14,
    padding: 14
  },
  actionRow: {
    flexDirection: "row",
    gap: 10
  },
  secondaryAction: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: 8,
    flex: 1,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 10
  },
  secondaryActionText: {
    color: colors.accentDark,
    fontSize: 12,
    fontWeight: "900"
  },
  notice: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: 12
  },
  noticeText: {
    color: colors.success,
    fontSize: 13,
    fontWeight: "800"
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 2
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900"
  },
  sectionMeta: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700"
  },
  mealList: {
    gap: 12
  },
  loading: {
    alignItems: "center",
    justifyContent: "center",
    padding: 64
  },
  emptyState: {
    alignItems: "flex-start",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 18
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900"
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 11
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900"
  },
  buttonDisabled: {
    opacity: 0.55
  }
});
