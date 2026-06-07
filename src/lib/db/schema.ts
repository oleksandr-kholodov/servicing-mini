import {
  pgTable,
  text,
  integer,
  numeric,
  timestamp,
  jsonb,
  uuid,
  pgEnum,
  unique,
  index,
  boolean,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const loanStatusEnum = pgEnum("loan_status", [
  "current",
  "delinquent",
  "in_forbearance",
  "paid_off",
  "foreclosure",
]);

export const eventTypeEnum = pgEnum("event_type", [
  "loan_imported",
  "email_classified",
  "status_changed",
]);

export const intentEnum = pgEnum("intent", [
  "promise_to_pay",
  "dispute",
  "hardship",
  "wrong_contact",
  "renewal_request",
  "other",
]);

// ---------------------------------------------------------------------------
// Lenders — top-level tenant entity
// ---------------------------------------------------------------------------

export const lenders = pgTable("lenders", {
  id: text("id").primaryKey(), // e.g. "acme-mortgage"
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

// ---------------------------------------------------------------------------
// Loans — natural key: (lender_id, loan_number)
// Idempotent upsert target: same natural key → update if changed
// ---------------------------------------------------------------------------

export const loans = pgTable(
  "loans",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    lenderId: text("lender_id")
      .notNull()
      .references(() => lenders.id),
    loanNumber: text("loan_number").notNull(),

    // Borrower
    borrowerName: text("borrower_name").notNull(),
    borrowerEmail: text("borrower_email"),
    borrowerPhone: text("borrower_phone"),

    // Loan details
    propertyAddress: text("property_address").notNull(),
    originalBalance: numeric("original_balance", { precision: 14, scale: 2 }).notNull(),
    currentBalance: numeric("current_balance", { precision: 14, scale: 2 }).notNull(),
    interestRate: numeric("interest_rate", { precision: 6, scale: 4 }).notNull(),
    originationDate: text("origination_date").notNull(), // stored as ISO date string
    maturityDate: text("maturity_date").notNull(),
    status: loanStatusEnum("status").notNull().default("current"),

    // Audit
    importedAt: timestamp("imported_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    // Natural key — the idempotency anchor
    unique("loans_natural_key").on(t.lenderId, t.loanNumber),
    index("loans_lender_idx").on(t.lenderId),
  ]
);

// ---------------------------------------------------------------------------
// Import runs — full audit trail for each CSV upload
// ---------------------------------------------------------------------------

export const importRuns = pgTable(
  "import_runs",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    lenderId: text("lender_id")
      .notNull()
      .references(() => lenders.id),
    filename: text("filename").notNull(),
    checksum: text("checksum").notNull(), // SHA-256 of file content
    uploadedBy: text("uploaded_by").notNull().default("ui"),

    // Row-level outcome counters
    totalRows: integer("total_rows").notNull().default(0),
    inserted: integer("inserted").notNull().default(0),
    updated: integer("updated").notNull().default(0),
    unchanged: integer("unchanged").notNull().default(0),
    errors: integer("errors").notNull().default(0),

    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [index("import_runs_lender_idx").on(t.lenderId)]
);

// ---------------------------------------------------------------------------
// Events — append-only log; state is derived from here
// Immutable after insert; no update/delete ever.
// ---------------------------------------------------------------------------

export const events = pgTable(
  "events",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    lenderId: text("lender_id")
      .notNull()
      .references(() => lenders.id),
    caseId: uuid("case_id")
      .notNull()
      .references(() => loans.id),
    type: eventTypeEnum("type").notNull(),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("events_case_idx").on(t.caseId),
    index("events_lender_idx").on(t.lenderId),
    index("events_created_at_idx").on(t.createdAt),
  ]
);

// ---------------------------------------------------------------------------
// Email classifications — persisted result of LLM classification
// ---------------------------------------------------------------------------

export const emailClassifications = pgTable(
  "email_classifications",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    lenderId: text("lender_id")
      .notNull()
      .references(() => lenders.id),
    caseId: uuid("case_id")
      .notNull()
      .references(() => loans.id),
    rawText: text("raw_text").notNull(),
    intent: intentEnum("intent").notNull(),
    promisedDate: text("promised_date"),
    promisedAmount: numeric("promised_amount", { precision: 14, scale: 2 }),
    confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull(),
    summary: text("summary").notNull(),
    needsReview: boolean("needs_review").notNull().default(false),
    rawResponse: jsonb("raw_response"),
    provider: text("provider").notNull().default("stub"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("email_class_case_idx").on(t.caseId),
    index("email_class_lender_idx").on(t.lenderId),
  ]
);
