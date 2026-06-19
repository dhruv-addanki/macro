export const MEAL_PHOTO_ESTIMATE_PROMPT_VERSION = "meal-photo-estimate.v1";

export function buildMealPhotoEstimatePrompt(input: string, correctionMemory: string[]): string {
  return [
    "Estimate a loggable nutrition entry for this meal from the photo and user context.",
    "Return schema-valid JSON only.",
    "Use conservative uncertainty and include assumptions.",
    "Use visible food, portion cues, cuisine context, and user-provided notes together.",
    "Do not provide medical advice.",
    ...correctionMemory.map((line) => `Relevant user correction memory: ${line}`),
    `User context: ${input || "No extra context provided."}`
  ].join("\n");
}
