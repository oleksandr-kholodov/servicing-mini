import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getClassifier } from "@/lib/classifier/factory";
import { emailClassifications, events, loans } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { rateLimit, clientKey } from "@/lib/rate-limit";

export const runtime = "nodejs";

const RequestSchema = z.object({
  caseId: z.string().uuid(),
  lenderId: z.string().min(1),
  text: z.string().min(1).max(10000),
});

// Protect the (free-tier) LLM quota: cap classify calls per client.
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

export async function POST(req: NextRequest) {
  try {
    const limit = rateLimit(`classify:${clientKey(req)}`, RATE_LIMIT, RATE_WINDOW_MS);
    if (!limit.ok) {
      return NextResponse.json(
        { error: "Rate limit exceeded — please slow down." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
      );
    }

    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { caseId, lenderId, text } = parsed.data;

    // Multi-tenant guard: verify loan belongs to this lender
    const loan = await db.query.loans.findFirst({
      where: and(eq(loans.id, caseId), eq(loans.lenderId, lenderId)),
    });
    if (!loan) {
      return NextResponse.json({ error: "Case not found for this lender" }, { status: 404 });
    }

    const classifier = getClassifier();
    const result = await classifier.classify({ text, loanNumber: loan.loanNumber });

    // Persist classification
    const [saved] = await db
      .insert(emailClassifications)
      .values({
        lenderId,
        caseId,
        rawText: text,
        intent: result.intent,
        promisedDate: result.extracted?.promised_date ?? null,
        promisedAmount: result.extracted?.promised_amount?.toFixed(2) ?? null,
        confidence: result.confidence.toFixed(3),
        summary: result.summary,
        needsReview: result.needs_review,
        rawResponse: result.raw_response as Record<string, unknown> ?? null,
        provider: result.provider,
      })
      .returning({ id: emailClassifications.id });

    // Append event
    await db.insert(events).values({
      lenderId,
      caseId,
      type: "email_classified",
      payload: {
        classificationId: saved?.id,
        intent: result.intent,
        confidence: result.confidence,
        summary: result.summary,
        needsReview: result.needs_review,
        provider: result.provider,
      },
    });

    return NextResponse.json({
      ...result,
      classificationId: saved?.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[POST /api/classify]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
