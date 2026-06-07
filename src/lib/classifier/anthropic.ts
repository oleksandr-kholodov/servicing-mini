import Anthropic from "@anthropic-ai/sdk";
import { ClassificationSchema } from "./types";
import type { LlmClassifier } from "./interface";
import type { ClassificationResult, ClassifierInput } from "./types";

const TOOL_NAME = "classify_borrower_email";

const SYSTEM_PROMPT = `You are a mortgage servicing AI assistant. Your task is to classify borrower emails
into structured intents. Always respond by calling the ${TOOL_NAME} tool with accurate, conservative classifications.`;

const CLASSIFICATION_TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: "Classify a borrower email into a structured intent with extracted fields.",
  input_schema: {
    type: "object",
    properties: {
      intent: {
        type: "string",
        enum: ["promise_to_pay", "dispute", "hardship", "wrong_contact", "renewal_request", "other"],
        description: "Primary intent of the borrower email.",
      },
      extracted: {
        type: "object",
        properties: {
          promised_date: {
            type: "string",
            description: "ISO 8601 date (YYYY-MM-DD) if borrower promises payment by a specific date.",
          },
          promised_amount: {
            type: "number",
            description: "Dollar amount promised if specified.",
          },
        },
      },
      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "Confidence score 0-1 for the classification.",
      },
      summary: {
        type: "string",
        description: "1-2 sentence summary of the borrower's message.",
      },
    },
    required: ["intent", "confidence", "summary"],
  },
};

const MAX_RETRIES = 2;

export class AnthropicClassifier implements LlmClassifier {
  readonly providerName = "anthropic";
  private client: Anthropic;

  constructor() {
    const apiKey = process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
    this.client = new Anthropic({ apiKey });
  }

  async classify(input: ClassifierInput): Promise<ClassificationResult> {
    let lastRaw: unknown;
    let attempt = 0;

    while (attempt <= MAX_RETRIES) {
      attempt++;
      let response: Anthropic.Message;

      try {
        response = await this.client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 512,
          system: SYSTEM_PROMPT,
          tools: [CLASSIFICATION_TOOL],
          tool_choice: { type: "any" },
          messages: [
            {
              role: "user",
              content: `Classify this borrower email:\n\n<email>\n${input.text}\n</email>`,
            },
          ],
        });
      } catch (err) {
        if (attempt > MAX_RETRIES) return this.fallback(lastRaw, err);
        continue;
      }

      lastRaw = response;
      const toolUse = response.content.find((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");
      if (!toolUse) {
        if (attempt > MAX_RETRIES) return this.fallback(lastRaw, "No tool_use block");
        continue;
      }

      const parsed = ClassificationSchema.safeParse(toolUse.input);
      if (!parsed.success) {
        console.error("[AnthropicClassifier] Schema validation failed:", parsed.error.flatten());
        if (attempt > MAX_RETRIES) return this.fallback(lastRaw, parsed.error);
        continue;
      }

      return {
        ...parsed.data,
        extracted: parsed.data.extracted ?? {},
        needs_review: false,
        raw_response: lastRaw,
        provider: this.providerName,
      };
    }

    return this.fallback(lastRaw, "Max retries exceeded");
  }

  private fallback(raw: unknown, reason: unknown): ClassificationResult {
    console.error("[AnthropicClassifier] Fallback triggered:", reason);
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
