import { GoogleGenAI, Type } from "@google/genai";
import { ClassificationSchema } from "./types";
import type { LlmClassifier } from "./interface";
import type { ClassificationResult, ClassifierInput } from "./types";

const MAX_RETRIES = 2;
// gemini-3.1-flash-lite: best free-tier quota (15 RPM / 500 RPD) and scored
// 12/12 on the eval golden set — ideal for this classification task.
const DEFAULT_MODEL = "gemini-3.1-flash-lite";

const SYSTEM_INSTRUCTION = `You are a mortgage servicing AI. Classify each borrower email into exactly one intent:
- promise_to_pay: borrower commits to pay a specific amount and/or by a specific date.
- dispute: borrower disputes the balance, a charge/fee, or that they owe the debt at all.
- hardship: borrower reports financial difficulty (job loss, illness, reduced income) or asks for forbearance, deferral, or payment assistance.
- wrong_contact: borrower says they are not the right person, it is not their loan, or the contact details are wrong.
- renewal_request: borrower asks to renew, refinance, modify, or extend the loan term.
- other: anything that does not clearly fit the categories above.
Also extract promised_date (YYYY-MM-DD) and promised_amount when the borrower states them. Be accurate and conservative; only use "other" when no specific intent applies.`;

// Gemini responseSchema (OpenAPI-subset) mirroring ClassificationSchema. Zod
// still does the authoritative validation on the returned JSON — this just
// steers the model toward the right shape.
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    intent: {
      type: Type.STRING,
      enum: ["promise_to_pay", "dispute", "hardship", "wrong_contact", "renewal_request", "other"],
    },
    extracted: {
      type: Type.OBJECT,
      properties: {
        promised_date: { type: Type.STRING, description: "ISO date YYYY-MM-DD, if present" },
        promised_amount: { type: Type.NUMBER, description: "Promised payment amount, if present" },
      },
    },
    confidence: { type: Type.NUMBER, description: "0..1 confidence" },
    summary: { type: Type.STRING, description: "One-sentence summary" },
  },
  required: ["intent", "confidence", "summary"],
  propertyOrdering: ["intent", "extracted", "confidence", "summary"],
};

export class GeminiClassifier implements LlmClassifier {
  readonly providerName = "gemini";
  private client: GoogleGenAI;
  private model: string;

  constructor() {
    const apiKey = process.env["GEMINI_API_KEY"];
    if (!apiKey) throw new Error("GEMINI_API_KEY not set");
    this.client = new GoogleGenAI({ apiKey });
    this.model = process.env["GEMINI_MODEL"] ?? DEFAULT_MODEL;
  }

  async classify(input: ClassifierInput): Promise<ClassificationResult> {
    let lastRaw: unknown;
    let attempt = 0;

    while (attempt <= MAX_RETRIES) {
      attempt++;

      let text: string | undefined;
      try {
        const response = await this.client.models.generateContent({
          model: this.model,
          contents: `Classify this borrower email:\n\n<email>\n${input.text}\n</email>`,
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
          },
        });
        lastRaw = response;
        text = response.text;
      } catch (err) {
        if (attempt > MAX_RETRIES) return this.fallback(lastRaw, err);
        continue;
      }

      if (!text) {
        if (attempt > MAX_RETRIES) return this.fallback(lastRaw, "Empty response");
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        if (attempt > MAX_RETRIES) return this.fallback(lastRaw, err);
        continue;
      }

      const validated = ClassificationSchema.safeParse(parsed);
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
    console.error("[GeminiClassifier] Fallback triggered:", reason);
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
