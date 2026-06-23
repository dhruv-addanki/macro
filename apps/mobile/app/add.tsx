import type {
  BarcodeLookupResponse,
  BarcodeProductRequest,
  CreateCustomFoodRequest,
  FoodItem,
  MealEstimate,
  MealPhoto,
  SavedMealMatch
} from "@macro/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { Barcode, Camera, Check, Pencil, Plus, Search, Sparkles, Star, Utensils } from "lucide-react-native";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import { PHOTO_RETENTION_ENABLED, api } from "../src/api/client";
import { ConfidenceBadge } from "../src/components/ConfidenceBadge";
import { FormTextInput, KeyboardAwareScrollView } from "../src/components/KeyboardForm";
import { colors } from "../src/theme/colors";
import { todayIso } from "../src/utils/date";

type Mode = "text" | "photo" | "barcode" | "search";
const MEAL_PHOTO_MAX_WIDTH = 1280;
const MEAL_PHOTO_JPEG_QUALITY = 0.65;

export default function AddFoodScreen() {
  const params = useLocalSearchParams<{ date?: string; mealGroupId?: string }>();
  const date = params.date ?? todayIso();
  const mealGroupId = params.mealGroupId ?? "meal_lunch";
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>("photo");
  const [text, setText] = useState("");
  const [photoContext, setPhotoContext] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | undefined>();
  const [photoMimeType, setPhotoMimeType] = useState("image/jpeg");
  const [photoSource, setPhotoSource] = useState<"camera" | "library">("library");
  const [photoPermissionError, setPhotoPermissionError] = useState<string | null>(null);
  const [retainPhoto, setRetainPhoto] = useState(false);
  const [retainedPhoto, setRetainedPhoto] = useState<MealPhoto | null>(null);
  const [barcode, setBarcode] = useState("");
  const [showBarcodeForm, setShowBarcodeForm] = useState(false);
  const [barcodeName, setBarcodeName] = useState("");
  const [barcodeBrand, setBarcodeBrand] = useState("");
  const [barcodeServingName, setBarcodeServingName] = useState("package serving");
  const [barcodeServingGrams, setBarcodeServingGrams] = useState("100");
  const [barcodeCalories, setBarcodeCalories] = useState("");
  const [barcodeProtein, setBarcodeProtein] = useState("");
  const [barcodeCarbs, setBarcodeCarbs] = useState("");
  const [barcodeFat, setBarcodeFat] = useState("");
  const [barcodeSugar, setBarcodeSugar] = useState("");
  const [barcodeFiber, setBarcodeFiber] = useState("");
  const [barcodeSodium, setBarcodeSodium] = useState("");
  const [barcodeQuantity, setBarcodeQuantity] = useState("1");
  const [search, setSearch] = useState("");
  const [showCustomFood, setShowCustomFood] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customBrand, setCustomBrand] = useState("");
  const [customServingName, setCustomServingName] = useState("");
  const [customServingGrams, setCustomServingGrams] = useState("");
  const [customCalories, setCustomCalories] = useState("");
  const [customProtein, setCustomProtein] = useState("");
  const [customCarbs, setCustomCarbs] = useState("");
  const [customFat, setCustomFat] = useState("");
  const [customSugar, setCustomSugar] = useState("");
  const [customFiber, setCustomFiber] = useState("");
  const [customSodium, setCustomSodium] = useState("");
  const [correction, setCorrection] = useState("");
  const [estimate, setEstimate] = useState<MealEstimate | null>(null);
  const [estimateId, setEstimateId] = useState<string | undefined>();
  const [estimateSource, setEstimateSource] = useState<"ai_text" | "ai_photo">("ai_text");
  const [barcodeResult, setBarcodeResult] = useState<BarcodeLookupResponse | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string | undefined>();
  const [showScanner, setShowScanner] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const searchQuery = useQuery({
    queryKey: ["foods", search],
    queryFn: () => api.searchFoods(search),
    enabled: mode === "search" && search.trim().length > 0
  });

  const recentQuery = useQuery({
    queryKey: ["foods", "recent"],
    queryFn: api.getRecentFoods,
    enabled: mode === "search"
  });

  const favoritesQuery = useQuery({
    queryKey: ["foods", "favorites"],
    queryFn: api.getFavoriteFoods,
    enabled: mode === "search"
  });

  const memoryQuery = useQuery({
    queryKey: ["meal-memory", text],
    queryFn: () => api.matchSavedMeals({ query: text, limit: 4 }),
    enabled: mode === "text" && text.trim().length >= 3
  });

  const textEstimateMutation = useMutation({
    mutationFn: () => api.estimateTextMeal({ text, date, mealGroupId }),
    onSuccess: (response) => {
      setEstimate(response.estimate);
      setEstimateId(response.estimateId);
      setEstimateSource("ai_text");
      setRetainedPhoto(null);
    }
  });

  const photoEstimateMutation = useMutation({
    mutationFn: () => {
      if (!imageBase64) throw new Error("Take or choose a meal photo first.");
      return api.estimatePhotoMeal({
        context: photoContext.trim(),
        imageBase64,
        date,
        mealGroupId,
        mimeType: photoMimeType,
        photoSource,
        retainPhoto
      });
    },
    onMutate: () => {
      setPhotoPermissionError(null);
    },
    onSuccess: async (response) => {
      setEstimate(response.estimate);
      setEstimateId(response.estimateId);
      setEstimateSource("ai_photo");
      setRetainedPhoto(response.mealPhoto ?? null);
      if (response.mealPhoto) {
        await queryClient.invalidateQueries({ queryKey: ["meal-photos"] });
      }
    },
    onError: (error) => {
      setPhotoPermissionError(error instanceof Error ? error.message : "Could not analyze the meal photo.");
    }
  });

  const correctionMutation = useMutation({
    mutationFn: () => {
      if (!estimate) throw new Error("No estimate to correct");
      return api.correctMeal({ estimate, estimateId, correctionText: correction.trim() });
    },
    onSuccess: (response) => {
      setEstimate(response.estimate);
      setEstimateId(response.estimateId);
      setCorrection("");
      void queryClient.invalidateQueries({ queryKey: ["analytics-summary"] });
    }
  });

  const logEstimateMutation = useMutation({
    mutationFn: () => {
      if (!estimate) throw new Error("No estimate to log");
      return api.logEstimate({ estimate, estimateId, date, mealGroupId, sourceType: estimateSource });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["diary", date] });
      await queryClient.invalidateQueries({ queryKey: ["analytics-summary"] });
      router.back();
    }
  });

  const barcodeMutation = useMutation({
    mutationFn: (value: string) => api.lookupBarcode(value),
    onSuccess: (response) => {
      setBarcodeResult(response);
      setSelectedUnitId(preferredServingUnitId(response.food ?? undefined) ?? response.servingUnits[0]?.id);
      if (response.found && response.food) {
        hydrateBarcodeForm(response.food);
        setShowBarcodeForm(false);
      } else {
        setShowBarcodeForm(true);
      }
      void queryClient.invalidateQueries({ queryKey: ["analytics-summary"] });
    }
  });

  const createBarcodeProductMutation = useMutation({
    mutationFn: () => api.createBarcodeProduct(buildBarcodeProductInput()),
    onSuccess: async (response) => {
      setBarcodeResult(response);
      setSelectedUnitId(preferredServingUnitId(response.food ?? undefined));
      setShowBarcodeForm(false);
      await queryClient.invalidateQueries({ queryKey: ["foods"] });
    }
  });

  const updateBarcodeProductMutation = useMutation({
    mutationFn: () => {
      if (!barcodeResult?.food) throw new Error("No barcode product to update");
      const { barcode: _barcode, ...input } = buildBarcodeProductInput();
      return api.updateBarcodeProduct(barcodeResult.food.id, input);
    },
    onSuccess: async (response) => {
      setBarcodeResult(response);
      setSelectedUnitId(preferredServingUnitId(response.food ?? undefined));
      setShowBarcodeForm(false);
      await queryClient.invalidateQueries({ queryKey: ["foods"] });
    }
  });

  const favoriteIds = useMemo(
    () => new Set((favoritesQuery.data?.foods ?? []).map((food) => food.id)),
    [favoritesQuery.data]
  );

  const logFoodMutation = useMutation({
    mutationFn: (input: { food: FoodItem; quantity?: number; unitId?: string }) =>
      api.logFood({ foodId: input.food.id, date, mealGroupId, quantity: input.quantity ?? 1, unitId: input.unitId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["diary", date] });
      await queryClient.invalidateQueries({ queryKey: ["foods", "recent"] });
      await queryClient.invalidateQueries({ queryKey: ["analytics-summary"] });
      router.back();
    }
  });

  const toggleFavoriteMutation = useMutation({
    mutationFn: (foodId: string) => api.toggleFavoriteFood(foodId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["foods"] });
    }
  });

  const createCustomFoodMutation = useMutation({
    mutationFn: () => api.createCustomFood(buildCustomFoodInput()),
    onSuccess: async (food) => {
      setSearch(food.name);
      setShowCustomFood(false);
      await queryClient.invalidateQueries({ queryKey: ["foods"] });
    }
  });

  const logMemoryMutation = useMutation({
    mutationFn: async (match: SavedMealMatch) => {
      if (match.type === "recipe") {
        await api.logRecipe({ id: match.id, date, mealGroupId, servings: 1 });
        return { ok: true };
      }
      await api.logSavedMeal({ id: match.id, date, mealGroupId });
      return { ok: true };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["diary", date] });
      await queryClient.invalidateQueries({ queryKey: ["analytics-summary"] });
      router.back();
    }
  });

  const canCreateCustomFood =
    customName.trim().length > 0 &&
    Number(customServingGrams) > 0 &&
    Number(customCalories) >= 0 &&
    Number(customProtein) >= 0 &&
    Number(customCarbs) >= 0 &&
    Number(customFat) >= 0 &&
    Number(customSugar) >= 0;

  const canSaveBarcodeProduct =
    barcode.trim().length >= 4 &&
    barcodeName.trim().length > 0 &&
    Number(barcodeServingGrams) > 0 &&
    Number(barcodeCalories) >= 0 &&
    Number(barcodeProtein) >= 0 &&
    Number(barcodeCarbs) >= 0 &&
    Number(barcodeFat) >= 0 &&
    Number(barcodeSugar) >= 0;

  function per100g(value: string) {
    return per100gFrom(customServingGrams, value);
  }

  function per100gFrom(servingGrams: string, value: string) {
    const grams = Number(servingGrams) || 100;
    const parsed = Number(value) || 0;
    return Math.round((parsed / grams) * 1000) / 10;
  }

  function servingValueFromPer100g(per100gValue: number, servingGrams: number) {
    return String(Math.round((per100gValue * servingGrams) / 10) / 10);
  }

  function buildCustomFoodInput(): CreateCustomFoodRequest {
    return {
      name: customName.trim(),
      brand: customBrand.trim() || null,
      per100g: {
        calories: per100g(customCalories),
        proteinG: per100g(customProtein),
        carbsG: per100g(customCarbs),
        fatG: per100g(customFat),
        sugarG: per100g(customSugar),
        fiberG: per100g(customFiber),
        sodiumMg: per100g(customSodium)
      },
      servingUnit: {
        unitName: customServingName.trim() || "1 serving",
        gramsPerUnit: Number(customServingGrams) || 100,
        source: "user",
        confidence: "high"
      }
    };
  }

  function preferredServingUnitId(food?: FoodItem) {
    return food?.servingUnits.find((unit) => unit.unitName !== "100 g")?.id ?? food?.servingUnits[0]?.id;
  }

  function hydrateBarcodeForm(food: FoodItem) {
    const servingUnit =
      food.servingUnits.find((unit) => unit.source === "label" && unit.unitName !== "100 g") ??
      food.servingUnits.find((unit) => unit.unitName !== "100 g") ??
      food.servingUnits[0];
    const servingGrams = servingUnit?.gramsPerUnit ?? 100;

    setBarcodeName(food.name);
    setBarcodeBrand(food.brand ?? "");
    setBarcodeServingName(servingUnit?.unitName ?? "package serving");
    setBarcodeServingGrams(String(Math.round(servingGrams * 10) / 10));
    setBarcodeCalories(servingValueFromPer100g(food.per100g.calories, servingGrams));
    setBarcodeProtein(servingValueFromPer100g(food.per100g.proteinG, servingGrams));
    setBarcodeCarbs(servingValueFromPer100g(food.per100g.carbsG, servingGrams));
    setBarcodeFat(servingValueFromPer100g(food.per100g.fatG, servingGrams));
    setBarcodeSugar(servingValueFromPer100g(food.per100g.sugarG ?? 0, servingGrams));
    setBarcodeFiber(servingValueFromPer100g(food.per100g.fiberG, servingGrams));
    setBarcodeSodium(servingValueFromPer100g(food.per100g.sodiumMg, servingGrams));
  }

  function buildBarcodeProductInput(): BarcodeProductRequest {
    return {
      barcode: barcode.trim(),
      name: barcodeName.trim(),
      brand: barcodeBrand.trim() || null,
      per100g: {
        calories: per100gFrom(barcodeServingGrams, barcodeCalories),
        proteinG: per100gFrom(barcodeServingGrams, barcodeProtein),
        carbsG: per100gFrom(barcodeServingGrams, barcodeCarbs),
        fatG: per100gFrom(barcodeServingGrams, barcodeFat),
        sugarG: per100gFrom(barcodeServingGrams, barcodeSugar),
        fiberG: per100gFrom(barcodeServingGrams, barcodeFiber),
        sodiumMg: per100gFrom(barcodeServingGrams, barcodeSodium)
      },
      servingUnits: [
        {
          unitName: barcodeServingName.trim() || "package serving",
          gramsPerUnit: Number(barcodeServingGrams) || 100,
          source: "user",
          confidence: "high"
        }
      ]
    };
  }

  const currentLoading = useMemo(
    () =>
      textEstimateMutation.isPending ||
      photoEstimateMutation.isPending ||
      correctionMutation.isPending ||
      logEstimateMutation.isPending ||
      barcodeMutation.isPending ||
      createBarcodeProductMutation.isPending ||
      updateBarcodeProductMutation.isPending ||
      logFoodMutation.isPending ||
      logMemoryMutation.isPending ||
      createCustomFoodMutation.isPending,
    [
      textEstimateMutation.isPending,
      photoEstimateMutation.isPending,
      correctionMutation.isPending,
      logEstimateMutation.isPending,
      barcodeMutation.isPending,
      createBarcodeProductMutation.isPending,
      updateBarcodeProductMutation.isPending,
      logFoodMutation.isPending,
      logMemoryMutation.isPending,
      createCustomFoodMutation.isPending
    ]
  );

  const parsedBarcodeQuantity = Number(barcodeQuantity);
  const hasMealPhoto = Boolean(imageBase64);
  const canLogBarcodeFood = Boolean(
    barcodeResult?.food &&
      selectedUnitId &&
      Number.isFinite(parsedBarcodeQuantity) &&
      parsedBarcodeQuantity > 0 &&
      !currentLoading
  );

  async function pickMealPhoto(useCamera: boolean) {
    try {
      if (useCamera) {
        const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
        if (!cameraPermission.granted) {
          const message = cameraPermission.canAskAgain
            ? "Camera permission is required to photograph a meal."
            : "Camera access is disabled. Enable it for Expo Go in iOS Settings.";
          setPhotoPermissionError(message);
          if (!cameraPermission.canAskAgain && Platform.OS !== "web") {
            Alert.alert("Camera access required", message, [
              { text: "Cancel", style: "cancel" },
              { text: "Open Settings", onPress: () => void Linking.openSettings() }
            ]);
          }
          return;
        }
      }

      setPhotoPermissionError(null);
      const result = useCamera
        ? await ImagePicker.launchCameraAsync({ base64: false, mediaTypes: ["images"], quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ base64: false, mediaTypes: ["images"], quality: 0.8 });

      if (!result.canceled) {
        const asset = result.assets[0];
        if (!asset) return;
        const resized = await resizeMealPhoto(asset);
        setPhotoUri(resized.uri);
        setImageBase64(resized.base64);
        setPhotoMimeType("image/jpeg");
        setPhotoSource(useCamera ? "camera" : "library");
        setRetainedPhoto(null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not open the camera or photo library.";
      setPhotoPermissionError(message);
    }
  }

  async function openBarcodeScanner() {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) return;
    }
    setShowScanner(true);
  }

  function handleBarcodeScanned(result: BarcodeScanningResult) {
    setShowScanner(false);
    setBarcode(result.data);
    barcodeMutation.mutate(result.data);
  }

  return (
    <KeyboardAwareScrollView contentContainerStyle={styles.content}>
      <View style={styles.modeRow}>
        <ModeButton active={mode === "photo"} icon={<Camera size={18} color={mode === "photo" ? "#FFFFFF" : colors.accentDark} />} label="Photo" onPress={() => setMode("photo")} />
        <ModeButton active={mode === "barcode"} icon={<Barcode size={18} color={mode === "barcode" ? "#FFFFFF" : colors.accentDark} />} label="Barcode" onPress={() => setMode("barcode")} />
        <ModeButton active={mode === "text"} icon={<Sparkles size={18} color={mode === "text" ? "#FFFFFF" : colors.accentDark} />} label="Type" onPress={() => setMode("text")} />
        <ModeButton active={mode === "search"} icon={<Search size={18} color={mode === "search" ? "#FFFFFF" : colors.accentDark} />} label="Search" onPress={() => setMode("search")} />
      </View>

      {mode === "text" ? (
        <Panel>
          <FormTextInput
            multiline
            onChangeText={setText}
            placeholder="Meal description"
            style={[styles.input, styles.multiline]}
            value={text}
          />
          <PrimaryButton
            disabled={!text.trim() || currentLoading}
            icon={<Sparkles color="#FFFFFF" size={18} />}
            label="Estimate meal"
            loading={textEstimateMutation.isPending}
            onPress={() => textEstimateMutation.mutate()}
          />
          {(memoryQuery.data?.matches ?? []).length > 0 ? (
            <View style={styles.memoryPanel}>
              <Text style={styles.subTitle}>Personal memory</Text>
              {(memoryQuery.data?.matches ?? []).map((match) => (
                <View key={`${match.type}_${match.id}`} style={styles.memoryRow}>
                  <View style={styles.foodMain}>
                    <Text style={styles.foodName}>{match.name}</Text>
                    <Text style={styles.muted}>
                      {match.type === "recipe" ? "Recipe" : "Saved meal"} · {Math.round(match.totals.calories)} cal · P{" "}
                      {Math.round(match.totals.proteinG)}g
                    </Text>
                  </View>
                  <Pressable
                    accessibilityLabel={`Log ${match.name} from memory`}
                    onPress={() => logMemoryMutation.mutate(match)}
                    style={styles.smallLogButton}
                  >
                    <Check color="#FFFFFF" size={16} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
        </Panel>
      ) : null}

      {mode === "photo" ? (
        <Panel>
          <View style={styles.photoActions}>
            <SecondaryButton icon={<Camera color={colors.accentDark} size={18} />} label="Camera" onPress={() => pickMealPhoto(true)} />
            <SecondaryButton icon={<Utensils color={colors.accentDark} size={18} />} label="Library" onPress={() => pickMealPhoto(false)} />
          </View>
          {photoPermissionError ? <Text style={styles.permissionError}>{photoPermissionError}</Text> : null}
          {photoUri ? <Image source={{ uri: photoUri }} style={styles.photoPreview} /> : null}
          {PHOTO_RETENTION_ENABLED ? (
            <Pressable
              accessibilityLabel="Retain meal photo"
              accessibilityRole="switch"
              accessibilityState={{ checked: retainPhoto }}
              onPress={() => setRetainPhoto((value) => !value)}
              style={styles.toggleRow}
            >
              <View style={[styles.toggleBox, retainPhoto && styles.toggleBoxActive]}>
                {retainPhoto ? <Check color="#FFFFFF" size={14} /> : null}
              </View>
              <Text style={styles.toggleLabel}>Retain photo</Text>
              <Text style={styles.toggleState}>{retainPhoto ? "On" : "Off"}</Text>
            </Pressable>
          ) : null}
          <FormTextInput
            multiline
            onChangeText={setPhotoContext}
            placeholder="Optional context helps accuracy"
            style={[styles.input, styles.multiline]}
            value={photoContext}
          />
          <PrimaryButton
            disabled={!hasMealPhoto || currentLoading}
            icon={<Sparkles color="#FFFFFF" size={18} />}
            label="Analyze meal"
            loading={photoEstimateMutation.isPending}
            onPress={() => photoEstimateMutation.mutate()}
          />
          {retainedPhoto ? (
            <Text style={styles.successText}>Photo retained · {formatPhotoSize(retainedPhoto.byteLength)}</Text>
          ) : null}
        </Panel>
      ) : null}

      {mode === "barcode" ? (
        <Panel>
          {showScanner ? (
            <CameraView
              barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"] }}
              onBarcodeScanned={handleBarcodeScanned}
              style={styles.camera}
            />
          ) : (
            <SecondaryButton icon={<Camera color={colors.accentDark} size={18} />} label="Open scanner" onPress={openBarcodeScanner} />
          )}
          <FormTextInput
            autoCapitalize="none"
            keyboardType="number-pad"
            onChangeText={(value) => {
              setBarcode(value);
              setBarcodeResult(null);
              setShowBarcodeForm(false);
            }}
            placeholder="Barcode"
            style={styles.input}
            value={barcode}
          />
          <PrimaryButton
            disabled={!barcode.trim() || currentLoading}
            icon={<Barcode color="#FFFFFF" size={18} />}
            label="Lookup barcode"
            loading={barcodeMutation.isPending}
            onPress={() => barcodeMutation.mutate(barcode)}
          />
          {barcode.trim().length >= 4 && !barcodeResult ? (
            <SecondaryButton
              icon={<Plus color={colors.accentDark} size={18} />}
              label={showBarcodeForm ? "Hide product form" : "Create product manually"}
              onPress={() => setShowBarcodeForm((value) => !value)}
            />
          ) : null}
          {showBarcodeForm && !barcodeResult ? (
            <BarcodeProductForm
              brand={barcodeBrand}
              calories={barcodeCalories}
              canSave={canSaveBarcodeProduct && !currentLoading}
              carbs={barcodeCarbs}
              fat={barcodeFat}
              fiber={barcodeFiber}
              mode="create"
              name={barcodeName}
              protein={barcodeProtein}
              servingGrams={barcodeServingGrams}
              servingName={barcodeServingName}
              sodium={barcodeSodium}
              sugar={barcodeSugar}
              onChangeBrand={setBarcodeBrand}
              onChangeCalories={setBarcodeCalories}
              onChangeCarbs={setBarcodeCarbs}
              onChangeFat={setBarcodeFat}
              onChangeFiber={setBarcodeFiber}
              onChangeName={setBarcodeName}
              onChangeProtein={setBarcodeProtein}
              onChangeServingGrams={setBarcodeServingGrams}
              onChangeServingName={setBarcodeServingName}
              onChangeSodium={setBarcodeSodium}
              onChangeSugar={setBarcodeSugar}
              onSave={() => createBarcodeProductMutation.mutate()}
            />
          ) : null}
        </Panel>
      ) : null}

      {mode === "search" ? (
        <Panel>
          <FormTextInput onChangeText={setSearch} placeholder="Search foods" style={styles.input} value={search} />
          {search.trim().length > 0 ? (
            <FoodResultSection
              favoriteIds={favoriteIds}
              foods={searchQuery.data?.foods ?? []}
              loading={logFoodMutation.isPending || toggleFavoriteMutation.isPending}
              title="Search results"
              onLog={(input) => logFoodMutation.mutate(input)}
              onToggleFavorite={(foodId) => toggleFavoriteMutation.mutate(foodId)}
            />
          ) : (
            <>
              <FoodResultSection
                emptyText="Recent foods will appear after you log manual or barcode foods."
                favoriteIds={favoriteIds}
                foods={recentQuery.data?.foods ?? []}
                loading={logFoodMutation.isPending || toggleFavoriteMutation.isPending}
                title="Recent"
                onLog={(input) => logFoodMutation.mutate(input)}
                onToggleFavorite={(foodId) => toggleFavoriteMutation.mutate(foodId)}
              />
              <FoodResultSection
                emptyText="Tap the star on a food to keep it here."
                favoriteIds={favoriteIds}
                foods={favoritesQuery.data?.foods ?? []}
                loading={logFoodMutation.isPending || toggleFavoriteMutation.isPending}
                title="Favorites"
                onLog={(input) => logFoodMutation.mutate(input)}
                onToggleFavorite={(foodId) => toggleFavoriteMutation.mutate(foodId)}
              />
            </>
          )}
          <SecondaryButton
            icon={<Plus color={colors.accentDark} size={18} />}
            label={showCustomFood ? "Hide custom food" : "Create custom food"}
            onPress={() => setShowCustomFood((value) => !value)}
          />
          {showCustomFood ? (
            <CustomFoodForm
              brand={customBrand}
              calories={customCalories}
              canCreate={canCreateCustomFood && !createCustomFoodMutation.isPending}
              carbs={customCarbs}
              fat={customFat}
              fiber={customFiber}
              name={customName}
              protein={customProtein}
              servingGrams={customServingGrams}
              servingName={customServingName}
              sodium={customSodium}
              sugar={customSugar}
              onChangeBrand={setCustomBrand}
              onChangeCalories={setCustomCalories}
              onChangeCarbs={setCustomCarbs}
              onChangeFat={setCustomFat}
              onChangeFiber={setCustomFiber}
              onChangeName={setCustomName}
              onChangeProtein={setCustomProtein}
              onChangeServingGrams={setCustomServingGrams}
              onChangeServingName={setCustomServingName}
              onChangeSodium={setCustomSodium}
              onChangeSugar={setCustomSugar}
              onCreate={() => createCustomFoodMutation.mutate()}
            />
          ) : null}
        </Panel>
      ) : null}

      {barcodeResult ? (
        <Panel>
          {barcodeResult.found && barcodeResult.food ? (
            <>
              <Text style={styles.panelTitle}>{barcodeResult.food.name}</Text>
              {barcodeResult.food.brand ? <Text style={styles.muted}>{barcodeResult.food.brand}</Text> : null}
              <View style={styles.unitGrid}>
                {barcodeResult.servingUnits.map((unit) => (
                  <Pressable
                    key={unit.id}
                    onPress={() => setSelectedUnitId(unit.id)}
                    style={[styles.unitChip, selectedUnitId === unit.id && styles.unitChipActive]}
                  >
                    <Text style={[styles.unitText, selectedUnitId === unit.id && styles.unitTextActive]}>
                      {unit.unitName}
                    </Text>
                    <Text style={[styles.unitSubText, selectedUnitId === unit.id && styles.unitTextActive]}>
                      {Math.round(unit.gramsPerUnit)}g · {unit.confidence}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.logRow}>
                <FormTextInput
                  accessibilityLabel="Barcode food quantity"
                  keyboardType="decimal-pad"
                  onChangeText={setBarcodeQuantity}
                  style={[styles.input, styles.quantityInput]}
                  value={barcodeQuantity}
                />
                <Pressable
                  accessibilityLabel="Log barcode food"
                  disabled={!canLogBarcodeFood}
                  onPress={() =>
                    barcodeResult.food &&
                    logFoodMutation.mutate({
                      food: barcodeResult.food,
                      quantity: parsedBarcodeQuantity,
                      unitId: selectedUnitId
                    })
                  }
                  style={[styles.logButtonWide, !canLogBarcodeFood && styles.buttonDisabled]}
                >
                  {logFoodMutation.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Check color="#FFFFFF" size={16} />}
                  <Text style={styles.logButtonText}>Log</Text>
                </Pressable>
              </View>
              <SecondaryButton
                icon={<Pencil color={colors.accentDark} size={18} />}
                label={showBarcodeForm ? "Hide correction" : "Correct product"}
                onPress={() => setShowBarcodeForm((value) => !value)}
              />
              {showBarcodeForm ? (
                <BarcodeProductForm
                  brand={barcodeBrand}
                  calories={barcodeCalories}
                  canSave={canSaveBarcodeProduct && !currentLoading}
                  carbs={barcodeCarbs}
                  fat={barcodeFat}
                  fiber={barcodeFiber}
                  mode="update"
                  name={barcodeName}
                  protein={barcodeProtein}
                  servingGrams={barcodeServingGrams}
                  servingName={barcodeServingName}
                  sodium={barcodeSodium}
                  sugar={barcodeSugar}
                  onChangeBrand={setBarcodeBrand}
                  onChangeCalories={setBarcodeCalories}
                  onChangeCarbs={setBarcodeCarbs}
                  onChangeFat={setBarcodeFat}
                  onChangeFiber={setBarcodeFiber}
                  onChangeName={setBarcodeName}
                  onChangeProtein={setBarcodeProtein}
                  onChangeServingGrams={setBarcodeServingGrams}
                  onChangeServingName={setBarcodeServingName}
                  onChangeSodium={setBarcodeSodium}
                  onChangeSugar={setBarcodeSugar}
                  onSave={() => updateBarcodeProductMutation.mutate()}
                />
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.muted}>{barcodeResult.message ?? "Product not found."}</Text>
              <BarcodeProductForm
                brand={barcodeBrand}
                calories={barcodeCalories}
                canSave={canSaveBarcodeProduct && !currentLoading}
                carbs={barcodeCarbs}
                fat={barcodeFat}
                fiber={barcodeFiber}
                mode="create"
                name={barcodeName}
                protein={barcodeProtein}
                servingGrams={barcodeServingGrams}
                servingName={barcodeServingName}
                sodium={barcodeSodium}
                sugar={barcodeSugar}
                onChangeBrand={setBarcodeBrand}
                onChangeCalories={setBarcodeCalories}
                onChangeCarbs={setBarcodeCarbs}
                onChangeFat={setBarcodeFat}
                onChangeFiber={setBarcodeFiber}
                onChangeName={setBarcodeName}
                onChangeProtein={setBarcodeProtein}
                onChangeServingGrams={setBarcodeServingGrams}
                onChangeServingName={setBarcodeServingName}
                onChangeSodium={setBarcodeSodium}
                onChangeSugar={setBarcodeSugar}
                onSave={() => createBarcodeProductMutation.mutate()}
              />
            </>
          )}
        </Panel>
      ) : null}

      {estimate ? (
        <EstimateReview
          correction={correction}
          estimate={estimate}
          loading={currentLoading}
          onChangeCorrection={setCorrection}
          onChangeEstimate={setEstimate}
          onCorrect={() => {
            if (correction.trim()) correctionMutation.mutate();
          }}
          onLog={() => logEstimateMutation.mutate()}
        />
      ) : null}
    </KeyboardAwareScrollView>
  );
}

function ModeButton({ active, icon, label, onPress }: { active: boolean; icon: ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.modeButton, active && styles.modeButtonActive]}>
      {icon}
      <Text style={[styles.modeText, active && styles.modeTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return <View style={styles.panel}>{children}</View>;
}

async function resizeMealPhoto(asset: ImagePicker.ImagePickerAsset): Promise<{ base64: string; uri: string }> {
  const actions = asset.width > MEAL_PHOTO_MAX_WIDTH ? [{ resize: { width: MEAL_PHOTO_MAX_WIDTH } }] : [];
  const result = await ImageManipulator.manipulateAsync(asset.uri, actions, {
    base64: true,
    compress: MEAL_PHOTO_JPEG_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG
  });

  if (!result.base64) {
    throw new Error("Could not prepare the meal photo for upload.");
  }

  return {
    base64: result.base64,
    uri: result.uri
  };
}

function formatPhotoSize(byteLength?: number | null): string {
  if (!byteLength) return "stored";
  if (byteLength < 1024) return `${byteLength} B`;
  if (byteLength < 1024 * 1024) return `${Math.round(byteLength / 1024)} KB`;
  return `${(byteLength / (1024 * 1024)).toFixed(1)} MB`;
}

function PrimaryButton({
  disabled,
  icon,
  label,
  loading,
  onPress
}: {
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  loading?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={[styles.primaryButton, disabled && styles.buttonDisabled]}>
      {loading ? <ActivityIndicator color="#FFFFFF" /> : icon}
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({
  disabled,
  icon,
  label,
  loading,
  onPress
}: {
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  loading?: boolean;
  onPress: () => void;
}) {
  const inactive = Boolean(disabled || loading);

  return (
    <Pressable disabled={inactive} onPress={onPress} style={[styles.secondaryButton, inactive && styles.buttonDisabled]}>
      {loading ? <ActivityIndicator color={colors.accentDark} /> : icon}
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function FoodResultSection({
  emptyText = "No foods found.",
  favoriteIds,
  foods,
  loading,
  onLog,
  onToggleFavorite,
  title
}: {
  emptyText?: string;
  favoriteIds: Set<string>;
  foods: FoodItem[];
  loading: boolean;
  onLog: (input: { food: FoodItem; quantity?: number; unitId?: string }) => void;
  onToggleFavorite: (foodId: string) => void;
  title: string;
}) {
  return (
    <View style={styles.foodSection}>
      <Text style={styles.subTitle}>{title}</Text>
      {foods.length === 0 ? (
        <Text style={styles.muted}>{emptyText}</Text>
      ) : (
        <View style={styles.resultList}>
          {foods.map((food) => (
            <FoodResultRow
              key={food.id}
              favorited={favoriteIds.has(food.id)}
              food={food}
              loading={loading}
              onLog={onLog}
              onToggleFavorite={() => onToggleFavorite(food.id)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function FoodResultRow({
  favorited,
  food,
  loading,
  onLog,
  onToggleFavorite
}: {
  favorited: boolean;
  food: FoodItem;
  loading: boolean;
  onLog: (input: { food: FoodItem; quantity?: number; unitId?: string }) => void;
  onToggleFavorite: () => void;
}) {
  const [quantity, setQuantity] = useState("1");
  const initialUnit = food.servingUnits.find((unit) => unit.unitName !== "100 g") ?? food.servingUnits[0];
  const [unitId, setUnitId] = useState(initialUnit?.id);
  const parsedQuantity = Number(quantity);
  const selectedUnit = food.servingUnits.find((unit) => unit.id === unitId) ?? food.servingUnits[0];

  return (
    <View style={styles.foodRow}>
      <View style={styles.foodRowTop}>
        <View style={styles.foodMain}>
          <Text style={styles.foodName}>{food.name}</Text>
          <Text style={styles.muted}>
            {food.brand ? `${food.brand} · ` : ""}
            {Math.round(food.per100g.calories)} cal / 100g · P {Math.round(food.per100g.proteinG)}g
          </Text>
        </View>
        <Pressable
          accessibilityLabel={favorited ? `Unfavorite ${food.name}` : `Favorite ${food.name}`}
          onPress={onToggleFavorite}
          style={[styles.favoriteButton, favorited && styles.favoriteButtonActive]}
        >
          <Star color={favorited ? "#FFFFFF" : colors.accentDark} fill={favorited ? "#FFFFFF" : "transparent"} size={16} />
        </Pressable>
      </View>

      <View style={styles.unitGrid}>
        {food.servingUnits.slice(0, 4).map((unit) => (
          <Pressable
            key={unit.id}
            accessibilityLabel={`${food.name} unit ${unit.unitName}`}
            onPress={() => setUnitId(unit.id)}
            style={[styles.unitChip, unit.id === selectedUnit?.id && styles.unitChipActive]}
          >
            <Text style={[styles.unitText, unit.id === selectedUnit?.id && styles.unitTextActive]}>{unit.unitName}</Text>
            <Text style={[styles.unitSubText, unit.id === selectedUnit?.id && styles.unitTextActive]}>
              {Math.round(unit.gramsPerUnit)}g
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.logRow}>
        <FormTextInput
          accessibilityLabel={`${food.name} quantity`}
          keyboardType="decimal-pad"
          onChangeText={setQuantity}
          style={[styles.input, styles.quantityInput]}
          value={quantity}
        />
        <Pressable
          accessibilityLabel={`Log ${food.name}`}
          disabled={loading || !selectedUnit || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0}
          onPress={() => onLog({ food, quantity: parsedQuantity, unitId: selectedUnit?.id })}
          style={[styles.logButtonWide, (loading || !selectedUnit || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0) && styles.buttonDisabled]}
        >
          <Check color="#FFFFFF" size={16} />
          <Text style={styles.logButtonText}>Log</Text>
        </Pressable>
      </View>
    </View>
  );
}

function BarcodeProductForm({
  brand,
  calories,
  canSave,
  carbs,
  fat,
  fiber,
  mode,
  name,
  onChangeBrand,
  onChangeCalories,
  onChangeCarbs,
  onChangeFat,
  onChangeFiber,
  onChangeName,
  onChangeProtein,
  onChangeServingGrams,
  onChangeServingName,
  onChangeSodium,
  onChangeSugar,
  onSave,
  protein,
  servingGrams,
  servingName,
  sodium,
  sugar
}: {
  brand: string;
  calories: string;
  canSave: boolean;
  carbs: string;
  fat: string;
  fiber: string;
  mode: "create" | "update";
  name: string;
  onChangeBrand: (value: string) => void;
  onChangeCalories: (value: string) => void;
  onChangeCarbs: (value: string) => void;
  onChangeFat: (value: string) => void;
  onChangeFiber: (value: string) => void;
  onChangeName: (value: string) => void;
  onChangeProtein: (value: string) => void;
  onChangeServingGrams: (value: string) => void;
  onChangeServingName: (value: string) => void;
  onChangeSodium: (value: string) => void;
  onChangeSugar: (value: string) => void;
  onSave: () => void;
  protein: string;
  servingGrams: string;
  servingName: string;
  sodium: string;
  sugar: string;
}) {
  const title = mode === "create" ? "Barcode product" : "Product correction";
  const actionLabel = mode === "create" ? "Save product" : "Save correction";

  return (
    <View style={styles.customFoodBox}>
      <Text style={styles.subTitle}>{title}</Text>
      <FormTextInput accessibilityLabel={`${title} name`} onChangeText={onChangeName} placeholder="Product name" style={styles.input} value={name} />
      <FormTextInput accessibilityLabel={`${title} brand`} onChangeText={onChangeBrand} placeholder="Brand, optional" style={styles.input} value={brand} />
      <View style={styles.twoCol}>
        <FormTextInput
          accessibilityLabel={`${title} serving name`}
          onChangeText={onChangeServingName}
          placeholder="Serving name"
          style={styles.input}
          value={servingName}
        />
        <FormTextInput
          accessibilityLabel={`${title} serving grams`}
          keyboardType="decimal-pad"
          onChangeText={onChangeServingGrams}
          placeholder="Grams"
          style={styles.input}
          value={servingGrams}
        />
      </View>
      <View style={styles.twoCol}>
        <FormTextInput
          accessibilityLabel={`${title} calories`}
          keyboardType="decimal-pad"
          onChangeText={onChangeCalories}
          placeholder="Calories"
          style={styles.input}
          value={calories}
        />
        <FormTextInput
          accessibilityLabel={`${title} protein`}
          keyboardType="decimal-pad"
          onChangeText={onChangeProtein}
          placeholder="Protein"
          style={styles.input}
          value={protein}
        />
      </View>
      <View style={styles.twoCol}>
        <FormTextInput
          accessibilityLabel={`${title} carbs`}
          keyboardType="decimal-pad"
          onChangeText={onChangeCarbs}
          placeholder="Carbs"
          style={styles.input}
          value={carbs}
        />
        <FormTextInput
          accessibilityLabel={`${title} fat`}
          keyboardType="decimal-pad"
          onChangeText={onChangeFat}
          placeholder="Fat"
          style={styles.input}
          value={fat}
        />
      </View>
      <View style={styles.twoCol}>
        <FormTextInput
          accessibilityLabel={`${title} sugar`}
          keyboardType="decimal-pad"
          onChangeText={onChangeSugar}
          placeholder="Sugar"
          style={styles.input}
          value={sugar}
        />
        <FormTextInput
          accessibilityLabel={`${title} fiber`}
          keyboardType="decimal-pad"
          onChangeText={onChangeFiber}
          placeholder="Fiber"
          style={styles.input}
          value={fiber}
        />
      </View>
      <FormTextInput
        accessibilityLabel={`${title} sodium`}
        keyboardType="decimal-pad"
        onChangeText={onChangeSodium}
        placeholder="Sodium mg"
        style={styles.input}
        value={sodium}
      />
      <Pressable
        accessibilityLabel={actionLabel}
        disabled={!canSave}
        onPress={onSave}
        style={[styles.logButtonWide, !canSave && styles.buttonDisabled]}
      >
        <Check color="#FFFFFF" size={16} />
        <Text style={styles.logButtonText}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

function CustomFoodForm({
  brand,
  calories,
  canCreate,
  carbs,
  fat,
  fiber,
  name,
  onChangeBrand,
  onChangeCalories,
  onChangeCarbs,
  onChangeFat,
  onChangeFiber,
  onChangeName,
  onChangeProtein,
  onChangeServingGrams,
  onChangeServingName,
  onChangeSodium,
  onChangeSugar,
  onCreate,
  protein,
  servingGrams,
  servingName,
  sodium,
  sugar
}: {
  brand: string;
  calories: string;
  canCreate: boolean;
  carbs: string;
  fat: string;
  fiber: string;
  name: string;
  onChangeBrand: (value: string) => void;
  onChangeCalories: (value: string) => void;
  onChangeCarbs: (value: string) => void;
  onChangeFat: (value: string) => void;
  onChangeFiber: (value: string) => void;
  onChangeName: (value: string) => void;
  onChangeProtein: (value: string) => void;
  onChangeServingGrams: (value: string) => void;
  onChangeServingName: (value: string) => void;
  onChangeSodium: (value: string) => void;
  onChangeSugar: (value: string) => void;
  onCreate: () => void;
  protein: string;
  servingGrams: string;
  servingName: string;
  sodium: string;
  sugar: string;
}) {
  return (
    <View style={styles.customFoodBox}>
      <Text style={styles.subTitle}>Custom food</Text>
      <FormTextInput accessibilityLabel="Custom food name" onChangeText={onChangeName} placeholder="Food name" style={styles.input} value={name} />
      <FormTextInput accessibilityLabel="Custom food brand" onChangeText={onChangeBrand} placeholder="Brand, optional" style={styles.input} value={brand} />
      <View style={styles.twoCol}>
        <FormTextInput
          accessibilityLabel="Custom serving name"
          onChangeText={onChangeServingName}
          placeholder="Serving name"
          style={styles.input}
          value={servingName}
        />
        <FormTextInput
          accessibilityLabel="Custom serving grams"
          keyboardType="decimal-pad"
          onChangeText={onChangeServingGrams}
          placeholder="Grams"
          style={styles.input}
          value={servingGrams}
        />
      </View>
      <View style={styles.twoCol}>
        <FormTextInput
          accessibilityLabel="Custom calories"
          keyboardType="decimal-pad"
          onChangeText={onChangeCalories}
          placeholder="Calories"
          style={styles.input}
          value={calories}
        />
        <FormTextInput
          accessibilityLabel="Custom protein"
          keyboardType="decimal-pad"
          onChangeText={onChangeProtein}
          placeholder="Protein"
          style={styles.input}
          value={protein}
        />
      </View>
      <View style={styles.twoCol}>
        <FormTextInput
          accessibilityLabel="Custom carbs"
          keyboardType="decimal-pad"
          onChangeText={onChangeCarbs}
          placeholder="Carbs"
          style={styles.input}
          value={carbs}
        />
        <FormTextInput
          accessibilityLabel="Custom fat"
          keyboardType="decimal-pad"
          onChangeText={onChangeFat}
          placeholder="Fat"
          style={styles.input}
          value={fat}
        />
      </View>
      <View style={styles.twoCol}>
        <FormTextInput
          accessibilityLabel="Custom sugar"
          keyboardType="decimal-pad"
          onChangeText={onChangeSugar}
          placeholder="Sugar"
          style={styles.input}
          value={sugar}
        />
        <FormTextInput
          accessibilityLabel="Custom fiber"
          keyboardType="decimal-pad"
          onChangeText={onChangeFiber}
          placeholder="Fiber"
          style={styles.input}
          value={fiber}
        />
      </View>
      <FormTextInput
        accessibilityLabel="Custom sodium"
        keyboardType="decimal-pad"
        onChangeText={onChangeSodium}
        placeholder="Sodium mg"
        style={styles.input}
        value={sodium}
      />
      <Pressable
        accessibilityLabel="Create custom food"
        disabled={!canCreate}
        onPress={onCreate}
        style={[styles.logButtonWide, !canCreate && styles.buttonDisabled]}
      >
        <Plus color="#FFFFFF" size={16} />
        <Text style={styles.logButtonText}>Create food</Text>
      </Pressable>
    </View>
  );
}

function EstimateReview({
  correction,
  estimate,
  loading,
  onChangeCorrection,
  onChangeEstimate,
  onCorrect,
  onLog
}: {
  correction: string;
  estimate: MealEstimate;
  loading: boolean;
  onChangeCorrection: (value: string) => void;
  onChangeEstimate: (estimate: MealEstimate) => void;
  onCorrect: () => void;
  onLog: () => void;
}) {
  function positiveNumber(value: string, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  function zeroableNumber(value: string, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }

  function updateCalories(value: string) {
    const calories = zeroableNumber(value, estimate.macros.calories);
    onChangeEstimate({
      ...estimate,
      calorieRange: {
        min: Math.max(0, Math.round(calories * 0.9)),
        max: Math.round(calories * 1.1)
      },
      macros: {
        ...estimate.macros,
        calories
      }
    });
  }

  function updateMacro(key: "proteinG" | "carbsG" | "fatG" | "sugarG" | "fiberG" | "sodiumMg", value: string) {
    onChangeEstimate({
      ...estimate,
      macros: {
        ...estimate.macros,
        [key]: zeroableNumber(value, estimate.macros[key] ?? 0)
      }
    });
  }

  function updatePortion(key: "quantity" | "estimatedWeightG", value: string) {
    onChangeEstimate({
      ...estimate,
      portion: {
        ...estimate.portion,
        [key]: positiveNumber(value, estimate.portion[key])
      }
    });
  }

  return (
    <Panel>
      <View style={styles.estimateHeader}>
        <View style={styles.estimateTitleBlock}>
          <Text style={styles.panelTitle}>{estimate.dishName}</Text>
          <Text style={styles.muted}>
            {estimate.portion.quantity} {estimate.portion.unit} · {Math.round(estimate.portion.estimatedWeightG)}g
          </Text>
        </View>
        <ConfidenceBadge confidence={estimate.confidence} />
      </View>

      <View style={styles.macroGrid}>
        <MacroTile label="Calories" value={Math.round(estimate.macros.calories).toString()} />
        <MacroTile label="Protein" value={`${Math.round(estimate.macros.proteinG)}g`} />
        <MacroTile label="Carbs" value={`${Math.round(estimate.macros.carbsG)}g`} />
        <MacroTile label="Fat" value={`${Math.round(estimate.macros.fatG)}g`} />
        <MacroTile label="Sugar" value={`${Math.round(estimate.macros.sugarG ?? 0)}g`} />
      </View>

      <View style={styles.editPanel}>
        <Text style={styles.subTitle}>Edit before logging</Text>
        <EditField
          accessibilityLabel="Estimate food name"
          label="Name"
          onChangeText={(value) => onChangeEstimate({ ...estimate, dishName: value })}
          value={estimate.dishName}
        />
        <View style={styles.twoCol}>
          <EditField
            accessibilityLabel="Estimate quantity"
            keyboardType="decimal-pad"
            label="Qty"
            onChangeText={(value) => updatePortion("quantity", value)}
            value={String(estimate.portion.quantity)}
          />
          <EditField
            accessibilityLabel="Estimate unit"
            label="Unit"
            onChangeText={(value) =>
              onChangeEstimate({
                ...estimate,
                portion: {
                  ...estimate.portion,
                  unit: value
                }
              })
            }
            value={estimate.portion.unit}
          />
        </View>
        <View style={styles.twoCol}>
          <EditField
            accessibilityLabel="Estimate grams"
            keyboardType="decimal-pad"
            label="Grams"
            onChangeText={(value) => updatePortion("estimatedWeightG", value)}
            value={String(Math.round(estimate.portion.estimatedWeightG))}
          />
          <EditField
            accessibilityLabel="Estimate calories"
            keyboardType="decimal-pad"
            label="Calories"
            onChangeText={updateCalories}
            value={String(Math.round(estimate.macros.calories))}
          />
        </View>
        <View style={styles.threeCol}>
          <EditField
            accessibilityLabel="Estimate protein"
            keyboardType="decimal-pad"
            label="P"
            onChangeText={(value) => updateMacro("proteinG", value)}
            value={String(Math.round(estimate.macros.proteinG))}
          />
          <EditField
            accessibilityLabel="Estimate carbs"
            keyboardType="decimal-pad"
            label="C"
            onChangeText={(value) => updateMacro("carbsG", value)}
            value={String(Math.round(estimate.macros.carbsG))}
          />
          <EditField
            accessibilityLabel="Estimate fat"
            keyboardType="decimal-pad"
            label="F"
            onChangeText={(value) => updateMacro("fatG", value)}
            value={String(Math.round(estimate.macros.fatG))}
          />
        </View>
        <View style={styles.threeCol}>
          <EditField
            accessibilityLabel="Estimate sugar"
            keyboardType="decimal-pad"
            label="Sugar"
            onChangeText={(value) => updateMacro("sugarG", value)}
            value={String(Math.round(estimate.macros.sugarG ?? 0))}
          />
          <EditField
            accessibilityLabel="Estimate fiber"
            keyboardType="decimal-pad"
            label="Fiber"
            onChangeText={(value) => updateMacro("fiberG", value)}
            value={String(Math.round(estimate.macros.fiberG))}
          />
          <EditField
            accessibilityLabel="Estimate sodium"
            keyboardType="decimal-pad"
            label="Sodium mg"
            onChangeText={(value) => updateMacro("sodiumMg", value)}
            value={String(Math.round(estimate.macros.sodiumMg))}
          />
        </View>
      </View>

      <View style={styles.assumptionList}>
        {estimate.assumptions.map((assumption) => (
          <Text key={assumption} style={styles.assumption}>
            {assumption}
          </Text>
        ))}
      </View>

      <View style={styles.quickEditRow}>
        {estimate.quickEdits.slice(0, 5).map((quickEdit) => (
          <Pressable key={quickEdit} onPress={() => onChangeCorrection(quickEdit)} style={styles.quickEdit}>
            <Text style={styles.quickEditText}>{quickEdit}</Text>
          </Pressable>
        ))}
      </View>

      <FormTextInput
        onChangeText={onChangeCorrection}
        placeholder="Correction, e.g. half portion or extra sauce"
        style={styles.input}
        value={correction}
      />
      <View style={styles.photoActions}>
        <SecondaryButton
          disabled={!correction.trim() || loading}
          icon={<Sparkles color={colors.accentDark} size={18} />}
          label="Apply correction"
          loading={loading}
          onPress={onCorrect}
        />
        <PrimaryButton disabled={loading} icon={<Check color="#FFFFFF" size={18} />} label="Log meal" loading={loading} onPress={onLog} />
      </View>
    </Panel>
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
      <FormTextInput
        accessibilityLabel={accessibilityLabel}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        style={styles.compactInput}
        value={value}
      />
    </View>
  );
}

function MacroTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.macroTile}>
      <Text style={styles.macroValue}>{value}</Text>
      <Text style={styles.macroLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    backgroundColor: colors.background,
    gap: 14,
    padding: 16,
    paddingBottom: 42
  },
  modeRow: {
    flexDirection: "row",
    gap: 8
  },
  modeButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 6,
    minHeight: 62,
    justifyContent: "center",
    paddingHorizontal: 6,
    paddingVertical: 9
  },
  modeButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  modeText: {
    color: colors.accentDark,
    fontSize: 12,
    fontWeight: "800"
  },
  modeTextActive: {
    color: "#FFFFFF"
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 14
  },
  panelTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900"
  },
  muted: {
    color: colors.muted,
    fontSize: 13
  },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  multiline: {
    minHeight: 96,
    textAlignVertical: "top"
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900"
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 11
  },
  secondaryButtonText: {
    color: colors.accentDark,
    fontSize: 14,
    fontWeight: "900"
  },
  buttonDisabled: {
    opacity: 0.6
  },
  photoActions: {
    flexDirection: "row",
    gap: 10
  },
  twoCol: {
    flexDirection: "row",
    gap: 8
  },
  threeCol: {
    flexDirection: "row",
    gap: 8
  },
  photoPreview: {
    aspectRatio: 4 / 3,
    borderRadius: 8,
    width: "100%"
  },
  toggleRow: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  toggleBox: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    height: 24,
    justifyContent: "center",
    width: 24
  },
  toggleBoxActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  toggleLabel: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: "900"
  },
  toggleState: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800"
  },
  successText: {
    color: colors.success,
    fontSize: 13,
    fontWeight: "800"
  },
  permissionError: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18
  },
  camera: {
    aspectRatio: 4 / 3,
    borderRadius: 8,
    overflow: "hidden",
    width: "100%"
  },
  resultList: {
    gap: 8
  },
  foodSection: {
    gap: 8
  },
  foodRow: {
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12
  },
  foodRowTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  memoryPanel: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 10
  },
  subTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900"
  },
  memoryRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    padding: 10
  },
  foodMain: {
    flex: 1,
    gap: 3,
    minWidth: 0
  },
  foodName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800"
  },
  smallLogButton: {
    alignItems: "center",
    backgroundColor: colors.success,
    borderRadius: 8,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  favoriteButton: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: 8,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  favoriteButtonActive: {
    backgroundColor: colors.accent
  },
  logRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  quantityInput: {
    flex: 1,
    minHeight: 42,
    paddingVertical: 9
  },
  logButtonWide: {
    alignItems: "center",
    backgroundColor: colors.success,
    borderRadius: 8,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  logButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900"
  },
  customFoodBox: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 9,
    padding: 10
  },
  estimateHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10
  },
  estimateTitleBlock: {
    flex: 1,
    minWidth: 0
  },
  editPanel: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 9,
    padding: 10
  },
  field: {
    flex: 1,
    gap: 4
  },
  fieldLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  compactInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    fontSize: 14,
    minHeight: 40,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  macroGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  macroTile: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: "48%",
    flexGrow: 1,
    padding: 12
  },
  macroValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900"
  },
  macroLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2
  },
  assumptionList: {
    gap: 6
  },
  assumption: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18
  },
  quickEditRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  quickEdit: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  quickEditText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "800"
  },
  unitGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  unitChip: {
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: "48%",
    flexGrow: 1,
    padding: 10
  },
  unitChipActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent
  },
  unitText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900"
  },
  unitSubText: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 3
  },
  unitTextActive: {
    color: colors.accentDark
  }
});
