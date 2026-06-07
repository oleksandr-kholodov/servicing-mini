import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loans } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const lenderId = req.nextUrl.searchParams.get("lenderId");
    if (!lenderId) {
      return NextResponse.json({ error: "lenderId required" }, { status: 400 });
    }

    const cases = await db.query.loans.findMany({
      where: eq(loans.lenderId, lenderId),
      orderBy: [asc(loans.loanNumber)],
    });

    return NextResponse.json(cases);
  } catch (err) {
    console.error("[GET /api/cases]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
