import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { importLoanTape } from "@/lib/import/loan-import";
import { lenders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const lenderId = (formData.get("lenderId") as string | null) ?? "";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!lenderId) {
      return NextResponse.json({ error: "lenderId is required" }, { status: 400 });
    }

    // Verify lender exists — multi-tenant guard
    const lender = await db.query.lenders.findFirst({
      where: eq(lenders.id, lenderId),
    });
    if (!lender) {
      return NextResponse.json({ error: "Unknown lenderId" }, { status: 404 });
    }

    const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 413 });
    }

    const csvContent = await file.text();
    if (!csvContent.trim()) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }

    const result = await importLoanTape(db, csvContent, file.name, lenderId);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[POST /api/import]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
