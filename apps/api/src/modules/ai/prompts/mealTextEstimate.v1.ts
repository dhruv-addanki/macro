export const MEAL_TEXT_ESTIMATE_PROMPT_VERSION = "meal-text-estimate.v1";

export function buildMealTextEstimatePrompt(input: string, correctionMemory: string[]): string {
  return [
    "Estimate a loggable nutrition entry for this meal.",
    "Return schema-valid JSON only.",
    "Use conservative uncertainty and include assumptions.",
    "Use the user's text as first-class context, especially cuisine, ingredients, and portions.",
    "Do not provide medical advice.",
    ...correctionMemory.map((line) => `Relevant user correction memory: ${line}`),
    `User context: ${input || "No extra context provided."}`
  ].join("\n");
}
