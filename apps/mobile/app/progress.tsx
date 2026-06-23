import type { AnalyticsSummaryResponse } from "@macro/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Check, Scale } from "lucide-react-native";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../src/api/client";
import { FormTextInput } from "../src/components/KeyboardForm";
import { MacroBar } from "../src/components/MacroBar";
import { TrendLine, WeeklyBars } from "../src/components/NutritionVisuals";
import { TabScreen } from "../src/components/TabScreen";
import { colors } from "../src/theme/colors";
import { todayIso } from "../src/utils/date";

type AnalyticsView = "calories" | "macros" | "ai";

export default function ProgressScreen() {
  const [weightKg, setWeightKg] = useState("");
  const [view, setView] = useState<AnalyticsView>("calories");
  const queryClient = useQueryClient();
  const summaryQuery = useQuery({ queryKey: ["progress"], queryFn: api.getProgressSummary });
  const analyticsQuery = useQuery({ queryKey: ["analytics-summary"], queryFn: api.getAnalyticsSummary });
  const meQuery = useQuery({ queryKey: ["me"], queryFn: api.getMe });
  const weightMutation = useMutation({
    mutationFn: () => api.createWeightEntry({ date: todayIso(), weightKg: Number(weightKg) }),
    onSuccess: async () => {
      setWeightKg("");
      await queryClient.invalidateQueries({ queryKey: ["progress"] });
    }
  });

  const summary = summaryQuery.data;
  const labels = useMemo(
    () =>
      (summary?.dailyCalories ?? []).map((day) =>
        new Date(`${day.date}T12:00:00`).toLocaleDateString([], { weekday: "short" }).slice(0, 2)
      ),
    [summary?.dailyCalories]
  );
  const calorieValues = (summary?.dailyCalories ?? []).map((day) => day.calories);
  const totalCalories = calorieValues.reduce((sum, value) => sum + value, 0);
  const firstDate = summary?.dailyCalories[0]?.date;
  const lastDate = summary?.dailyCalories.at(-1)?.date;

  return (
    <TabScreen keyboardAware contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Nutrition trends</Text>
          <Text style={styles.pageTitle}>Analytics</Text>
        </View>
        <View style={styles.headerIcon}>
          <Activity color={colors.accentDark} size={22} />
        </View>
      </View>

      {summaryQuery.isLoading || meQuery.isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : summary && meQuery.data ? (
        <>
          <View style={styles.totalRow}>
            <Text style={styles.totalValue}>{Math.round(totalCalories).toLocaleString()}</Text>
            <Text style={styles.totalUnit}>cal</Text>
            <Text style={styles.range}>{firstDate && lastDate ? `${firstDate.slice(5)} – ${lastDate.slice(5)}` : "Last 7 days"}</Text>
          </View>

          <View style={styles.segmented}>
            <SegmentButton active={view === "calories"} label="Calories" onPress={() => setView("calories")} />
            <SegmentButton active={view === "macros"} label="Macros" onPress={() => setView("macros")} />
            <SegmentButton active={view === "ai"} label="AI quality" onPress={() => setView("ai")} />
          </View>

          <View style={styles.chartCard}>
            {view === "calories" ? (
              <>
                <Text style={styles.cardTitle}>Daily calories</Text>
                <WeeklyBars labels={labels} values={calorieValues} />
              </>
            ) : view === "macros" ? (
              <>
                <Text style={styles.cardTitle}>Daily average</Text>
                <View style={styles.macroStack}>
                  <MacroBar
                    color={colors.protein}
                    label="Protein"
                    target={meQuery.data.goal.proteinG}
                    value={summary.protein7DayAverage}
                  />
                  <MacroBar
                    color={colors.carbs}
                    label="Calories"
                    target={meQuery.data.goal.calories}
                    unit=""
                    value={summary.calories7DayAverage}
                  />
                </View>
              </>
            ) : (
              <>
                <Text style={styles.cardTitle}>Logging intelligence</Text>
                {analyticsQuery.data ? <LoggingQuality analytics={analyticsQuery.data} /> : <ActivityIndicator color={colors.accent} />}
              </>
            )}
          </View>

          <View style={styles.streakCard}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Tracking streak</Text>
              <Text style={styles.cardMeta}>{summary.loggedDaysLast7}/7 days</Text>
            </View>
            <View style={styles.streakRow}>
              {summary.dailyCalories.map((day, index) => {
                const complete = day.calories > 0;
                return (
                  <View key={day.date} style={styles.streakDay}>
                    <Text style={styles.streakLabel}>{labels[index]}</Text>
                    <View style={[styles.streakCircle, complete && styles.streakCircleComplete]}>
                      {complete ? <Check color="#FFFFFF" size={14} strokeWidth={3} /> : null}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

          <View style={styles.trendCard}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardTitle}>Calorie trend</Text>
                <Text style={styles.trendValue}>{Math.round(summary.calories7DayAverage)} avg</Text>
              </View>
              <Text style={styles.cardMeta}>7 days</Text>
            </View>
            <TrendLine values={calorieValues} />
          </View>

          <View style={styles.weightCard}>
            <View style={styles.cardHeader}>
              <View style={styles.weightTitleRow}>
                <Scale color={colors.accentDark} size={19} />
                <Text style={styles.cardTitle}>Weight</Text>
              </View>
              <Text style={styles.cardMeta}>{summary.latestWeightKg ? `${summary.latestWeightKg} kg` : "No entries"}</Text>
            </View>
            <View style={styles.inputRow}>
              <FormTextInput
                keyboardType="decimal-pad"
                onChangeText={setWeightKg}
                placeholder="Weight in kg"
                style={styles.input}
                value={weightKg}
              />
              <Pressable
                disabled={!Number(weightKg) || weightMutation.isPending}
                onPress={() => weightMutation.mutate()}
                style={[styles.addButton, (!Number(weightKg) || weightMutation.isPending) && styles.buttonDisabled]}
              >
                <Text style={styles.addButtonText}>Add</Text>
              </Pressable>
            </View>
            {summary.weightEntries.slice(-3).reverse().map((entry) => (
              <View key={entry.id} style={styles.weightRow}>
                <Text style={styles.weightDate}>{entry.date}</Text>
                <Text style={styles.weightValue}>{entry.weightKg} kg</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </TabScreen>
  );
}

function SegmentButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.segmentButton, active && styles.segmentButtonActive]}>
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
    </Pressable>
  );
}

function LoggingQuality({ analytics }: { analytics: AnalyticsSummaryResponse }) {
  const metrics = [
    { label: "AI accepted", value: formatRate(analytics.aiEstimateAcceptanceRate) },
    { label: "Corrections", value: analytics.aiCorrectionsApplied.toString() },
    { label: "Barcode fails", value: formatRate(analytics.barcodeFailureRate) },
    { label: "AI cost / log", value: formatNullableNumber(analytics.aiCostUnitsPerLoggedAiMeal) }
  ];
  return (
    <View style={styles.qualityGrid}>
      {metrics.map((metric) => (
        <View key={metric.label} style={styles.qualityMetric}>
          <Text style={styles.qualityValue}>{metric.value}</Text>
          <Text style={styles.qualityLabel}>{metric.label}</Text>
        </View>
      ))}
    </View>
  );
}

function formatRate(value: number | null): string {
  return value === null ? "N/A" : `${Math.round(value * 100)}%`;
}

function formatNullableNumber(value: number | null): string {
  return value === null ? "N/A" : String(value);
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
    padding: 18,
    paddingTop: 14
  },
  header: {
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
  headerIcon: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    height: 46,
    justifyContent: "center",
    width: 46
  },
  loading: {
    alignItems: "center",
    justifyContent: "center",
    padding: 64
  },
  totalRow: {
    alignItems: "baseline",
    flexDirection: "row"
  },
  totalValue: {
    color: colors.text,
    fontSize: 37,
    fontWeight: "900"
  },
  totalUnit: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
    marginLeft: 4
  },
  range: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    marginLeft: "auto"
  },
  segmented: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    padding: 5
  },
  segmentButton: {
    alignItems: "center",
    borderRadius: 7,
    flex: 1,
    minHeight: 40,
    justifyContent: "center"
  },
  segmentButtonActive: {
    backgroundColor: colors.accent
  },
  segmentText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800"
  },
  segmentTextActive: {
    color: "#FFFFFF"
  },
  chartCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    minHeight: 230,
    padding: 16
  },
  cardHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  cardTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900"
  },
  cardMeta: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700"
  },
  macroStack: {
    gap: 18,
    paddingVertical: 14
  },
  streakCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 16,
    padding: 16
  },
  streakRow: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  streakDay: {
    alignItems: "center",
    gap: 7
  },
  streakLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "700"
  },
  streakCircle: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 17,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  streakCircleComplete: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  trendCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 16
  },
  trendValue: {
    color: colors.accent,
    fontSize: 27,
    fontWeight: "900",
    marginTop: 5
  },
  weightCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 16
  },
  weightTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  inputRow: {
    flexDirection: "row",
    gap: 8
  },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 11
  },
  addButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 8,
    justifyContent: "center",
    minWidth: 68,
    paddingHorizontal: 14
  },
  addButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900"
  },
  buttonDisabled: {
    opacity: 0.5
  },
  weightRow: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 10
  },
  weightDate: {
    color: colors.muted,
    fontSize: 12
  },
  weightValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900"
  },
  qualityGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  qualityMetric: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    flexBasis: "47%",
    flexGrow: 1,
    gap: 4,
    minWidth: 120,
    padding: 12
  },
  qualityValue: {
    color: colors.accentDark,
    fontSize: 22,
    fontWeight: "900"
  },
  qualityLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700"
  }
});
