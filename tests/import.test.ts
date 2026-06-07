import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { importLoanTape } from "@/lib/import/loan-import";
import { getTestDb, clearTestTables, closeTestDb, seedTestLenders } from "./db-helpers";
import { loans, importRuns, events } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

const SAMPLE_CSV = `loan_number,borrower_name,borrower_email,borrower_phone,property_address,original_balance,current_balance,interest_rate,origination_date,maturity_date,status
LN-001,Alice Johnson,alice@example.com,555-100-0001,100 Main St Austin TX 78701,300000,280000,0.0400,2022-01-01,2052-01-01,current
LN-002,Bob Smith,bob@example.com,555-100-0002,200 Oak Ave Dallas TX 75201,450000,420000,0.0420,2022-03-01,2052-03-01,delinquent
LN-003,Carol White,,555-100-0003,300 Elm Blvd Houston TX 77002,180000,160000,0.0375,2021-06-15,2051-06-15,current`;

const UPDATED_CSV = `loan_number,borrower_name,borrower_email,borrower_phone,property_address,original_balance,current_balance,interest_rate,origination_date,maturity_date,status
LN-001,Alice Johnson,alice@example.com,555-100-0001,100 Main St Austin TX 78701,300000,275000,0.0400,2022-01-01,2052-01-01,current
LN-002,Bob Smith,bob@example.com,555-100-0002,200 Oak Ave Dallas TX 75201,450000,415000,0.0420,2022-03-01,2052-03-01,in_forbearance
LN-003,Carol White,,555-100-0003,300 Elm Blvd Houston TX 77002,180000,160000,0.0375,2021-06-15,2051-06-15,current
LN-004,Dave Green,dave@example.com,555-100-0004,400 Pine Rd San Antonio TX 78201,250000,248000,0.0430,2023-04-01,2053-04-01,current`;

describe("importLoanTape — idempotency", () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeAll(async () => {
    db = await getTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await clearTestTables(db);
    await seedTestLenders(db);
  });

  it("inserts all rows on first import", async () => {
    const result = await importLoanTape(db as any, SAMPLE_CSV, "test.csv", "test-lender-a");

    expect(result.inserted).toBe(3);
    expect(result.updated).toBe(0);
    expect(result.unchanged).toBe(0);
    expect(result.errors).toBe(0);
    expect(result.totalRows).toBe(3);
  });

  it("produces zero duplicates on exact re-import", async () => {
    await importLoanTape(db as any, SAMPLE_CSV, "test.csv", "test-lender-a");

    const allLoans = await db.select().from(loans).where(eq(loans.lenderId, "test-lender-a"));
    expect(allLoans).toHaveLength(3);

    // Import the same CSV again
    const result2 = await importLoanTape(db as any, SAMPLE_CSV, "test.csv", "test-lender-a");

    expect(result2.inserted).toBe(0);
    expect(result2.updated).toBe(0);
    expect(result2.unchanged).toBe(3);
    expect(result2.errors).toBe(0);

    // Still exactly 3 rows — no duplicates
    const loansAfter = await db.select().from(loans).where(eq(loans.lenderId, "test-lender-a"));
    expect(loansAfter).toHaveLength(3);
  });

  it("updates changed rows and inserts new rows on second import", async () => {
    await importLoanTape(db as any, SAMPLE_CSV, "test.csv", "test-lender-a");
    const result2 = await importLoanTape(db as any, UPDATED_CSV, "test-v2.csv", "test-lender-a");

    // LN-001: balance changed → updated
    // LN-002: balance + status changed → updated
    // LN-003: unchanged
    // LN-004: new → inserted
    expect(result2.inserted).toBe(1);
    expect(result2.updated).toBe(2);
    expect(result2.unchanged).toBe(1);

    const totalLoans = await db.select().from(loans).where(eq(loans.lenderId, "test-lender-a"));
    expect(totalLoans).toHaveLength(4);

    // Verify LN-002 status was updated
    const ln002 = await db.query.loans.findFirst({
      where: and(eq(loans.lenderId, "test-lender-a"), eq(loans.loanNumber, "LN-002")),
    });
    expect(ln002?.status).toBe("in_forbearance");
    expect(parseFloat(ln002?.currentBalance ?? "0")).toBe(415000);
  });

  it("creates an import run audit record for each upload", async () => {
    const r1 = await importLoanTape(db as any, SAMPLE_CSV, "test.csv", "test-lender-a");
    const r2 = await importLoanTape(db as any, SAMPLE_CSV, "test.csv", "test-lender-a");

    const runs = await db.select().from(importRuns).where(eq(importRuns.lenderId, "test-lender-a"));
    expect(runs).toHaveLength(2);

    const run1 = runs.find((r) => r.id === r1.runId);
    expect(run1?.inserted).toBe(3);
    expect(run1?.unchanged).toBe(0);
    expect(run1?.completedAt).not.toBeNull();

    const run2 = runs.find((r) => r.id === r2.runId);
    expect(run2?.inserted).toBe(0);
    expect(run2?.unchanged).toBe(3);
  });

  it("handles invalid rows gracefully with per-row error tracking", async () => {
    const badCsv = `loan_number,borrower_name,borrower_email,borrower_phone,property_address,original_balance,current_balance,interest_rate,origination_date,maturity_date,status
GOOD-001,Valid Person,v@example.com,,100 Good St TX 78701,200000,180000,0.0400,2022-01-01,2052-01-01,current
,Missing LoanNumber,bad@example.com,,200 Bad St TX 78701,not-a-number,100000,0.0400,2022-01-01,2052-01-01,current`;

    const result = await importLoanTape(db as any, badCsv, "bad.csv", "test-lender-a");
    expect(result.inserted).toBe(1);
    expect(result.errors).toBe(1);
    expect(result.errorDetails[0]?.row).toBe(2);
  });
});
