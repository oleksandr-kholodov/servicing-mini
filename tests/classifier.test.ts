import { describe, it, expect, beforeEach } from "vitest";
import { StubClassifier } from "@/lib/classifier/stub";
import { ClassificationSchema } from "@/lib/classifier/types";
import { resetClassifier } from "@/lib/classifier/factory";

describe("StubClassifier", () => {
  let classifier: StubClassifier;

  beforeEach(() => {
    classifier = new StubClassifier();
    resetClassifier();
  });

  it("classifies promise_to_pay correctly", async () => {
    const result = await classifier.classify({
      text: "I will pay the overdue balance of $1,500 by June 30th.",
    });
    expect(result.intent).toBe("promise_to_pay");
    expect(result.confidence).toBeGreaterThan(0.7);
    expect(result.needs_review).toBe(false);
  });

  it("extracts promised_amount from promise_to_pay", async () => {
    const result = await classifier.classify({
      text: "I promise to pay $2,750 by the end of the month.",
    });
    expect(result.intent).toBe("promise_to_pay");
    expect(result.extracted?.promised_amount).toBe(2750);
  });

  it("classifies dispute correctly", async () => {
    const result = await classifier.classify({
      text: "There is an error on my account. The balance is incorrect.",
    });
    expect(result.intent).toBe("dispute");
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it("classifies hardship correctly", async () => {
    const result = await classifier.classify({
      text: "I lost my job last month and cannot afford the payment right now.",
    });
    expect(result.intent).toBe("hardship");
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it("classifies wrong_contact correctly", async () => {
    const result = await classifier.classify({
      text: "You have the wrong number. I am not the borrower. Stop calling me.",
    });
    expect(result.intent).toBe("wrong_contact");
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it("classifies renewal_request correctly", async () => {
    const result = await classifier.classify({
      text: "I would like to refinance my loan and get a better interest rate.",
    });
    expect(result.intent).toBe("renewal_request");
  });

  it("falls back to other with needs_review=true for unrecognized input", async () => {
    const result = await classifier.classify({
      text: "Please send me the address of your office so I can mail you a document.",
    });
    expect(result.intent).toBe("other");
    expect(result.needs_review).toBe(true);
  });
});

describe("ClassificationSchema validation", () => {
  it("accepts valid classification output", () => {
    const valid = {
      intent: "promise_to_pay",
      extracted: { promised_date: "2026-07-01", promised_amount: 1500 },
      confidence: 0.92,
      summary: "Borrower promises payment.",
    };
    const result = ClassificationSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("strips extra fields (hallucination protection)", () => {
    const withExtra = {
      intent: "dispute",
      extracted: {},
      confidence: 0.88,
      summary: "Balance dispute.",
      hallucinated_field: "should be removed",
    };
    const result = ClassificationSchema.safeParse(withExtra);
    expect(result.success).toBe(true);
    if (result.success) {
      expect("hallucinated_field" in result.data).toBe(false);
    }
  });

  it("rejects invalid intent enum", () => {
    const bad = {
      intent: "pay_now", // not in enum
      confidence: 0.9,
      summary: "test",
    };
    const result = ClassificationSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects confidence outside 0-1", () => {
    const bad = {
      intent: "other",
      confidence: 1.5,
      summary: "test",
    };
    const result = ClassificationSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects invalid ISO date in extracted", () => {
    const bad = {
      intent: "promise_to_pay",
      extracted: { promised_date: "not-a-date" },
      confidence: 0.9,
      summary: "test",
    };
    const result = ClassificationSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});
