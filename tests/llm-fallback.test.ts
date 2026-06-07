import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Anthropic SDK before any classifier import so the constructor succeeds
// but every API call throws — simulating a timeout / network error.
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockRejectedValue(new Error("connect ETIMEDOUT")),
    },
  })),
}));

describe("LLM provider fallback — AnthropicClassifier", () => {
  beforeEach(() => {
    process.env["ANTHROPIC_API_KEY"] = "test-key-not-real";
  });

  it("returns intent=other and needs_review=true when the provider throws on every attempt", async () => {
    // Dynamic import so the vi.mock above has already been hoisted and applied
    const { AnthropicClassifier } = await import("@/lib/classifier/anthropic");
    const classifier = new AnthropicClassifier();

    const result = await classifier.classify({ text: "Please help me with my mortgage." });

    expect(result.intent).toBe("other");
    expect(result.needs_review).toBe(true);
    expect(result.confidence).toBe(0);
    expect(result.provider).toBe("anthropic");
    expect(result.summary).toMatch(/review/i);
  });
});
