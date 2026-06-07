import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { importLoanTape } from "@/lib/import/loan-import";
import { getTestDb, clearTestTables, closeTestDb, seedTestLenders } from "./db-helpers";
import { events, loans } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";

const LOAN_CSV = `loan_number,borrower_name,borrower_email,borrower_phone,property_address,original_balance,current_balance,interest_rate,origination_date,maturity_date,status
EV-001,Event TestUser,ev@test.com,555-999-0001,1 Event Ln Austin TX 78701,300000,290000,0.0400,2023-01-01,2053-01-01,current`;

const UPDATED_CSV = `loan_number,borrower_name,borrower_email,borrower_phone,property_address,original_balance,current_balance,interest_rate,origination_date,maturity_date,status
EV-001,Event TestUser,ev@test.com,555-999-0001,1 Event Ln Austin TX 78701,300000,285000,0.0400,2023-01-01,2053-01-01,delinquent`;

describe("Append-only event log", () => {
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

  it("emits loan_imported event on first insert", async () => {
    await importLoanTape(db as any, LOAN_CSV, "ev.csv", "test-lender-a");

    const loan = await db.query.loans.findFirst({
      where: and(eq(loans.lenderId, "test-lender-a"), eq(loans.loanNumber, "EV-001")),
    });
    expect(loan).toBeDefined();

    const evts = await db.select().from(events).where(eq(events.caseId, loan!.id));
    expect(evts).toHaveLength(1);
    expect(evts[0]?.type).toBe("loan_imported");
    expect((evts[0]?.payload as Record<string, unknown>)["action"]).toBe("inserted");
  });

  it("emits status_changed event when status changes on re-import", async () => {
    await importLoanTape(db as any, LOAN_CSV, "ev.csv", "test-lender-a");
    await importLoanTape(db as any, UPDATED_CSV, "ev-v2.csv", "test-lender-a");

    const loan = await db.query.loans.findFirst({
      where: and(eq(loans.lenderId, "test-lender-a"), eq(loans.loanNumber, "EV-001")),
    });

    const evts = await db
      .select()
      .from(events)
      .where(eq(events.caseId, loan!.id))
      .orderBy(asc(events.createdAt));

    // At minimum: loan_imported (insert) + status_changed
    expect(evts.length).toBeGreaterThanOrEqual(2);
    const statusEvent = evts.find((e) => e.type === "status_changed");
    expect(statusEvent).toBeDefined();
    const payload = statusEvent?.payload as Record<string, unknown>;
    expect(payload?.["from"]).toBe("current");
    expect(payload?.["to"]).toBe("delinquent");
  });

  it("event log grows monotonically — never truncated", async () => {
    await importLoanTape(db as any, LOAN_CSV, "ev.csv", "test-lender-a");
    await importLoanTape(db as any, LOAN_CSV, "ev.csv", "test-lender-a"); // unchanged, no new event
    await importLoanTape(db as any, UPDATED_CSV, "ev-v2.csv", "test-lender-a");

    const loan = await db.query.loans.findFirst({
      where: and(eq(loans.lenderId, "test-lender-a"), eq(loans.loanNumber, "EV-001")),
    });
    const evts = await db.select().from(events).where(eq(events.caseId, loan!.id));

    // First import: 1 event (inserted). Second import: unchanged, 0 events. Third: status_changed
    expect(evts.length).toBeGreaterThanOrEqual(2);

    // All events have an ascending created_at
    const sorted = [...evts].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    for (let i = 1; i < sorted.length; i++) {
      expect(new Date(sorted[i]!.createdAt).getTime()).toBeGreaterThanOrEqual(
        new Date(sorted[i - 1]!.createdAt).getTime()
      );
    }
  });

  it("timeline (events ordered by created_at) accurately reflects state transitions", async () => {
    await importLoanTape(db as any, LOAN_CSV, "ev.csv", "test-lender-a");
    await importLoanTape(db as any, UPDATED_CSV, "ev-v2.csv", "test-lender-a");

    const loan = await db.query.loans.findFirst({
      where: and(eq(loans.lenderId, "test-lender-a"), eq(loans.loanNumber, "EV-001")),
    });

    const timeline = await db
      .select()
      .from(events)
      .where(eq(events.caseId, loan!.id))
      .orderBy(asc(events.createdAt));

    const types = timeline.map((e) => e.type);
    expect(types[0]).toBe("loan_imported");
    expect(types).toContain("status_changed");

    // Derive current status from events — last status_changed wins
    const statusChanges = timeline.filter((e) => e.type === "status_changed");
    const derivedStatus =
      statusChanges.length > 0
        ? (statusChanges[statusChanges.length - 1]?.payload as Record<string, unknown>)?.["to"]
        : "current";

    expect(derivedStatus).toBe("delinquent");
  });
});
