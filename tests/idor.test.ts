import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { importLoanTape } from "@/lib/import/loan-import";
import { getTestDb, clearTestTables, closeTestDb, seedTestLenders } from "./db-helpers";
import { loans } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { GET } from "@/app/api/cases/[id]/route";

const LOAN_CSV = `loan_number,borrower_name,borrower_email,borrower_phone,property_address,original_balance,current_balance,interest_rate,origination_date,maturity_date,status
ID-001,Alice Tenant,alice@lender-a.com,555-100-0001,1 Tenant St TX 78701,250000,240000,0.0425,2023-03-01,2053-03-01,current`;

describe("IDOR protection — case detail API", () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;
  let lenderALoanId: string;

  beforeAll(async () => {
    db = await getTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await clearTestTables(db);
    await seedTestLenders(db);
    await importLoanTape(db as any, LOAN_CSV, "id.csv", "test-lender-a");

    const loan = await db.query.loans.findFirst({
      where: and(eq(loans.lenderId, "test-lender-a"), eq(loans.loanNumber, "ID-001")),
    });
    expect(loan).toBeDefined();
    lenderALoanId = loan!.id;
  });

  it("GET /api/cases/[id] returns 404 when lenderId belongs to a different tenant (IDOR guard)", async () => {
    // Loan ID-001 belongs to test-lender-a; querying it as test-lender-b must return 404
    const req = new NextRequest(
      new URL(`http://localhost/api/cases/${lenderALoanId}?lenderId=test-lender-b`)
    );
    const res = await GET(req, { params: Promise.resolve({ id: lenderALoanId }) });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("GET /api/cases/[id] returns 200 for the correct tenant", async () => {
    const req = new NextRequest(
      new URL(`http://localhost/api/cases/${lenderALoanId}?lenderId=test-lender-a`)
    );
    const res = await GET(req, { params: Promise.resolve({ id: lenderALoanId }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.loan.loanNumber).toBe("ID-001");
  });
});
