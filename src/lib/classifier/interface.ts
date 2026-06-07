import type { ClassificationResult, ClassifierInput } from "./types";

/**
 * LlmClassifier — provider-agnostic classification interface.
 *
 * Implementations: StubClassifier, AnthropicClassifier, OpenAiClassifier, GeminiClassifier.
 * The factory (factory.ts) resolves the concrete provider from LLM_PROVIDER env.
 *
 * Design rationale: the interface boundary lets us swap providers without
 * touching business logic, and the StubClassifier makes tests and demos
 * fully deterministic without a paid API key.
 */
export interface LlmClassifier {
  classify(input: ClassifierInput): Promise<ClassificationResult>;
  readonly providerName: string;
}
