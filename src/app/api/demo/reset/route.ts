import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { seedDemoData } from "@/lib/demo/seed";

export const runtime = "nodejs";

// Restores the demo to its known baseline (10 Acme loans + 5 Beacon loans).
// Intended for the public portfolio demo so reviewers can replay the import
// story from a clean state.
export async function POST() {
  try {
    const summary = await seedDemoData(db);
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error("[POST /api/demo/reset]", err);
    return NextResponse.json({ error: "Reset failed" }, { status: 500 });
  }
}
