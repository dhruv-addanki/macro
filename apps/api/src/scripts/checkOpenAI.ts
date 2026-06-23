import OpenAI from "openai";
import { env } from "../lib/env";
import { estimatePhotoMeal } from "../modules/ai/service";

const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAeUlEQVR4nO3PwQkAIBDAsBvMsV3Nv0P4CEKhA6Rz9vq64YIGtKABLWhACxrQgga0oAEtaEALGtCCBrSgAS1oQAsa0IIGtKABLWhACxrQgga0oAEtaEALGtCCBrSgAS1oQAsa0IIGtKABLWhACxrQgga0oAEtaEALHrucwFHDBqK/oAAAAABJRU5ErkJggg==";

type CheckResult = {
  name: string;
  model: string;
  ok: boolean;
  outputText: string;
};

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function outputText(response: { output_text?: unknown }): string {
  return typeof response.output_text === "string" ? response.output_text.trim() : "";
}

async function runTextCheck(client: OpenAI, name: string, model: string): Promise<CheckResult> {
  const response = await (client.responses.create as any)({
    model,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Reply with exactly: macro-openai-check"
          }
        ]
      }
    ],
    max_output_tokens: 32
  });

  const text = outputText(response);
  if (!text.toLowerCase().includes("macro-openai-check")) {
    throw new Error(`${name} returned unexpected text: ${text || "empty output"}`);
  }
  return { name, model, ok: true, outputText: text };
}

async function runPhotoCheck(client: OpenAI, model: string): Promise<CheckResult> {
  const response = await (client.responses.create as any)({
    model,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "This is a tiny generated image for a connectivity check. Reply with exactly: macro-photo-check"
          },
          {
            type: "input_image",
            image_url: `data:image/png;base64,${ONE_PIXEL_PNG_BASE64}`
          }
        ]
      }
    ],
    max_output_tokens: 32
  });

  const text = outputText(response);
  if (!text.toLowerCase().includes("macro-photo-check")) {
    throw new Error(`photo returned unexpected text: ${text || "empty output"}`);
  }
  return { name: "photo", model, ok: true, outputText: text };
}

async function runPhotoEstimateCheck(model: string): Promise<CheckResult> {
  const response = await estimatePhotoMeal("openai_check_user", {
    context: "chicken nuggets with spicy mayo",
    imageBase64: ONE_PIXEL_PNG_BASE64,
    mimeType: "image/png",
    retainPhoto: false
  });

  if (response.usedFallback) {
    throw new Error(`meal-photo-estimate used fallback: ${response.estimate.assumptions[0] ?? "unknown reason"}`);
  }

  return {
    name: "meal-photo-estimate",
    model,
    ok: true,
    outputText: response.estimate.dishName
  };
}

if (!env.openaiApiKey) {
  fail("OPENAI_API_KEY is required for npm run check:openai.");
}

const requiredModels = [
  ["MACRO_AI_TEXT_MODEL", env.aiTextModel],
  ["MACRO_AI_CORRECTION_MODEL", env.aiCorrectionModel],
  ["MACRO_AI_BARCODE_UNIT_MODEL", env.aiBarcodeUnitModel],
  ["MACRO_AI_PHOTO_MODEL", env.aiPhotoModel]
].filter(([, value]) => !value);

if (requiredModels.length > 0) {
  fail(`Missing OpenAI model config: ${requiredModels.map(([name]) => name).join(", ")}`);
}

const client = new OpenAI({ apiKey: env.openaiApiKey });

try {
  const [text, correction, barcodeUnits, photo, photoEstimate] = await Promise.all([
    runTextCheck(client, "text", env.aiTextModel),
    runTextCheck(client, "correction", env.aiCorrectionModel),
    runTextCheck(client, "barcode-units", env.aiBarcodeUnitModel),
    runPhotoCheck(client, env.aiPhotoModel),
    runPhotoEstimateCheck(env.aiPhotoModel)
  ]);

  console.log(JSON.stringify({ ok: true, checks: [text, correction, barcodeUnits, photo, photoEstimate] }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
