import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loans, events, emailClassifications } from "@/lib/db/schema";
import { eq, and, asc, desc } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const lenderId = req.nextUrl.searchParams.get("lenderId");
    if (!lenderId) {
      return NextResponse.json({ error: "lenderId required" }, { status: 400 });
    }

    // Multi-tenant scope: loan must belong to lender
    const loan = await db.query.loans.findFirst({
      where: and(eq(loans.id, id), eq(loans.lenderId, lenderId)),
    });
    if (!loan) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    // Append-only event log for this case
    const caseEvents = await db.query.events.findMany({
      where: and(eq(events.caseId, id), eq(events.lenderId, lenderId)),
      orderBy: [asc(events.createdAt)],
    });

    // Latest classification — DESC so findFirst returns the most recent
    const latestClassification = await db.query.emailClassifications.findFirst({
      where: and(
        eq(emailClassifications.caseId, id),
        eq(emailClassifications.lenderId, lenderId)
      ),
      orderBy: [desc(emailClassifications.createdAt)],
    });

    return NextResponse.json({
      loan,
      events: caseEvents,
      latestClassification: latestClassification ?? null,
    });
  } catch (err) {
    console.error("[GET /api/cases/[id]]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
