import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Scale } from "lucide-react-native";
import type { AnalyticsSummaryResponse } from "@macro/shared";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../src/api/client";
import { AppNav } from "../src/components/AppNav";
import { FormTextInput, KeyboardAwareScrollView } from "../src/components/KeyboardForm";
import { colors } from "../src/theme/colors";
import { todayIso } from "../src/utils/date";

export default function ProgressScreen() {
  const [weightKg, setWeightKg] = useState("");
  const queryClient = useQueryClient();
  const summaryQuery = useQuery({ queryKey: ["progress"], queryFn: api.getProgressSummary });
  const analyticsQuery = useQuery({ queryKey: ["analytics-summary"], queryFn: api.getAnalyticsSummary });
  const weightMutation = useMutation({
    mutationFn: () => api.createWeightEntry({ date: todayIso(), weightKg: Number(weightKg) }),
    onSuccess: async () => {
      setWeightKg("");
      await queryClient.invalidateQueries({ queryKey: ["progress"] });
    }
  });

  const summary = summaryQuery.data;

  return (
    <KeyboardAwareScrollView contentContainerStyle={styles.content}>
      <AppNav />
      {summaryQuery.isLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : summary ? (
        <>
          <View style={styles.grid}>
            <Stat label="7-day calories" value={Math.round(summary.calories7DayAverage).toString()} />
            <Stat label="7-day protein" value={`${Math.round(summary.protein7DayAverage)}g`} />
            <Stat label="Logged days" value={`${summary.loggedDaysLast7}/7`} />
            <Stat label="Latest weight" value={summary.latestWeightKg ? `${summary.latestWeightKg}kg` : "None"} />
          </View>

          {analyticsQuery.data ? <LoggingQuality analytics={analyticsQuery.data} /> : null}

          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Scale color={colors.accentDark} size={19} />
              <Text style={styles.panelTitle}>Weight</Text>
            </View>
            <View style={styles.inputRow}>
              <FormTextInput
                keyboardType="decimal-pad"
                onChangeText={setWeightKg}
                placeholder="kg"
                style={styles.input}
                value={weightKg}
              />
              <Pressable
                disabled={!Number(weightKg) || weightMutation.isPending}
                onPress={() => weightMutation.mutate()}
                style={[styles.button, (!Number(weightKg) || weightMutation.isPending) && styles.buttonDisabled]}
              >
                <Text style={styles.buttonText}>Add</Text>
              </Pressable>
            </View>
            {summary.weightEntries.length === 0 ? (
              <Text style={styles.meta}>No weight entries yet.</Text>
            ) : (
              summary.weightEntries.slice(-5).map((entry) => (
                <View key={entry.id} style={styles.weightRow}>
                  <Text style={styles.weightDate}>{entry.date}</Text>
                  <Text style={styles.weightValue}>{entry.weightKg}kg</Text>
                </View>
              ))
            )}
          </View>

          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Last 7 days</Text>
            {summary.dailyCalories.map((day) => (
              <View key={day.date} style={styles.dayRow}>
                <Text style={styles.weightDate}>{day.date}</Text>
                <Text style={styles.weightValue}>
                  {Math.round(day.calories)} cal · P {Math.round(day.proteinG)}g
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </KeyboardAwareScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function LoggingQuality({ analytics }: { analytics: AnalyticsSummaryResponse }) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>Logging quality</Text>
      <View style={styles.qualityGrid}>
        <QualityMetric label="AI accepted" value={formatRate(analytics.aiEstimateAcceptanceRate)} />
        <QualityMetric label="Corrections" value={analytics.aiCorrectionsApplied.toString()} />
        <QualityMetric label="Barcode fails" value={formatRate(analytics.barcodeFailureRate)} />
        <QualityMetric label="AI cost / log" value={formatNullableNumber(analytics.aiCostUnitsPerLoggedAiMeal)} />
      </View>
      <View style={styles.sourceList}>
        <SourceRow label="Manual" value={analytics.loggedEntriesBySource.manual} />
        <SourceRow label="Barcode" value={analytics.loggedEntriesBySource.barcode} />
        <SourceRow label="AI photo" value={analytics.loggedEntriesBySource.ai_photo} />
        <SourceRow label="AI text" value={analytics.loggedEntriesBySource.ai_text} />
        <SourceRow label="Saved" value={analytics.loggedEntriesBySource.saved_meal} />
        <SourceRow label="Recipe" value={analytics.loggedEntriesBySource.recipe} />
      </View>
    </View>
  );
}

function QualityMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.qualityMetric}>
      <Text style={styles.qualityValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SourceRow({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.sourceRow}>
      <Text style={styles.weightDate}>{label}</Text>
      <Text style={styles.weightValue}>{value}</Text>
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
    backgroundColor: colors.background,
    gap: 16,
    padding: 16,
    paddingBottom: 48
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  stat: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: "48%",
    flexGrow: 1,
    padding: 14
  },
  statValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900"
  },
  statLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 14
  },
  panelHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  panelTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900"
  },
  inputRow: {
    flexDirection: "row",
    gap: 8
  },
  input: {
    backgroundColor: "#FBFAF7",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 11
  },
  button: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 8,
    justifyContent: "center",
    paddingHorizontal: 18
  },
  buttonDisabled: {
    opacity: 0.5
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900"
  },
  meta: {
    color: colors.muted,
    fontSize: 13
  },
  weightRow: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 9
  },
  dayRow: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  sourceList: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: 8,
    paddingTop: 10
  },
  qualityGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  },
  qualityMetric: {
    flexBasis: "47%",
    flexGrow: 1,
    minWidth: 120
  },
  qualityValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900"
  },
  sourceRow: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  weightDate: {
    color: colors.muted,
    fontSize: 13
  },
  weightValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800"
  }
});
