import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { lenders } from "@/lib/db/schema";
import { asc } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET() {
  try {
    const all = await db.select().from(lenders).orderBy(asc(lenders.name));
    return NextResponse.json(all);
  } catch (err) {
    console.error("[GET /api/lenders]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
