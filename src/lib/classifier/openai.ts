import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { ClassificationSchema } from "./types";
import type { LlmClassifier } from "./interface";
import type { ClassificationResult, ClassifierInput } from "./types";

const MAX_RETRIES = 2;

export class OpenAiClassifier implements LlmClassifier {
  readonly providerName = "openai";
  private client: OpenAI;

  constructor() {
    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) throw new Error("OPENAI_API_KEY not set");
    this.client = new OpenAI({ apiKey });
  }

  async classify(input: ClassifierInput): Promise<ClassificationResult> {
    let lastRaw: unknown;
    let attempt = 0;

    while (attempt <= MAX_RETRIES) {
      attempt++;

      let completion: Awaited<ReturnType<typeof this.client.beta.chat.completions.parse>>;
      try {
        completion = await this.client.beta.chat.completions.parse({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "You are a mortgage servicing AI. Classify borrower emails accurately and conservatively.",
            },
            {
              role: "user",
              content: `Classify this borrower email:\n\n<email>\n${input.text}\n</email>`,
            },
          ],
          response_format: zodResponseFormat(ClassificationSchema, "classification"),
        });
      } catch (err) {
        if (attempt > MAX_RETRIES) return this.fallback(lastRaw, err);
        continue;
      }

      lastRaw = completion;
      const message = completion.choices[0]?.message;
      if (!message?.parsed) {
        if (attempt > MAX_RETRIES) return this.fallback(lastRaw, "No parsed output");
        continue;
      }

      // OpenAI SDK types parsed as `{}` — re-validate with our schema for type safety
      const validated = ClassificationSchema.safeParse(message.parsed);
      if (!validated.success) {
        if (attempt > MAX_RETRIES) return this.fallback(lastRaw, validated.error);
        continue;
      }

      return {
        ...validated.data,
        extracted: validated.data.extracted ?? {},
        needs_review: false,
        raw_response: lastRaw,
        provider: this.providerName,
      };
    }

    return this.fallback(lastRaw, "Max retries exceeded");
  }

  private fallback(raw: unknown, reason: unknown): ClassificationResult {
    console.error("[OpenAiClassifier] Fallback triggered:", reason);
    return {
      intent: "other",
      extracted: {},
      confidence: 0,
      summary: "Classification failed; manual review required.",
      needs_review: true,
      raw_response: raw,
      provider: this.providerName,
    };
  }
}
