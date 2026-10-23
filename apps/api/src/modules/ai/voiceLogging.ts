import OpenAI from "openai";
import { validateVoiceResult, voiceOutputJSONSchema, type VoiceInterpretRequest, type VoiceInterpretResult } from "@macro/shared";
import type { VoiceEnv } from "../../lib/voiceEnv";
import { voiceLoggingPrompt } from "./prompts/voiceLogging.v1";

export interface VoiceAI {
  interpret(input: VoiceInterpretRequest): Promise<VoiceInterpretResult>;
  transcribe(data: Buffer, filename: string, mime: string): Promise<string>;
}

export function createVoiceAI(env: VoiceEnv): VoiceAI {
  const client = env.key ? new OpenAI({ apiKey: env.key, timeout: 120000, maxRetries: 1 }) : null;
  const configured = () => {
    if (!client) throw Object.assign(new Error("Add OPENAI_API_KEY to apps/api/.env.voice and restart the proxy."), { statusCode: 503, code: "openai_not_configured" });
    return client;
  };
  return {
    async interpret(input) {
      const response = await configured().responses.create({
        model: env.model, reasoning: { effort: env.effort }, max_output_tokens: 12000,
        store: false,
        input: [
          { role: "system", content: voiceLoggingPrompt },
          { role: "user", content: JSON.stringify(input) }
        ],
        text: { format: { type: "json_schema", name: "meal_diary_proposal", strict: true, schema: voiceOutputJSONSchema } }
      });
      if (!response.output_text) throw Object.assign(new Error("The model did not return a complete food estimate. Try again or enter it manually."), { statusCode: 502 });
      return validateVoiceResult(JSON.parse(response.output_text), input);
    },
    async transcribe(data, filename, mime) {
      const file = await OpenAI.toFile(data, filename, { type: mime });
      const response = await configured().audio.transcriptions.create({
        model: env.transcriptionModel, file,
        prompt: "A person describing meals, quantities, nutrition labels and corrections. Common foods include dal, roti, paneer, khichdi, hummus, pesto and rice. Preserve their corrections and numbers."
      });
      const text = response.text.trim();
      if (!text) throw Object.assign(new Error("No speech was detected. Try recording again or type your meal."), { statusCode: 422 });
      return text;
    }
  };
}
