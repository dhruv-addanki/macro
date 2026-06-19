import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, router } from "expo-router";
import { ChevronLeft, ChevronRight, Copy, Plus } from "lucide-react-native";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../src/api/client";
import { AppNav } from "../src/components/AppNav";
import { MacroSummary } from "../src/components/MacroBar";
import { MealSection } from "../src/components/MealSection";
import { colors } from "../src/theme/colors";
import { formatDateLabel, shiftDate, todayIso } from "../src/utils/date";
import { useEffect, useState } from "react";

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
      setSaveMessage(response.entries.length > 0 ? `Copied ${response.entries.length} item(s) from previous day` : "Previous day has no foods to copy");
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

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <AppNav />
        <View style={styles.dateRow}>
          <Pressable accessibilityLabel="Previous day" onPress={() => setDate((value) => shiftDate(value, -1))} style={styles.iconButton}>
            <ChevronLeft color={colors.text} size={20} />
          </Pressable>
          <View style={styles.dateTextGroup}>
            <Text style={styles.dateLabel}>{formatDateLabel(date)}</Text>
            <Text style={styles.dateSub}>{date}</Text>
          </View>
          <Pressable accessibilityLabel="Next day" onPress={() => setDate((value) => shiftDate(value, 1))} style={styles.iconButton}>
            <ChevronRight color={colors.text} size={20} />
          </Pressable>
        </View>

        <View style={styles.dayActions}>
          <Pressable
            accessibilityLabel="Copy previous day"
            disabled={copyDayMutation.isPending}
            onPress={() => copyDayMutation.mutate()}
            style={[styles.dayActionButton, copyDayMutation.isPending && styles.buttonDisabled]}
          >
            {copyDayMutation.isPending ? <ActivityIndicator color={colors.accentDark} /> : <Copy color={colors.accentDark} size={17} />}
            <Text style={styles.dayActionText}>Copy previous day</Text>
          </Pressable>
        </View>

        {diaryQuery.isLoading || meQuery.isLoading || (meQuery.data && !meQuery.data.profile.onboardingCompleted) ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : diaryQuery.error ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>API unavailable</Text>
            <Text style={styles.emptyBody}>Start the API server, then refresh this screen.</Text>
            <Pressable onPress={() => diaryQuery.refetch()} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Refresh</Text>
            </Pressable>
          </View>
        ) : diary ? (
          <>
            <View style={styles.summaryCard}>
              <View style={styles.calorieHeader}>
                <View>
                  <Text style={styles.summaryLabel}>Calories</Text>
                  <Text style={styles.calories}>
                    {Math.round(diary.totals.calories)}
                    <Text style={styles.calorieTarget}> / {Math.round(diary.goal.calories)}</Text>
                  </Text>
                </View>
                <View style={styles.remainingBox}>
                  <Text style={styles.remainingValue}>{Math.round(diary.remaining.calories)}</Text>
                  <Text style={styles.remainingLabel}>left</Text>
                </View>
              </View>
              <MacroSummary totals={diary.totals} goal={diary.goal} />
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
            {saveMessage ? (
              <View style={styles.notice}>
                <Text style={styles.noticeText}>{saveMessage}</Text>
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <Link asChild href={{ pathname: "/add", params: { date } }}>
        <Pressable accessibilityLabel="Add food" style={styles.floatingAdd}>
          <Plus color="#FFFFFF" size={26} />
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flex: 1
  },
  content: {
    gap: 20,
    padding: 16,
    paddingBottom: 110
  },
  dateRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  dateTextGroup: {
    alignItems: "center"
  },
  dateLabel: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900"
  },
  dateSub: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 18,
    padding: 16
  },
  calorieHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  summaryLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  calories: {
    color: colors.text,
    fontSize: 44,
    fontWeight: "900",
    lineHeight: 52
  },
  calorieTarget: {
    color: colors.muted,
    fontSize: 20,
    fontWeight: "700"
  },
  remainingBox: {
    alignItems: "flex-end",
    backgroundColor: "#E7F1EA",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  remainingValue: {
    color: colors.success,
    fontSize: 20,
    fontWeight: "900"
  },
  remainingLabel: {
    color: colors.success,
    fontSize: 12,
    fontWeight: "700"
  },
  mealList: {
    gap: 22
  },
  dayActions: {
    flexDirection: "row",
    gap: 8
  },
  dayActionButton: {
    alignItems: "center",
    backgroundColor: "#E6F0F3",
    borderRadius: 8,
    flexDirection: "row",
    gap: 7,
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  dayActionText: {
    color: colors.accentDark,
    fontSize: 13,
    fontWeight: "900"
  },
  notice: {
    backgroundColor: "#E7F1EA",
    borderColor: "#C9E3D1",
    borderRadius: 8,
    borderWidth: 1,
    padding: 12
  },
  noticeText: {
    color: colors.success,
    fontSize: 13,
    fontWeight: "800"
  },
  floatingAdd: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 30,
    bottom: 28,
    height: 60,
    justifyContent: "center",
    position: "absolute",
    right: 22,
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    width: 60
  },
  loading: {
    alignItems: "center",
    justifyContent: "center",
    padding: 48
  },
  emptyState: {
    alignItems: "flex-start",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 16
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900"
  },
  emptyBody: {
    color: colors.muted,
    fontSize: 14
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 11
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800"
  },
  buttonDisabled: {
    opacity: 0.55
  }
});
