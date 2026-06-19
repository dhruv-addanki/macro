export const CORRECTION_PROMPT_VERSION = "correction.v1";

export const CORRECTION_PROMPT_POLICY = [
  "Apply the user's correction to the structured meal estimate.",
  "Preserve unchanged macros and ingredients when the correction is unrelated.",
  "Keep the result editable and transparent with assumptions."
].join("\n");
