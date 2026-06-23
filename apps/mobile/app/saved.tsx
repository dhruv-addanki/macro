import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Recipe, RecipeIngredient, SavedMeal } from "@macro/shared";
import { BookMarked, Check, Pencil, Plus, Save, Trash2, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../src/api/client";
import { FormTextInput, KeyboardAwareScrollView } from "../src/components/KeyboardForm";
import { colors } from "../src/theme/colors";
import { todayIso } from "../src/utils/date";

export default function SavedScreen() {
  const [date] = useState(todayIso());
  const queryClient = useQueryClient();
  const meQuery = useQuery({ queryKey: ["me"], queryFn: api.getMe });
  const savedQuery = useQuery({ queryKey: ["saved-meals"], queryFn: api.getSavedMeals });
  const recipesQuery = useQuery({ queryKey: ["recipes"], queryFn: api.getRecipes });
  const [mealGroupId, setMealGroupId] = useState("meal_lunch");
  const [recipeName, setRecipeName] = useState("Meal prep bowl");
  const [recipeServings, setRecipeServings] = useState("2");
  const [recipeCookedWeight, setRecipeCookedWeight] = useState("700");
  const [ingredientName, setIngredientName] = useState("Chicken and rice mix");
  const [ingredientGrams, setIngredientGrams] = useState("700");
  const [ingredientCalories, setIngredientCalories] = useState("1100");
  const [ingredientProtein, setIngredientProtein] = useState("90");
  const [ingredientCarbs, setIngredientCarbs] = useState("130");
  const [ingredientFat, setIngredientFat] = useState("24");
  const [ingredientSugar, setIngredientSugar] = useState("6");
  const [ingredientFiber, setIngredientFiber] = useState("8");
  const [ingredientSodium, setIngredientSodium] = useState("600");
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [editingSavedMealId, setEditingSavedMealId] = useState<string | null>(null);
  const [savedMealNameDraft, setSavedMealNameDraft] = useState("");
  const [selectedSavedMealEntryIds, setSelectedSavedMealEntryIds] = useState<string[]>([]);
  const [savedMealEditError, setSavedMealEditError] = useState<string | null>(null);
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [recipeEditError, setRecipeEditError] = useState<string | null>(null);

  const mealGroups = meQuery.data?.mealGroups ?? [];
  const selectedMeal = useMemo(
    () => mealGroups.find((mealGroup) => mealGroup.id === mealGroupId) ?? mealGroups[1] ?? mealGroups[0],
    [mealGroupId, mealGroups]
  );

  const logSavedMutation = useMutation({
    mutationFn: (id: string) => api.logSavedMeal({ id, date, mealGroupId: selectedMeal?.id ?? "meal_lunch" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["diary", date] });
    }
  });

  const deleteSavedMutation = useMutation({
    mutationFn: (id: string) => api.deleteSavedMeal(id),
    onSuccess: async (_data, deletedId) => {
      if (editingSavedMealId === deletedId) {
        cancelSavedMealEdit();
      }
      await queryClient.invalidateQueries({ queryKey: ["saved-meals"] });
    }
  });

  const updateSavedMutation = useMutation({
    mutationFn: (input: { id: string; name: string; entryIds: string[] }) => api.updateSavedMeal(input.id, { name: input.name, entryIds: input.entryIds }),
    onSuccess: async () => {
      setEditingSavedMealId(null);
      setSavedMealNameDraft("");
      setSelectedSavedMealEntryIds([]);
      setSavedMealEditError(null);
      await queryClient.invalidateQueries({ queryKey: ["saved-meals"] });
    },
    onError: (error) => {
      setSavedMealEditError(error instanceof Error ? error.message : "Could not update saved meal.");
    }
  });

  const logRecipeMutation = useMutation({
    mutationFn: (id: string) => api.logRecipe({ id, date, mealGroupId: selectedMeal?.id ?? "meal_lunch", servings: 1 }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["diary", date] });
    }
  });

  const createRecipeMutation = useMutation({
    mutationFn: () =>
      api.createRecipe({
        name: recipeName,
        servings: Number(recipeServings),
        totalCookedWeightG: Number(recipeCookedWeight) || undefined,
        ingredients
      }),
    onSuccess: async () => {
      resetRecipeBuilder();
      await queryClient.invalidateQueries({ queryKey: ["recipes"] });
    }
  });

  const updateRecipeMutation = useMutation({
    mutationFn: (id: string) =>
      api.updateRecipe(id, {
        name: recipeName.trim(),
        servings: Number(recipeServings),
        totalCookedWeightG: Number(recipeCookedWeight) || undefined,
        ingredients
      }),
    onSuccess: async () => {
      resetRecipeBuilder();
      await queryClient.invalidateQueries({ queryKey: ["recipes"] });
    },
    onError: (error) => {
      setRecipeEditError(error instanceof Error ? error.message : "Could not update recipe.");
    }
  });

  const deleteRecipeMutation = useMutation({
    mutationFn: (id: string) => api.deleteRecipe(id),
    onSuccess: async (_data, deletedId) => {
      if (editingRecipeId === deletedId) {
        resetRecipeBuilder();
      }
      await queryClient.invalidateQueries({ queryKey: ["recipes"] });
    }
  });

  const loading = savedQuery.isLoading || recipesQuery.isLoading || meQuery.isLoading;

  function startSavedMealEdit(meal: SavedMeal) {
    setEditingSavedMealId(meal.id);
    setSavedMealNameDraft(meal.name);
    setSelectedSavedMealEntryIds(meal.entries.map((entry) => entry.id));
    setSavedMealEditError(null);
  }

  function cancelSavedMealEdit() {
    setEditingSavedMealId(null);
    setSavedMealNameDraft("");
    setSelectedSavedMealEntryIds([]);
    setSavedMealEditError(null);
  }

  function toggleSavedMealEntry(id: string) {
    setSelectedSavedMealEntryIds((current) => (current.includes(id) ? current.filter((entryId) => entryId !== id) : [...current, id]));
  }

  function saveSavedMealEdit() {
    if (!editingSavedMealId || !savedMealNameDraft.trim() || selectedSavedMealEntryIds.length === 0) {
      setSavedMealEditError("Keep a name and at least one item.");
      return;
    }
    setSavedMealEditError(null);
    updateSavedMutation.mutate({
      id: editingSavedMealId,
      name: savedMealNameDraft.trim(),
      entryIds: selectedSavedMealEntryIds
    });
  }

  function resetRecipeBuilder() {
    setEditingRecipeId(null);
    setRecipeName("Meal prep bowl");
    setRecipeServings("2");
    setRecipeCookedWeight("700");
    setIngredientName("Chicken and rice mix");
    setIngredientGrams("700");
    setIngredientCalories("1100");
    setIngredientProtein("90");
    setIngredientCarbs("130");
    setIngredientFat("24");
    setIngredientSugar("6");
    setIngredientFiber("8");
    setIngredientSodium("600");
    setIngredients([]);
    setRecipeEditError(null);
  }

  function startRecipeEdit(recipe: Recipe) {
    setEditingRecipeId(recipe.id);
    setRecipeName(recipe.name);
    setRecipeServings(String(recipe.servings));
    setRecipeCookedWeight(recipe.totalCookedWeightG ? String(recipe.totalCookedWeightG) : "");
    setIngredients(recipe.ingredients);
    setIngredientName("");
    setIngredientGrams("");
    setIngredientCalories("");
    setIngredientProtein("");
    setIngredientCarbs("");
    setIngredientFat("");
    setIngredientSugar("");
    setIngredientFiber("");
    setIngredientSodium("");
    setRecipeEditError(null);
  }

  function saveRecipeBuilder() {
    if (!recipeName.trim() || Number(recipeServings) <= 0 || ingredients.length === 0) return;
    if (editingRecipeId) {
      setRecipeEditError(null);
      updateRecipeMutation.mutate(editingRecipeId);
      return;
    }
    createRecipeMutation.mutate();
  }

  return (
    <KeyboardAwareScrollView contentContainerStyle={styles.content}>
      <View style={styles.panel}>
        <Text style={styles.title}>Log to</Text>
        <View style={styles.chipRow}>
          {mealGroups.map((mealGroup) => (
            <Pressable
              key={mealGroup.id}
              onPress={() => setMealGroupId(mealGroup.id)}
              style={[styles.chip, (selectedMeal?.id ?? mealGroupId) === mealGroup.id && styles.chipActive]}
            >
              <Text style={[styles.chipText, (selectedMeal?.id ?? mealGroupId) === mealGroup.id && styles.chipTextActive]}>
                {mealGroup.name}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <>
          <View style={styles.sectionHeader}>
            <BookMarked color={colors.accentDark} size={19} />
            <Text style={styles.sectionTitle}>Saved meals</Text>
          </View>
          {(savedQuery.data?.savedMeals ?? []).length === 0 ? (
            <EmptyText text="Save a meal section from the Diary screen to reuse it here." />
          ) : (
            (savedQuery.data?.savedMeals ?? []).map((meal) => {
              const isEditing = editingSavedMealId === meal.id;
              const canSave = savedMealNameDraft.trim().length > 0 && selectedSavedMealEntryIds.length > 0 && !updateSavedMutation.isPending;

              return (
                <View key={meal.id} style={[styles.card, isEditing && styles.cardExpanded]}>
                  <View style={styles.cardMain}>
                    <Text style={styles.cardTitle}>{meal.name}</Text>
                    <Text style={styles.meta}>
                      {Math.round(meal.totals.calories)} cal · P {Math.round(meal.totals.proteinG)}g · C{" "}
                      {Math.round(meal.totals.carbsG)}g · F {Math.round(meal.totals.fatG)}g
                    </Text>
                    <Text style={styles.meta}>{meal.entries.length} item(s)</Text>

                    {isEditing ? (
                      <View style={styles.savedMealEditor}>
                        <FormTextInput onChangeText={setSavedMealNameDraft} placeholder="Saved meal name" style={styles.input} value={savedMealNameDraft} />
                        <View style={styles.savedMealEntries}>
                          {meal.entries.map((entry) => {
                            const selected = selectedSavedMealEntryIds.includes(entry.id);
                            return (
                              <Pressable
                                accessibilityLabel={`${selected ? "Remove" : "Keep"} ${entry.displayName}`}
                                key={entry.id}
                                onPress={() => toggleSavedMealEntry(entry.id)}
                                style={[styles.entryToggle, selected && styles.entryToggleSelected]}
                              >
                                <View style={[styles.entryToggleIcon, selected && styles.entryToggleIconSelected]}>
                                  {selected ? <Check color="#FFFFFF" size={15} /> : null}
                                </View>
                                <View style={styles.cardMain}>
                                  <Text style={styles.ingredientName}>{entry.displayName}</Text>
                                  <Text style={styles.meta}>
                                    {Math.round(entry.macros.calories)} cal · P {Math.round(entry.macros.proteinG)}g · C{" "}
                                    {Math.round(entry.macros.carbsG)}g · F {Math.round(entry.macros.fatG)}g
                                  </Text>
                                </View>
                              </Pressable>
                            );
                          })}
                        </View>
                        {savedMealEditError ? <Text style={styles.errorText}>{savedMealEditError}</Text> : null}
                        <View style={styles.editorActions}>
                          <Pressable
                            accessibilityLabel={`Save ${meal.name}`}
                            disabled={!canSave}
                            onPress={saveSavedMealEdit}
                            style={[styles.saveButton, !canSave && styles.buttonDisabled]}
                          >
                            <Save color="#FFFFFF" size={16} />
                            <Text style={styles.saveButtonText}>{updateSavedMutation.isPending ? "Saving..." : "Save"}</Text>
                          </Pressable>
                          <Pressable accessibilityLabel={`Cancel editing ${meal.name}`} onPress={cancelSavedMealEdit} style={styles.cancelButton}>
                            <X color={colors.text} size={17} />
                          </Pressable>
                        </View>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.actions}>
                    <Pressable
                      accessibilityLabel={`${isEditing ? "Close editor for" : "Edit"} ${meal.name}`}
                      onPress={() => (isEditing ? cancelSavedMealEdit() : startSavedMealEdit(meal))}
                      style={styles.editButton}
                    >
                      {isEditing ? <X color={colors.text} size={17} /> : <Pencil color={colors.text} size={17} />}
                    </Pressable>
                    <Pressable accessibilityLabel={`Log ${meal.name}`} onPress={() => logSavedMutation.mutate(meal.id)} style={styles.logButton}>
                      <Check color="#FFFFFF" size={17} />
                    </Pressable>
                    <Pressable accessibilityLabel={`Delete ${meal.name}`} onPress={() => deleteSavedMutation.mutate(meal.id)} style={styles.deleteButton}>
                      <Trash2 color={colors.danger} size={17} />
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}

          <View style={styles.sectionHeader}>
            <BookMarked color={colors.accentDark} size={19} />
            <Text style={styles.sectionTitle}>Recipes</Text>
          </View>
          <RecipeBuilder
            actionLabel={editingRecipeId ? "Update recipe" : "Create recipe"}
            cookedWeight={recipeCookedWeight}
            error={recipeEditError}
            ingredientCalories={ingredientCalories}
            ingredientCarbs={ingredientCarbs}
            ingredientFat={ingredientFat}
            ingredientFiber={ingredientFiber}
            ingredientGrams={ingredientGrams}
            ingredientName={ingredientName}
            ingredientProtein={ingredientProtein}
            ingredientSodium={ingredientSodium}
            ingredientSugar={ingredientSugar}
            ingredients={ingredients}
            loading={createRecipeMutation.isPending || updateRecipeMutation.isPending}
            loadingLabel={editingRecipeId ? "Updating..." : "Saving..."}
            name={recipeName}
            servings={recipeServings}
            title={editingRecipeId ? "Edit recipe" : "Recipe builder"}
            onAddIngredient={() => {
              const grams = Number(ingredientGrams);
              const calories = Number(ingredientCalories);
              const proteinG = Number(ingredientProtein);
              const carbsG = Number(ingredientCarbs);
              const fatG = Number(ingredientFat);
              const sugarG = Number(ingredientSugar);
              const fiberG = Number(ingredientFiber);
              const sodiumMg = Number(ingredientSodium);
              if (!ingredientName.trim() || !grams || !calories) return;
              setIngredients((current) => [
                ...current,
                {
                  id: `ingredient_${Date.now()}`,
                  foodItemId: null,
                  displayName: ingredientName.trim(),
                  quantity: 1,
                  unit: "batch",
                  grams,
                  macros: {
                    calories,
                    proteinG: proteinG || 0,
                    carbsG: carbsG || 0,
                    fatG: fatG || 0,
                    sugarG: sugarG || 0,
                    fiberG: fiberG || 0,
                    sodiumMg: sodiumMg || 0
                  }
                }
              ]);
              setIngredientName("");
              setIngredientGrams("");
              setIngredientCalories("");
              setIngredientProtein("");
              setIngredientCarbs("");
              setIngredientFat("");
              setIngredientSugar("");
              setIngredientFiber("");
              setIngredientSodium("");
            }}
            onChangeCookedWeight={setRecipeCookedWeight}
            onChangeIngredientCalories={setIngredientCalories}
            onChangeIngredientCarbs={setIngredientCarbs}
            onChangeIngredientFat={setIngredientFat}
            onChangeIngredientFiber={setIngredientFiber}
            onChangeIngredientGrams={setIngredientGrams}
            onChangeIngredientName={setIngredientName}
            onChangeIngredientProtein={setIngredientProtein}
            onChangeIngredientSodium={setIngredientSodium}
            onChangeIngredientSugar={setIngredientSugar}
            onChangeName={setRecipeName}
            onChangeServings={setRecipeServings}
            onCancel={editingRecipeId ? resetRecipeBuilder : undefined}
            onCreate={saveRecipeBuilder}
            onRemoveIngredient={(id) => setIngredients((current) => current.filter((ingredient) => ingredient.id !== id))}
          />
          {(recipesQuery.data?.recipes ?? []).length === 0 ? (
            <EmptyText text="Create a recipe above to reuse meal-prep batches and homemade foods." />
          ) : (
            (recipesQuery.data?.recipes ?? []).map((recipe) => (
              <View key={recipe.id} style={[styles.card, editingRecipeId === recipe.id && styles.cardExpanded]}>
                <View style={styles.cardMain}>
                  <Text style={styles.cardTitle}>{recipe.name}</Text>
                  <Text style={styles.meta}>
                    Per serving: {Math.round(recipe.perServing.calories)} cal · P{" "}
                    {Math.round(recipe.perServing.proteinG)}g · Sugar {Math.round(recipe.perServing.sugarG ?? 0)}g
                  </Text>
                </View>
                <View style={styles.actions}>
                  <Pressable
                    accessibilityLabel={`Edit ${recipe.name}`}
                    onPress={() => startRecipeEdit(recipe)}
                    style={styles.editButton}
                  >
                    <Pencil color={colors.text} size={17} />
                  </Pressable>
                  <Pressable accessibilityLabel={`Log ${recipe.name}`} onPress={() => logRecipeMutation.mutate(recipe.id)} style={styles.logButton}>
                    <Check color="#FFFFFF" size={17} />
                  </Pressable>
                  <Pressable accessibilityLabel={`Delete ${recipe.name}`} onPress={() => deleteRecipeMutation.mutate(recipe.id)} style={styles.deleteButton}>
                    <Trash2 color={colors.danger} size={17} />
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </>
      )}
    </KeyboardAwareScrollView>
  );
}

function EmptyText({ text }: { text: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function RecipeBuilder({
  actionLabel,
  cookedWeight,
  error,
  ingredientCalories,
  ingredientCarbs,
  ingredientFat,
  ingredientFiber,
  ingredientGrams,
  ingredientName,
  ingredientProtein,
  ingredientSodium,
  ingredientSugar,
  ingredients,
  loading,
  loadingLabel,
  name,
  onAddIngredient,
  onCancel,
  onChangeCookedWeight,
  onChangeIngredientCalories,
  onChangeIngredientCarbs,
  onChangeIngredientFat,
  onChangeIngredientFiber,
  onChangeIngredientGrams,
  onChangeIngredientName,
  onChangeIngredientProtein,
  onChangeIngredientSodium,
  onChangeIngredientSugar,
  onChangeName,
  onChangeServings,
  onCreate,
  onRemoveIngredient,
  servings,
  title
}: {
  actionLabel: string;
  cookedWeight: string;
  error?: string | null;
  ingredientCalories: string;
  ingredientCarbs: string;
  ingredientFat: string;
  ingredientFiber: string;
  ingredientGrams: string;
  ingredientName: string;
  ingredientProtein: string;
  ingredientSodium: string;
  ingredientSugar: string;
  ingredients: RecipeIngredient[];
  loading: boolean;
  loadingLabel: string;
  name: string;
  onAddIngredient: () => void;
  onCancel?: () => void;
  onChangeCookedWeight: (value: string) => void;
  onChangeIngredientCalories: (value: string) => void;
  onChangeIngredientCarbs: (value: string) => void;
  onChangeIngredientFat: (value: string) => void;
  onChangeIngredientFiber: (value: string) => void;
  onChangeIngredientGrams: (value: string) => void;
  onChangeIngredientName: (value: string) => void;
  onChangeIngredientProtein: (value: string) => void;
  onChangeIngredientSodium: (value: string) => void;
  onChangeIngredientSugar: (value: string) => void;
  onChangeName: (value: string) => void;
  onChangeServings: (value: string) => void;
  onCreate: () => void;
  onRemoveIngredient: (id: string) => void;
  servings: string;
  title: string;
}) {
  const canCreate = name.trim() && Number(servings) > 0 && ingredients.length > 0;

  return (
    <View style={styles.builder}>
      <Text style={styles.title}>{title}</Text>
      <FormTextInput onChangeText={onChangeName} placeholder="Recipe name" style={styles.input} value={name} />
      <View style={styles.twoCol}>
        <FormTextInput keyboardType="number-pad" onChangeText={onChangeServings} placeholder="Servings" style={styles.input} value={servings} />
        <FormTextInput
          keyboardType="number-pad"
          onChangeText={onChangeCookedWeight}
          placeholder="Cooked weight g"
          style={styles.input}
          value={cookedWeight}
        />
      </View>

      <View style={styles.ingredientBox}>
        <Text style={styles.subTitle}>Add ingredient</Text>
        <FormTextInput onChangeText={onChangeIngredientName} placeholder="Ingredient name" style={styles.input} value={ingredientName} />
        <View style={styles.twoCol}>
          <FormTextInput keyboardType="number-pad" onChangeText={onChangeIngredientGrams} placeholder="Grams" style={styles.input} value={ingredientGrams} />
          <FormTextInput keyboardType="number-pad" onChangeText={onChangeIngredientCalories} placeholder="Calories" style={styles.input} value={ingredientCalories} />
        </View>
        <View style={styles.threeCol}>
          <FormTextInput keyboardType="number-pad" onChangeText={onChangeIngredientProtein} placeholder="P" style={styles.input} value={ingredientProtein} />
          <FormTextInput keyboardType="number-pad" onChangeText={onChangeIngredientCarbs} placeholder="C" style={styles.input} value={ingredientCarbs} />
          <FormTextInput keyboardType="number-pad" onChangeText={onChangeIngredientFat} placeholder="F" style={styles.input} value={ingredientFat} />
        </View>
        <View style={styles.threeCol}>
          <FormTextInput keyboardType="number-pad" onChangeText={onChangeIngredientSugar} placeholder="Sugar" style={styles.input} value={ingredientSugar} />
          <FormTextInput keyboardType="number-pad" onChangeText={onChangeIngredientFiber} placeholder="Fiber" style={styles.input} value={ingredientFiber} />
          <FormTextInput keyboardType="number-pad" onChangeText={onChangeIngredientSodium} placeholder="Sodium mg" style={styles.input} value={ingredientSodium} />
        </View>
        <Pressable accessibilityLabel="Add recipe ingredient" onPress={onAddIngredient} style={styles.secondaryAction}>
          <Plus color={colors.accentDark} size={16} />
          <Text style={styles.secondaryActionText}>Add ingredient</Text>
        </Pressable>
      </View>

      {ingredients.length > 0 ? (
        <View style={styles.ingredientsList}>
          {ingredients.map((ingredient) => (
            <View key={ingredient.id} style={styles.ingredientRow}>
              <View style={styles.cardMain}>
                <Text style={styles.ingredientName}>{ingredient.displayName}</Text>
                <Text style={styles.meta}>
                  {Math.round(ingredient.macros.calories)} cal · P {Math.round(ingredient.macros.proteinG)}g · C{" "}
                  {Math.round(ingredient.macros.carbsG)}g · F {Math.round(ingredient.macros.fatG)}g · Sugar{" "}
                  {Math.round(ingredient.macros.sugarG ?? 0)}g
                </Text>
              </View>
              <Pressable onPress={() => onRemoveIngredient(ingredient.id)} style={styles.deleteButton}>
                <Trash2 color={colors.danger} size={16} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.editorActions}>
        <Pressable
          accessibilityLabel={actionLabel}
          disabled={!canCreate || loading}
          onPress={onCreate}
          style={[styles.createButton, onCancel && styles.flexButton, (!canCreate || loading) && styles.buttonDisabled]}
        >
          <Text style={styles.createButtonText}>{loading ? loadingLabel : actionLabel}</Text>
        </Pressable>
        {onCancel ? (
          <Pressable accessibilityLabel="Cancel recipe edit" onPress={onCancel} style={styles.cancelButton}>
            <X color={colors.text} size={17} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
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
    gap: 10,
    padding: 14
  },
  builder: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 14
  },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    fontSize: 14,
    minHeight: 42,
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
  ingredientBox: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 9,
    padding: 10
  },
  subTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900"
  },
  secondaryAction: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: 8,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minHeight: 40
  },
  secondaryActionText: {
    color: colors.accentDark,
    fontSize: 13,
    fontWeight: "900"
  },
  ingredientsList: {
    gap: 8
  },
  ingredientRow: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 10
  },
  ingredientName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900"
  },
  createButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 8,
    flex: 1,
    minHeight: 44,
    justifyContent: "center"
  },
  flexButton: {
    flex: 1
  },
  createButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900"
  },
  buttonDisabled: {
    opacity: 0.5
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900"
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  chip: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  chipText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800"
  },
  chipTextActive: {
    color: "#FFFFFF"
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900"
  },
  card: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    padding: 14
  },
  cardExpanded: {
    alignItems: "flex-start"
  },
  cardMain: {
    flex: 1,
    gap: 4,
    minWidth: 0
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900"
  },
  meta: {
    color: colors.muted,
    fontSize: 13
  },
  actions: {
    flexDirection: "row",
    gap: 8
  },
  editButton: {
    alignItems: "center",
    backgroundColor: "#EFECE7",
    borderRadius: 8,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  logButton: {
    alignItems: "center",
    backgroundColor: colors.success,
    borderRadius: 8,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  deleteButton: {
    alignItems: "center",
    backgroundColor: "#F8E8E5",
    borderRadius: 8,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  savedMealEditor: {
    gap: 10,
    marginTop: 10
  },
  savedMealEntries: {
    gap: 8
  },
  entryToggle: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 54,
    padding: 10
  },
  entryToggleSelected: {
    backgroundColor: "#EEF7F3",
    borderColor: colors.accent
  },
  entryToggleIcon: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    height: 24,
    justifyContent: "center",
    width: 24
  },
  entryToggleIconSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  editorActions: {
    flexDirection: "row",
    gap: 8
  },
  saveButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 8,
    flex: 1,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minHeight: 42
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900"
  },
  cancelButton: {
    alignItems: "center",
    backgroundColor: "#EFECE7",
    borderRadius: 8,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "800"
  },
  empty: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: 14
  },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20
  }
});
