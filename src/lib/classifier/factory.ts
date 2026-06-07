import type { LlmClassifier } from "./interface";
import { StubClassifier } from "./stub";

let _instance: LlmClassifier | undefined;

/**
 * Returns a singleton classifier instance for the configured provider.
 *
 * Providers (LLM_PROVIDER env):
 *   "stub"      — deterministic rule-based, no API key needed (default)
 *   "anthropic" — Claude Haiku via tool_use / structured output
 *   "openai"    — GPT-4o-mini via structured outputs (Zod schema)
 *   "gemini"    — Gemini Flash via responseSchema (JSON mode)
 */
export function getClassifier(): LlmClassifier {
  if (_instance) return _instance;

  const provider = (process.env["LLM_PROVIDER"] ?? "stub").toLowerCase();

  switch (provider) {
    case "anthropic": {
      // Lazy import to avoid loading the SDK when not needed
      const { AnthropicClassifier } = require("./anthropic") as typeof import("./anthropic");
      _instance = new AnthropicClassifier();
      break;
    }
    case "openai": {
      const { OpenAiClassifier } = require("./openai") as typeof import("./openai");
      _instance = new OpenAiClassifier();
      break;
    }
    case "gemini": {
      const { GeminiClassifier } = require("./gemini") as typeof import("./gemini");
      _instance = new GeminiClassifier();
      break;
    }
    case "stub":
    default: {
      _instance = new StubClassifier();
      break;
    }
  }

  return _instance;
}

/** Reset singleton — used in tests to swap providers between test cases. */
export function resetClassifier(): void {
  _instance = undefined;
}
