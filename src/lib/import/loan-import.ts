import { createHash } from "crypto";
import Papa from "papaparse";
import { eq, and, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { loans, importRuns, events } from "@/lib/db/schema";

export type LoanRow = {
  loan_number: string;
  borrower_name: string;
  borrower_email?: string;
  borrower_phone?: string;
  property_address: string;
  original_balance: string;
  current_balance: string;
  interest_rate: string;
  origination_date: string;
  maturity_date: string;
  status?: string;
};

export type ImportResult = {
  runId: string;
  lenderId: string;
  filename: string;
  checksum: string;
  totalRows: number;
  inserted: number;
  updated: number;
  unchanged: number;
  errors: number;
  errorDetails: { row: number; message: string }[];
};

type RowOutcome = "inserted" | "updated" | "unchanged" | "error";

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function parseValidStatuses(): string[] {
  return ["current", "delinquent", "in_forbearance", "paid_off", "foreclosure"];
}

/**
 * Idempotent import: natural key = (lender_id, loan_number).
 *
 * Why natural key over surrogate/hash?
 * The loan_number is meaningful to the lender and appears in all external
 * documents. Using it as the idempotency anchor means the lender can re-upload
 * a corrected file (changed balance, status) and get exactly the right upsert
 * semantics: new rows insert, changed rows update, identical rows are skipped.
 * A content-hash key would silently insert a new row on any field change,
 * breaking idempotency guarantees.
 */
export async function importLoanTape(
  db: DB,
  csvContent: string,
  filename: string,
  lenderId: string
): Promise<ImportResult> {
  const checksum = sha256(csvContent);

  // Parse CSV
  const { data, errors: parseErrors } = Papa.parse<LoanRow>(csvContent.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
  });

  if (parseErrors.length > 0) {
    console.error("[importLoanTape] CSV parse errors:", parseErrors);
  }

  // Create import run record first (in-progress)
  const [run] = await db
    .insert(importRuns)
    .values({
      lenderId,
      filename,
      checksum,
      totalRows: data.length + parseErrors.length,
    })
    .returning({ id: importRuns.id });

  if (!run) throw new Error("Failed to create import run");

  const validStatuses = parseValidStatuses();
  const outcomes: { outcome: RowOutcome; loanId?: string; error?: string; rowIndex: number }[] = [];

  // Count PapaParse structural errors (e.g. malformed quoting, truncated rows)
  for (let i = 0; i < parseErrors.length; i++) {
    const pe = parseErrors[i];
    outcomes.push({
      outcome: "error",
      error: `CSV parse error: ${pe?.message ?? "malformed row"}`,
      rowIndex: typeof pe?.row === "number" ? pe.row + 1 : 0,
    });
  }

  for (let i = 0; i < data.length; i++) {
    const row = data[i]!;
    const rowIndex = i + 1;

    try {
      const loanNumber = row.loan_number?.trim();
      if (!loanNumber) throw new Error("Missing loan_number");
      if (!row.borrower_name?.trim()) throw new Error("Missing borrower_name");
      if (!row.property_address?.trim()) throw new Error("Missing property_address");

      const origBal = parseFloat(row.original_balance ?? "");
      const currBal = parseFloat(row.current_balance ?? "");
      const rate = parseFloat(row.interest_rate ?? "");

      if (isNaN(origBal)) throw new Error("Invalid original_balance");
      if (isNaN(currBal)) throw new Error("Invalid current_balance");
      if (isNaN(rate)) throw new Error("Invalid interest_rate");

      const rawStatus = (row.status ?? "current").toLowerCase().replace(/\s+/g, "_");
      const status = validStatuses.includes(rawStatus) ? rawStatus : "current";

      const incoming = {
        lenderId,
        loanNumber,
        borrowerName: row.borrower_name.trim(),
        borrowerEmail: row.borrower_email?.trim() || null,
        borrowerPhone: row.borrower_phone?.trim() || null,
        propertyAddress: row.property_address.trim(),
        originalBalance: origBal.toFixed(2),
        currentBalance: currBal.toFixed(2),
        interestRate: rate.toFixed(4),
        originationDate: row.origination_date?.trim() ?? "",
        maturityDate: row.maturity_date?.trim() ?? "",
        status: status as "current" | "delinquent" | "in_forbearance" | "paid_off" | "foreclosure",
      };

      // Wrap each row's read+write operations in a transaction so that a
      // failed event insert cannot leave a loan without its audit event.
      const outcome = await db.transaction(async (tx) => {
        const existing = await tx.query.loans.findFirst({
          where: and(eq(loans.lenderId, lenderId), eq(loans.loanNumber, loanNumber)),
        });

        if (!existing) {
          // INSERT
          const [inserted] = await tx.insert(loans).values(incoming).returning({ id: loans.id });
          if (!inserted) throw new Error("Insert failed");

          await tx.insert(events).values({
            lenderId,
            caseId: inserted.id,
            type: "loan_imported",
            payload: {
              importRunId: run.id,
              filename,
              loanNumber,
              action: "inserted",
            },
          });

          return { outcome: "inserted" as RowOutcome, loanId: inserted.id };
        }

        // Compare fields to detect change — includes originalBalance
        const changed =
          existing.borrowerName !== incoming.borrowerName ||
          existing.borrowerEmail !== incoming.borrowerEmail ||
          existing.borrowerPhone !== incoming.borrowerPhone ||
          existing.propertyAddress !== incoming.propertyAddress ||
          parseFloat(existing.originalBalance ?? "0") !== parseFloat(incoming.originalBalance) ||
          parseFloat(existing.currentBalance ?? "0") !== parseFloat(incoming.currentBalance) ||
          parseFloat(existing.interestRate ?? "0") !== parseFloat(incoming.interestRate) ||
          existing.status !== incoming.status;

        if (changed) {
          await tx
            .update(loans)
            .set({
              ...incoming,
              updatedAt: sql`now()`,
            })
            .where(eq(loans.id, existing.id));

          if (existing.status !== incoming.status) {
            await tx.insert(events).values({
              lenderId,
              caseId: existing.id,
              type: "status_changed",
              payload: {
                importRunId: run.id,
                from: existing.status,
                to: incoming.status,
              },
            });
          } else {
            await tx.insert(events).values({
              lenderId,
              caseId: existing.id,
              type: "loan_imported",
              payload: {
                importRunId: run.id,
                filename,
                loanNumber,
                action: "updated",
              },
            });
          }

          return { outcome: "updated" as RowOutcome, loanId: existing.id };
        }

        return { outcome: "unchanged" as RowOutcome, loanId: existing.id };
      });

      outcomes.push({ ...outcome, rowIndex });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      outcomes.push({ outcome: "error", error: message, rowIndex });
    }
  }

  const inserted = outcomes.filter((o) => o.outcome === "inserted").length;
  const updated = outcomes.filter((o) => o.outcome === "updated").length;
  const unchanged = outcomes.filter((o) => o.outcome === "unchanged").length;
  const errors = outcomes.filter((o) => o.outcome === "error").length;

  // Update import run with final counters
  await db
    .update(importRuns)
    .set({
      inserted,
      updated,
      unchanged,
      errors,
      completedAt: sql`now()`,
    })
    .where(eq(importRuns.id, run.id));

  const errorDetails = outcomes
    .filter((o) => o.outcome === "error")
    .map((o) => ({ row: o.rowIndex, message: o.error ?? "unknown" }));

  return {
    runId: run.id,
    lenderId,
    filename,
    checksum,
    totalRows: data.length + parseErrors.length,
    inserted,
    updated,
    unchanged,
    errors,
    errorDetails,
  };
}
