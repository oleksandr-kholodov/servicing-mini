import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { importLoanTape } from "@/lib/import/loan-import";
import { getTestDb, clearTestTables, closeTestDb, seedTestLenders } from "./db-helpers";
import { loans, events, importRuns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const LENDER_A_CSV = `loan_number,borrower_name,borrower_email,borrower_phone,property_address,original_balance,current_balance,interest_rate,origination_date,maturity_date,status
MT-001,Alice A,a@lender-a.com,555-001-0001,1 Lender A St TX 78701,200000,190000,0.0400,2023-01-01,2053-01-01,current
MT-002,Bob A,b@lender-a.com,555-001-0002,2 Lender A St TX 78701,300000,280000,0.0410,2023-02-01,2053-02-01,current`;

const LENDER_B_CSV = `loan_number,borrower_name,borrower_email,borrower_phone,property_address,original_balance,current_balance,interest_rate,origination_date,maturity_date,status
MT-001,Alice B,a@lender-b.com,555-002-0001,1 Lender B Blvd AZ 85001,400000,380000,0.0450,2022-06-01,2052-06-01,delinquent`;

describe("Multi-tenant isolation", () => {
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

  it("loans from lender A are not visible to lender B queries", async () => {
    await importLoanTape(db as any, LENDER_A_CSV, "a.csv", "test-lender-a");
    await importLoanTape(db as any, LENDER_B_CSV, "b.csv", "test-lender-b");

    const aLoans = await db.select().from(loans).where(eq(loans.lenderId, "test-lender-a"));
    const bLoans = await db.select().from(loans).where(eq(loans.lenderId, "test-lender-b"));

    expect(aLoans).toHaveLength(2);
    expect(bLoans).toHaveLength(1);

    // Lender B's loan MT-001 is a different borrower with different data
    expect(bLoans[0]?.borrowerName).toBe("Alice B");
    expect(aLoans.find((l) => l.loanNumber === "MT-001")?.borrowerName).toBe("Alice A");
  });

  it("same loan_number in different lenders does not conflict (natural key is lender_id+loan_number)", async () => {
    // Both lenders have MT-001 — should not conflict
    const rA = await importLoanTape(db as any, LENDER_A_CSV, "a.csv", "test-lender-a");
    const rB = await importLoanTape(db as any, LENDER_B_CSV, "b.csv", "test-lender-b");

    expect(rA.errors).toBe(0);
    expect(rB.errors).toBe(0);
    expect(rA.inserted).toBe(2);
    expect(rB.inserted).toBe(1);
  });

  it("events from lender A are not visible in lender B scope", async () => {
    await importLoanTape(db as any, LENDER_A_CSV, "a.csv", "test-lender-a");
    await importLoanTape(db as any, LENDER_B_CSV, "b.csv", "test-lender-b");

    const aEvents = await db.select().from(events).where(eq(events.lenderId, "test-lender-a"));
    const bEvents = await db.select().from(events).where(eq(events.lenderId, "test-lender-b"));

    expect(aEvents.length).toBeGreaterThan(0);
    expect(bEvents.length).toBeGreaterThan(0);

    // No cross-contamination
    const aEventIds = new Set(aEvents.map((e) => e.id));
    for (const be of bEvents) {
      expect(aEventIds.has(be.id)).toBe(false);
    }
  });

  it("import runs are scoped per lender", async () => {
    await importLoanTape(db as any, LENDER_A_CSV, "a.csv", "test-lender-a");
    await importLoanTape(db as any, LENDER_B_CSV, "b.csv", "test-lender-b");

    const aRuns = await db.select().from(importRuns).where(eq(importRuns.lenderId, "test-lender-a"));
    const bRuns = await db.select().from(importRuns).where(eq(importRuns.lenderId, "test-lender-b"));

    expect(aRuns).toHaveLength(1);
    expect(bRuns).toHaveLength(1);
    expect(aRuns[0]?.lenderId).toBe("test-lender-a");
    expect(bRuns[0]?.lenderId).toBe("test-lender-b");
  });
});
