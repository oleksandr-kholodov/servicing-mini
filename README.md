# Servicing Copilot — Portfolio Demo

AI-ops for private mortgage servicers. Built as a portfolio piece for the **Servicing Copilot** contract, demonstrating production-grade patterns across a full-stack TypeScript codebase.

**Stack**: Next.js 15 (App Router) · TypeScript · PostgreSQL · Drizzle ORM · Tailwind · Vitest · Zod

**Live demo**: _<add Vercel URL after deploy>_

---

## How to use the demo (2 minutes)

1. Open **Cases** — a list of loans. Switch the lender dropdown (Acme ↔ Beacon) to see per-tenant isolation.
2. Click a loan → **View** — loan detail, an append-only **event timeline**, and a **Classify Email** box. Paste any borrower email; the model returns a structured intent + confidence + summary.
3. Open **Import** — upload `loans-v2.csv`. You'll see counts: **inserted / updated / unchanged**. Import the **same file again** → everything is **unchanged** (idempotent, no duplicates).
4. Hit **Reset demo data** on the Import page anytime to return to the clean baseline (10 Acme + 5 Beacon loans).

---

## Quick Start

### Option A — Local Postgres (recommended for this demo)

```bash
# 1. Install deps
pnpm install

# 2. Create databases (once)
createdb servicing_mini_dev
createdb servicing_mini_test

# 3. Copy env
cp .env.example .env.local
# Edit DATABASE_URL if your Postgres isn't at localhost:5432

# 4. Migrate + seed
pnpm db:migrate
pnpm db:seed

# 5. Run
pnpm dev
# → http://localhost:3000
```

### Option B — Docker

```bash
docker compose up -d        # starts Postgres on port 5434
# then set DATABASE_URL=postgresql://postgres:postgres@localhost:5434/servicing_mini_dev
pnpm db:migrate && pnpm db:seed
pnpm dev
```

---

## Quality Gates

| Gate | Result |
|------|--------|
| `pnpm typecheck` | 0 errors |
| `pnpm lint` | 0 errors |
| `pnpm test` | 29/29 passed |
| `pnpm eval` | 12/12 = 100% (stub) |
| `pnpm build` | success |

---

## Features

### 1. Idempotent Loan Tape Import

Upload a CSV of loans. Re-upload the same file → zero duplicates. Upload a corrected version → only changed rows are updated.

**Audit**: every import creates an `import_runs` record with counters: inserted / updated / unchanged / errors.

Demo: upload `samples/loans-v1.csv`, then `samples/loans-v2.csv`. The second run will show updated rows (balances changed, one status changed) and one new loan.

### 2. Case Screen

Loan detail + borrower info + append-only event timeline. Current state is derived from the event log, not a mutable status column (the status column is a cached projection for query efficiency, but the authoritative history is events).

### 3. LLM Email Classification

Paste a borrower email → structured classification:

```json
{
  "intent": "promise_to_pay",
  "extracted": { "promised_date": "2026-07-01", "promised_amount": 1500 },
  "confidence": 0.92,
  "summary": "Borrower promises payment of $1,500 by July 1st."
}
```

### 4. Append-Only Event Log

`events` table is insert-only. Events: `loan_imported`, `email_classified`, `status_changed`. The case timeline renders from events in `created_at` order.

### 5. Multi-Tenant by lender_id

Every table has `lender_id`. Every query is scoped. Two seed lenders: `acme-mortgage` and `beacon-lending`.

---

## Eval Harness

```bash
pnpm eval                          # stub provider (deterministic, no keys)
LLM_PROVIDER=anthropic pnpm eval   # real Claude Haiku
LLM_PROVIDER=openai pnpm eval      # real GPT-4o-mini
```

Outputs per-case results, per-intent accuracy, and a confusion matrix.

---

## Design Decisions

### Natural Key for Idempotency (not content hash)

The natural key is `(lender_id, loan_number)`. This is the right anchor because:

- `loan_number` is the real-world identifier — it appears on statements, legal docs, and servicer correspondence. Lenders import files using it; they think in terms of it.
- A **content hash** key (SHA-256 of the row) would insert a **new row** on any field change, making every import an append. You'd need a separate dedup step to find "the current version" — that complexity belongs in the import layer, not scattered across queries.
- A **surrogate key with a hash lookup** adds indirection with no benefit when the natural key is already stable and meaningful.

The `import_runs` table captures a SHA-256 of the full file for audit, but the per-row idempotency key is the natural key.

### Multi-Tenancy via lender_id Scoping (not RLS)

Every table has a `lender_id` column. All queries include `WHERE lender_id = ?` at the application layer.

**When I'd use Row-Level Security instead**: if the same Postgres connection pool serves multiple tenants and there's a risk of a missing WHERE clause leaking data (e.g., ORM auto-generated queries, ad-hoc admin scripts). RLS makes the guard database-enforced rather than convention-enforced.

For this codebase (small team, single app, explicit Drizzle queries), application-level scoping is simpler, testable (see `multitenancy.test.ts`), and avoids the `SET app.lender_id` session variable dance that RLS requires with connection pools.

### LLM Reliability Strategy

**Schema-first**: Zod schema is the contract. The LLM is forced into it via tool_use (Anthropic) or structured outputs (OpenAI). The schema `strip()`s extra fields by default — hallucinated keys can't leak into the database.

**Retry on parse failure**: up to 2 retries on invalid JSON or schema mismatch. Most LLM failures are transient.

**Graceful fallback**: if all retries fail, return `intent=other, needs_review=true` with the raw response logged. The case is flagged for human review; the application never crashes.

**Stub provider for testability**: `StubClassifier` is deterministic, instant, and requires no API key. This is not a test-only hack — it's the default for local dev and CI. The `LlmClassifier` interface means the business logic (persist classification, emit event) is tested against the same interface the real providers use. The eval harness runs on stub without cost; run it with a real key to validate the real provider against the same golden set.

### Event Sourcing (lite)

The `events` table is append-only: insert only, no updates or deletes, ever. The event timeline is the authoritative history of what happened to a case.

The loan status column is a **cached projection** — it's updated on import for query convenience, but the `status_changed` event is the record of what actually changed and when. If the projection ever diverges from history, history wins.

I didn't go full event sourcing (aggregate rebuild from events on every read) because:
1. The aggregate is small (a loan has ~10 fields) and changes infrequently
2. The primary use case is showing history, not computing derived state
3. Full ES would require snapshot tables, version vectors, and conflict resolution — premature for this scope

---

## Trade-offs / What I'd Do Next

| Area | Current | Next step |
|------|---------|-----------|
| Auth | None (lenderId from query param) | JWT + lender claim; middleware validates on every request |
| Rate limiting | Best-effort in-memory per-client cap on `/api/classify` (protects free-tier LLM quota) | Shared store (Redis/Upstash) for a strict global limit across serverless instances |
| Import streaming | Full file in memory | Stream CSV rows; handle files > 100 MB |
| Eval with real LLM | Manual `LLM_PROVIDER=anthropic pnpm eval` | CI job that runs eval weekly, alerts on accuracy drop |
| RLS | App-layer scoping | PostgreSQL RLS when adding direct DB access for data analysts |
| Classification history | Single "latest" query | Timeline of all classifications per case (schema already supports it) |
| Webhook on classification | Not implemented | POST to lender webhook when `needs_review=true` |
