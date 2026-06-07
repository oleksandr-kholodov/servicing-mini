import type { LlmClassifier } from "./interface";
import type { ClassificationResult, ClassifierInput } from "./types";

type Rule = {
  keywords: string[];
  intent: ClassificationResult["intent"];
  confidence: number;
  summary: string;
  extractAmount?: boolean;
  extractDate?: boolean;
};

/**
 * StubClassifier — deterministic rule-based provider.
 *
 * No API call, no randomness. Used for:
 *   1. Local dev with no API keys
 *   2. All unit/integration tests (repeatable, instant, free)
 *   3. The eval harness baseline
 *
 * Rules are ordered by priority; first match wins.
 */
const RULES: Rule[] = [
  {
    keywords: ["will pay", "payment by", "pay you by", "send payment", "promise to pay", "pay on", "make payment"],
    intent: "promise_to_pay",
    confidence: 0.92,
    summary: "Borrower promises an upcoming payment.",
    extractDate: true,
    extractAmount: true,
  },
  {
    keywords: ["dispute", "incorrect", "wrong amount", "not my loan", "not responsible", "error on", "billing error"],
    intent: "dispute",
    confidence: 0.88,
    summary: "Borrower disputes the loan balance or charges.",
  },
  {
    keywords: ["lost job", "medical", "hardship", "can't afford", "cannot afford", "financial difficulty", "struggling", "laid off", "unemployed", "reduced income"],
    intent: "hardship",
    confidence: 0.90,
    summary: "Borrower reports financial hardship.",
  },
  {
    keywords: ["wrong number", "wrong person", "wrong address", "not the borrower", "stop calling", "remove my", "do not contact", "wrong contact"],
    intent: "wrong_contact",
    confidence: 0.95,
    summary: "Contact information is incorrect or this is the wrong person.",
  },
  {
    keywords: ["renew", "refinance", "extend my loan", "renewal", "new terms", "interest rate reduction"],
    intent: "renewal_request",
    confidence: 0.85,
    summary: "Borrower requests loan renewal or refinancing.",
  },
];

function extractDate(text: string): string | undefined {
  // ISO date
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso?.[1]) return iso[1];

  // Month Day Year patterns → convert to ISO
  const patterns = [
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/i,
    /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i,
    /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/,
  ];

  const monthMap: Record<string, string> = {
    january: "01", february: "02", march: "03", april: "04",
    may: "05", june: "06", july: "07", august: "08",
    september: "09", october: "10", november: "11", december: "12",
  };

  for (const pat of patterns) {
    const m = text.match(pat);
    if (!m) continue;
    const full = m[0];
    // Try to parse
    const monthName = full.match(/[A-Za-z]+/)?.[0]?.toLowerCase();
    const parts = full.replace(/[^0-9/\-]/g, " ").trim().split(/[\s/\-]+/).filter(Boolean);
    if (monthName && monthMap[monthName] && parts.length >= 2) {
      const year = parts.find((p) => p.length === 4) ?? "";
      const day = parts.find((p) => p.length <= 2 && parseInt(p) <= 31) ?? "";
      if (year && day) return `${year}-${monthMap[monthName]}-${day.padStart(2, "0")}`;
    } else if (parts.length === 3) {
      const [m1, m2, y] = parts;
      if (y && y.length === 4 && m1 && m2) {
        const month = parseInt(m1) <= 12 ? m1.padStart(2, "0") : m2.padStart(2, "0");
        const day = parseInt(m1) <= 12 ? m2.padStart(2, "0") : m1.padStart(2, "0");
        return `${y}-${month}-${day}`;
      }
    }
  }
  return undefined;
}

function extractAmount(text: string): number | undefined {
  const m = text.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
  if (!m?.[1]) return undefined;
  return parseFloat(m[1].replace(/,/g, ""));
}

export class StubClassifier implements LlmClassifier {
  readonly providerName = "stub";

  async classify(input: ClassifierInput): Promise<ClassificationResult> {
    const lower = input.text.toLowerCase();

    for (const rule of RULES) {
      const matched = rule.keywords.some((kw) => lower.includes(kw));
      if (!matched) continue;

      const extracted: ClassificationResult["extracted"] = {};
      if (rule.extractDate) {
        const d = extractDate(input.text);
        if (d) extracted.promised_date = d;
      }
      if (rule.extractAmount) {
        const a = extractAmount(input.text);
        if (a) extracted.promised_amount = a;
      }

      return {
        intent: rule.intent,
        extracted,
        confidence: rule.confidence,
        summary: rule.summary,
        needs_review: false,
        provider: this.providerName,
      };
    }

    // Graceful fallback
    return {
      intent: "other",
      extracted: {},
      confidence: 0.5,
      summary: "Unable to determine intent from borrower message.",
      needs_review: true,
      provider: this.providerName,
    };
  }
}
