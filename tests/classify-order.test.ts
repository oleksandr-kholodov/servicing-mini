import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { importLoanTape } from "@/lib/import/loan-import";
import { getTestDb, clearTestTables, closeTestDb, seedTestLenders } from "./db-helpers";
import { emailClassifications, loans } from "@/lib/db/schema";
import { eq, and, desc, asc } from "drizzle-orm";

const LOAN_CSV = `loan_number,borrower_name,borrower_email,borrower_phone,property_address,original_balance,current_balance,interest_rate,origination_date,maturity_date,status
CL-001,Order Test,order@test.com,555-000-0001,1 Order St Austin TX 78701,200000,190000,0.0400,2023-01-01,2053-01-01,current`;

describe("latestClassification ordering — regression for H1", () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;
  let loanId: string;

  beforeAll(async () => {
    db = await getTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await clearTestTables(db);
    await seedTestLenders(db);

    await importLoanTape(db as any, LOAN_CSV, "cl.csv", "test-lender-a");
    const loan = await db.query.loans.findFirst({
      where: and(eq(loans.lenderId, "test-lender-a"), eq(loans.loanNumber, "CL-001")),
    });
    expect(loan).toBeDefined();
    loanId = loan!.id;
  });

  it("desc findFirst returns latest classification, not oldest", async () => {
    // Insert two classifications with different intents and summaries
    await db.insert(emailClassifications).values({
      lenderId: "test-lender-a",
      caseId: loanId,
      rawText: "first email",
      intent: "hardship",
      confidence: "0.800",
      summary: "First classification — hardship.",
      needsReview: false,
      provider: "stub",
    });

    // Small delay so created_at differs (Postgres timestamp precision)
    await new Promise((r) => setTimeout(r, 20));

    await db.insert(emailClassifications).values({
      lenderId: "test-lender-a",
      caseId: loanId,
      rawText: "second email",
      intent: "promise_to_pay",
      confidence: "0.920",
      summary: "Second classification — promise to pay.",
      needsReview: false,
      provider: "stub",
    });

    // Simulate the fixed API query (DESC order → findFirst = latest)
    const latestViaDesc = await db.query.emailClassifications.findFirst({
      where: and(
        eq(emailClassifications.caseId, loanId),
        eq(emailClassifications.lenderId, "test-lender-a")
      ),
      orderBy: [desc(emailClassifications.createdAt)],
    });

    // The old buggy query (ASC order → findFirst = oldest)
    const oldestViaAsc = await db.query.emailClassifications.findFirst({
      where: and(
        eq(emailClassifications.caseId, loanId),
        eq(emailClassifications.lenderId, "test-lender-a")
      ),
      orderBy: [asc(emailClassifications.createdAt)],
    });

    expect(latestViaDesc?.intent).toBe("promise_to_pay"); // latest = second insert
    expect(oldestViaAsc?.intent).toBe("hardship");        // oldest = first insert
    expect(latestViaDesc?.intent).not.toBe(oldestViaAsc?.intent);
  });
});
