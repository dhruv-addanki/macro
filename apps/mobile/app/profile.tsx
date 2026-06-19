import type { AIUsageSummaryResponse, MealGroup, MealPhoto } from "@macro/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { API_URL, api, getSessionToken, setSessionToken } from "../src/api/client";
import { AppNav } from "../src/components/AppNav";
import { colors } from "../src/theme/colors";

type GoalDraft = {
  calories: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
  sugarG: string;
  fiberG: string;
  sodiumMg: string;
};

function hasNumberAtLeast(value: string, minimum: number) {
  const parsed = Number(value);
  return value.trim().length > 0 && Number.isFinite(parsed) && parsed >= minimum;
}

export default function ProfileScreen() {
  const queryClient = useQueryClient();
  const meQuery = useQuery({ queryKey: ["me"], queryFn: api.getMe });
  const authSessionQuery = useQuery({ queryKey: ["auth-session"], queryFn: api.getAuthSession });
  const aiUsageQuery = useQuery({ queryKey: ["ai-usage"], queryFn: api.getAiUsage });
  const mealPhotosQuery = useQuery({ queryKey: ["meal-photos"], queryFn: api.getMealPhotos });
  const [displayName, setDisplayName] = useState("");
  const [goalDraft, setGoalDraft] = useState<GoalDraft>({
    calories: "",
    proteinG: "",
    carbsG: "",
    fatG: "",
    sugarG: "",
    fiberG: "",
    sodiumMg: ""
  });
  const [newMealGroupName, setNewMealGroupName] = useState("");
  const [mealGroupDrafts, setMealGroupDrafts] = useState<Record<string, string>>({});
  const [mealGroupError, setMealGroupError] = useState("");
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [openingPhotoId, setOpeningPhotoId] = useState<string | null>(null);

  useEffect(() => {
    if (!meQuery.data) return;
    setDisplayName(meQuery.data.profile.displayName);
    setGoalDraft({
      calories: String(Math.round(meQuery.data.goal.calories)),
      proteinG: String(Math.round(meQuery.data.goal.proteinG)),
      carbsG: String(Math.round(meQuery.data.goal.carbsG)),
      fatG: String(Math.round(meQuery.data.goal.fatG)),
      sugarG: String(Math.round(meQuery.data.goal.sugarG ?? 0)),
      fiberG: String(Math.round(meQuery.data.goal.fiberG)),
      sodiumMg: String(Math.round(meQuery.data.goal.sodiumMg))
    });
    setMealGroupDrafts(
      Object.fromEntries(meQuery.data.mealGroups.map((mealGroup) => [mealGroup.id, mealGroup.name]))
    );
  }, [meQuery.data]);

  async function refreshMealGroups() {
    await queryClient.invalidateQueries({ queryKey: ["me"] });
    await queryClient.invalidateQueries({ queryKey: ["diary"] });
  }

  const profileMutation = useMutation({
    mutationFn: () => api.updateProfile({ displayName }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    }
  });

  const goalMutation = useMutation({
    mutationFn: () =>
      api.updateGoal({
        calories: Number(goalDraft.calories),
        proteinG: Number(goalDraft.proteinG),
        carbsG: Number(goalDraft.carbsG),
        fatG: Number(goalDraft.fatG),
        sugarG: Number(goalDraft.sugarG),
        fiberG: Number(goalDraft.fiberG),
        sodiumMg: Number(goalDraft.sodiumMg)
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    }
  });

  const createMealGroupMutation = useMutation({
    mutationFn: () => api.createMealGroup({ name: newMealGroupName }),
    onMutate: () => setMealGroupError(""),
    onSuccess: async () => {
      setNewMealGroupName("");
      await refreshMealGroups();
    },
    onError: (error) => setMealGroupError(error instanceof Error ? error.message : "Could not create meal group.")
  });

  const updateMealGroupMutation = useMutation({
    mutationFn: (input: { id: string; name: string }) => api.updateMealGroup(input.id, { name: input.name }),
    onMutate: () => setMealGroupError(""),
    onSuccess: refreshMealGroups,
    onError: (error) => setMealGroupError(error instanceof Error ? error.message : "Could not update meal group.")
  });

  const reorderMealGroupsMutation = useMutation({
    mutationFn: (orderedIds: string[]) => api.reorderMealGroups({ orderedIds }),
    onMutate: () => setMealGroupError(""),
    onSuccess: refreshMealGroups,
    onError: (error) => setMealGroupError(error instanceof Error ? error.message : "Could not reorder meal groups.")
  });

  const deleteMealGroupMutation = useMutation({
    mutationFn: (id: string) => api.deleteMealGroup(id),
    onMutate: () => setMealGroupError(""),
    onSuccess: refreshMealGroups,
    onError: (error) => setMealGroupError(error instanceof Error ? error.message : "Could not delete meal group.")
  });

  const logoutMutation = useMutation({
    mutationFn: () => api.logout(),
    onSettled: async () => {
      await setSessionToken(null);
      queryClient.clear();
      router.replace("/auth");
    }
  });

  async function deleteRetainedPhoto(id: string) {
    setDeletingPhotoId(id);
    try {
      await api.deleteMealPhoto(id);
      await queryClient.invalidateQueries({ queryKey: ["meal-photos"] });
      await mealPhotosQuery.refetch();
    } finally {
      setDeletingPhotoId(null);
    }
  }

  async function openRetainedPhoto(id: string) {
    setOpeningPhotoId(id);
    try {
      const access = await api.getMealPhotoAccess(id);
      await Linking.openURL(access.url);
    } finally {
      setOpeningPhotoId(null);
    }
  }

  function moveMealGroup(id: string, direction: -1 | 1) {
    const mealGroups = meQuery.data?.mealGroups ?? [];
    const index = mealGroups.findIndex((mealGroup) => mealGroup.id === id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= mealGroups.length) return;
    const orderedIds = mealGroups.map((mealGroup) => mealGroup.id);
    const [removed] = orderedIds.splice(index, 1);
    if (!removed) return;
    orderedIds.splice(targetIndex, 0, removed);
    reorderMealGroupsMutation.mutate(orderedIds);
  }

  const mealGroupMutationPending =
    createMealGroupMutation.isPending ||
    updateMealGroupMutation.isPending ||
    reorderMealGroupsMutation.isPending ||
    deleteMealGroupMutation.isPending;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <AppNav />
      {meQuery.isLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : meQuery.data ? (
        <>
          <View style={styles.panel}>
            <Text style={styles.title}>Account</Text>
            <Text style={styles.meta}>
              {authSessionQuery.data?.authenticated && authSessionQuery.data.user
                ? authSessionQuery.data.user.email
                : "Local session"}
            </Text>
            <SecondaryButton
              disabled={logoutMutation.isPending}
              label={logoutMutation.isPending ? "Logging out" : "Logout"}
              onPress={() => logoutMutation.mutate()}
            />
          </View>

          <View style={styles.panel}>
            <Text style={styles.title}>Profile</Text>
            <LabeledInput label="Display name" onChangeText={setDisplayName} value={displayName} />
            <View style={styles.metaGrid}>
              <Text style={styles.meta}>Goal: {meQuery.data.profile.goalType.replace("_", " ")}</Text>
              <Text style={styles.meta}>Activity: {meQuery.data.profile.activityLevel}</Text>
              <Text style={styles.meta}>Units: {meQuery.data.profile.unitSystem}</Text>
            </View>
            <PrimaryButton
              disabled={!displayName.trim() || profileMutation.isPending}
              label="Save profile"
              onPress={() => profileMutation.mutate()}
            />
            <SecondaryButton label="Edit setup" onPress={() => router.push("/onboarding")} />
          </View>

          <View style={styles.panel}>
            <Text style={styles.title}>Daily targets</Text>
            <LabeledInput
              keyboardType="number-pad"
              label="Calories"
              onChangeText={(value) => setGoalDraft((draft) => ({ ...draft, calories: value }))}
              value={goalDraft.calories}
            />
            <LabeledInput
              keyboardType="number-pad"
              label="Protein"
              onChangeText={(value) => setGoalDraft((draft) => ({ ...draft, proteinG: value }))}
              value={goalDraft.proteinG}
            />
            <LabeledInput
              keyboardType="number-pad"
              label="Carbs"
              onChangeText={(value) => setGoalDraft((draft) => ({ ...draft, carbsG: value }))}
              value={goalDraft.carbsG}
            />
            <LabeledInput
              keyboardType="number-pad"
              label="Fat"
              onChangeText={(value) => setGoalDraft((draft) => ({ ...draft, fatG: value }))}
              value={goalDraft.fatG}
            />
            <LabeledInput
              keyboardType="number-pad"
              label="Sugar"
              onChangeText={(value) => setGoalDraft((draft) => ({ ...draft, sugarG: value }))}
              value={goalDraft.sugarG}
            />
            <LabeledInput
              keyboardType="number-pad"
              label="Fiber"
              onChangeText={(value) => setGoalDraft((draft) => ({ ...draft, fiberG: value }))}
              value={goalDraft.fiberG}
            />
            <LabeledInput
              keyboardType="number-pad"
              label="Sodium mg"
              onChangeText={(value) => setGoalDraft((draft) => ({ ...draft, sodiumMg: value }))}
              value={goalDraft.sodiumMg}
            />
            <PrimaryButton
              disabled={
                goalMutation.isPending ||
                !Number(goalDraft.calories) ||
                !Number(goalDraft.proteinG) ||
                !Number(goalDraft.carbsG) ||
                !Number(goalDraft.fatG) ||
                !hasNumberAtLeast(goalDraft.sugarG, 0) ||
                !hasNumberAtLeast(goalDraft.fiberG, 0) ||
                !hasNumberAtLeast(goalDraft.sodiumMg, 0)
              }
              label="Save targets"
              onPress={() => goalMutation.mutate()}
            />
          </View>

          <View style={styles.panel}>
            <Text style={styles.title}>Meal groups</Text>
            <View style={styles.inlineRow}>
              <TextInput
                accessibilityLabel="New meal group name"
                onChangeText={setNewMealGroupName}
                placeholder="New group"
                style={[styles.input, styles.inlineInput]}
                value={newMealGroupName}
              />
              <Pressable
                accessibilityLabel="Create meal group"
                disabled={!newMealGroupName.trim() || mealGroupMutationPending}
                onPress={() => createMealGroupMutation.mutate()}
                style={[styles.compactButton, (!newMealGroupName.trim() || mealGroupMutationPending) && styles.buttonDisabled]}
              >
                <Text style={styles.compactButtonText}>Add</Text>
              </Pressable>
            </View>
            {mealGroupError ? <Text style={styles.errorText}>{mealGroupError}</Text> : null}
            <View style={styles.mealGroupList}>
              {(meQuery.data.mealGroups ?? []).map((mealGroup, index, mealGroups) => (
                <MealGroupRow
                  key={mealGroup.id}
                  draftName={mealGroupDrafts[mealGroup.id] ?? mealGroup.name}
                  disabled={mealGroupMutationPending}
                  isFirst={index === 0}
                  isLast={index === mealGroups.length - 1}
                  mealGroup={mealGroup}
                  onChangeName={(value) => setMealGroupDrafts((drafts) => ({ ...drafts, [mealGroup.id]: value }))}
                  onDelete={() => deleteMealGroupMutation.mutate(mealGroup.id)}
                  onMoveDown={() => moveMealGroup(mealGroup.id, 1)}
                  onMoveUp={() => moveMealGroup(mealGroup.id, -1)}
                  onSave={() => updateMealGroupMutation.mutate({ id: mealGroup.id, name: mealGroupDrafts[mealGroup.id] ?? mealGroup.name })}
                />
              ))}
            </View>
          </View>

          <View style={styles.panel}>
            <Text style={styles.title}>AI usage</Text>
            {aiUsageQuery.isLoading ? (
              <ActivityIndicator color={colors.accent} />
            ) : aiUsageQuery.data ? (
              <AIUsagePanel usage={aiUsageQuery.data} />
            ) : (
              <Text style={styles.meta}>Usage unavailable.</Text>
            )}
          </View>

          <View style={styles.panel}>
            <Text style={styles.title}>Retained meal photos</Text>
            {mealPhotosQuery.isLoading ? (
              <ActivityIndicator color={colors.accent} />
            ) : (mealPhotosQuery.data?.mealPhotos ?? []).length === 0 ? (
              <Text style={styles.meta}>No retained photos.</Text>
            ) : (
              <View style={styles.photoList}>
                {(mealPhotosQuery.data?.mealPhotos ?? []).map((photo) => (
                  <RetainedPhotoRow
                    key={photo.id}
                    deleting={deletingPhotoId === photo.id}
                    opening={openingPhotoId === photo.id}
                    onDelete={() => {
                      void deleteRetainedPhoto(photo.id);
                    }}
                    onOpen={() => {
                      void openRetainedPhoto(photo.id);
                    }}
                    photo={photo}
                  />
                ))}
              </View>
            )}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

function LabeledInput({
  keyboardType,
  label,
  onChangeText,
  value
}: {
  keyboardType?: "default" | "number-pad";
  label: string;
  onChangeText: (value: string) => void;
  value: string;
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput keyboardType={keyboardType} onChangeText={onChangeText} style={styles.input} value={value} />
    </View>
  );
}

function MealGroupRow({
  disabled,
  draftName,
  isFirst,
  isLast,
  mealGroup,
  onChangeName,
  onDelete,
  onMoveDown,
  onMoveUp,
  onSave
}: {
  disabled: boolean;
  draftName: string;
  isFirst: boolean;
  isLast: boolean;
  mealGroup: MealGroup;
  onChangeName: (value: string) => void;
  onDelete: () => void;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onSave: () => void;
}) {
  const canSave = draftName.trim().length > 0 && draftName.trim() !== mealGroup.name;
  return (
    <View style={styles.mealGroupRow}>
      <View style={styles.mealGroupMain}>
        <TextInput
          accessibilityLabel={`${mealGroup.name} meal group name`}
          onChangeText={onChangeName}
          style={styles.input}
          value={draftName}
        />
        <Text style={styles.meta}>{mealGroup.isDefault ? "Default" : "Custom"}</Text>
      </View>
      <View style={styles.mealGroupActions}>
        <Pressable
          accessibilityLabel={`Move ${mealGroup.name} up`}
          disabled={disabled || isFirst}
          onPress={onMoveUp}
          style={[styles.iconTextButton, (disabled || isFirst) && styles.buttonDisabled]}
        >
          <Text style={styles.iconTextButtonText}>Up</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={`Move ${mealGroup.name} down`}
          disabled={disabled || isLast}
          onPress={onMoveDown}
          style={[styles.iconTextButton, (disabled || isLast) && styles.buttonDisabled]}
        >
          <Text style={styles.iconTextButtonText}>Down</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={`Save ${mealGroup.name} meal group`}
          disabled={disabled || !canSave}
          onPress={onSave}
          style={[styles.iconTextButton, (disabled || !canSave) && styles.buttonDisabled]}
        >
          <Text style={styles.iconTextButtonText}>Save</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={`Delete ${mealGroup.name} meal group`}
          disabled={disabled || mealGroup.isDefault}
          onPress={onDelete}
          style={[styles.deleteSmallButton, (disabled || mealGroup.isDefault) && styles.buttonDisabled]}
        >
          <Text style={styles.deleteSmallButtonText}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

function PrimaryButton({ disabled, label, onPress }: { disabled?: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={[styles.button, disabled && styles.buttonDisabled]}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({ disabled, label, onPress }: { disabled?: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={[styles.secondaryButton, disabled && styles.buttonDisabled]}>
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function RetainedPhotoRow({
  deleting,
  onDelete,
  onOpen,
  opening,
  photo
}: {
  deleting: boolean;
  onDelete: () => void;
  onOpen: () => void;
  opening: boolean;
  photo: MealPhoto;
}) {
  const origin = (globalThis as { location?: { origin?: string } }).location?.origin ?? "http://localhost:8082";
  const returnTo = `${origin}/?goProfile=1`;
  const sessionToken = getSessionToken();
  const deleteRedirectUrl = `${API_URL}/ai/meal-photos/${encodeURIComponent(photo.id)}/delete-redirect?redirectTo=${encodeURIComponent(returnTo)}${sessionToken ? `&sessionToken=${encodeURIComponent(sessionToken)}` : ""}`;

  return (
    <View style={styles.photoRow}>
      <View style={styles.photoMain}>
        <Text style={styles.photoName}>{photo.uploadedAt.slice(0, 10)}</Text>
        <Text style={styles.meta}>
          {photo.source} · {formatPhotoSize(photo.byteLength)}
        </Text>
      </View>
      <View style={styles.photoActions}>
        <Pressable
          accessibilityLabel={`Open retained photo ${photo.id}`}
          disabled={opening}
          onPress={onOpen}
          style={[styles.openButton, opening && styles.buttonDisabled]}
        >
          <Text style={styles.openButtonText}>{opening ? "Opening" : "Open"}</Text>
        </Pressable>
        {Platform.OS === "web" ? (
          <Link
            accessibilityLabel={`Delete retained photo ${photo.id}`}
            href={deleteRedirectUrl}
            style={styles.deleteLink}
          >
            Delete
          </Link>
        ) : (
          <Pressable
            accessibilityLabel={`Delete retained photo ${photo.id}`}
            disabled={deleting}
            onPress={onDelete}
            style={[styles.deleteButton, deleting && styles.buttonDisabled]}
          >
            <Text style={styles.deleteButtonText}>{deleting ? "Deleting" : "Delete"}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function formatPhotoSize(byteLength?: number | null): string {
  if (!byteLength) return "stored";
  if (byteLength < 1024) return `${byteLength} B`;
  if (byteLength < 1024 * 1024) return `${Math.round(byteLength / 1024)} KB`;
  return `${(byteLength / (1024 * 1024)).toFixed(1)} MB`;
}

function AIUsagePanel({ usage }: { usage: AIUsageSummaryResponse }) {
  return (
    <View style={styles.usageStack}>
      <View style={styles.usageSummaryRow}>
        <View>
          <Text style={styles.usageNumber}>{formatUsageUnits(usage.usedTodayUnits)} / {formatUsageUnits(usage.dailyBudgetUnits)}</Text>
          <Text style={styles.meta}>units today</Text>
        </View>
        <View style={styles.usageRight}>
          <Text style={styles.usageNumber}>{formatUsageUnits(usage.remainingTodayUnits)}</Text>
          <Text style={styles.meta}>left</Text>
        </View>
      </View>
      <View style={styles.usageRows}>
        {usage.limits.map((limit) => (
          <View key={limit.endpoint} style={styles.usageRow}>
            <View style={styles.usageRowMain}>
              <Text style={styles.usageLabel}>{usageEndpointLabel(limit.endpoint)}</Text>
              <Text style={styles.meta}>resets {formatResetTime(limit.resetsAt)}</Text>
            </View>
            <Text style={styles.usageCount}>
              {limit.used}/{limit.limit}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function usageEndpointLabel(endpoint: string): string {
  switch (endpoint) {
    case "meal-text-estimate":
      return "Text estimates";
    case "meal-photo-estimate":
      return "Photo estimates";
    case "meal-correct":
      return "Corrections";
    case "meal-match-saved":
      return "Saved matching";
    default:
      return endpoint;
  }
}

function formatUsageUnits(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatResetTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "later";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

const styles = StyleSheet.create({
  content: {
    backgroundColor: colors.background,
    gap: 16,
    padding: 16,
    paddingBottom: 48
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 14
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900"
  },
  inputGroup: {
    gap: 6
  },
  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800"
  },
  input: {
    backgroundColor: "#FBFAF7",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 11
  },
  metaGrid: {
    gap: 5
  },
  meta: {
    color: colors.muted,
    fontSize: 13
  },
  inlineRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  inlineInput: {
    flex: 1
  },
  compactButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 68,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  compactButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900"
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18
  },
  mealGroupList: {
    gap: 10
  },
  mealGroupRow: {
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 10
  },
  mealGroupMain: {
    gap: 5
  },
  mealGroupActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  iconTextButton: {
    alignItems: "center",
    backgroundColor: "#E6F0F3",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  iconTextButtonText: {
    color: colors.accentDark,
    fontSize: 12,
    fontWeight: "900"
  },
  deleteSmallButton: {
    alignItems: "center",
    backgroundColor: "#F8E8E5",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  deleteSmallButtonText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: "900"
  },
  usageStack: {
    gap: 12
  },
  usageSummaryRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  usageRight: {
    alignItems: "flex-end"
  },
  usageNumber: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900"
  },
  usageRows: {
    borderColor: colors.border,
    borderTopWidth: 1
  },
  usageRow: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    paddingVertical: 10
  },
  usageRowMain: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  usageLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900"
  },
  usageCount: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900"
  },
  photoList: {
    gap: 8
  },
  photoRow: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    padding: 10
  },
  photoMain: {
    flex: 1,
    gap: 3,
    minWidth: 0
  },
  photoName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900"
  },
  photoActions: {
    flexDirection: "row",
    gap: 8
  },
  openButton: {
    alignItems: "center",
    backgroundColor: "#E6F0F3",
    borderRadius: 8,
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 10
  },
  openButtonText: {
    color: colors.accentDark,
    fontSize: 12,
    fontWeight: "900"
  },
  deleteLink: {
    backgroundColor: "#B9443F",
    borderRadius: 8,
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 10,
    textAlign: "center"
  },
  deleteButton: {
    alignItems: "center",
    backgroundColor: "#B9443F",
    borderRadius: 8,
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 10
  },
  deleteButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900"
  },
  button: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 8,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 11
  },
  buttonDisabled: {
    opacity: 0.5
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900"
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "#E6F0F3",
    borderRadius: 8,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 11
  },
  secondaryButtonText: {
    color: colors.accentDark,
    fontSize: 14,
    fontWeight: "900"
  }
});
