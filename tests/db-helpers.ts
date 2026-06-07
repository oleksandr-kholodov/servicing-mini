import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import path from "path";

const TEST_DB_URL =
  process.env["DATABASE_URL"] ?? "postgresql://localhost:5432/servicing_mini_test";

let _pg: ReturnType<typeof postgres> | undefined;
let _db: ReturnType<typeof drizzle<typeof schema>> | undefined;

export async function getTestDb() {
  if (_db) return _db;

  _pg = postgres(TEST_DB_URL, { max: 5 });
  _db = drizzle(_pg, { schema });

  // Run migrations on first access
  await migrate(_db, {
    migrationsFolder: path.resolve(process.cwd(), "src/lib/db/migrations"),
  });

  return _db;
}

export async function clearTestTables(db: ReturnType<typeof drizzle<typeof schema>>) {
  // Order matters due to FK constraints
  await db.execute(sql`TRUNCATE TABLE email_classifications, events, import_runs, loans, lenders RESTART IDENTITY CASCADE`);
}

export async function closeTestDb() {
  await _pg?.end();
  _pg = undefined;
  _db = undefined;
}

export async function seedTestLenders(db: ReturnType<typeof drizzle<typeof schema>>) {
  await db
    .insert(schema.lenders)
    .values([
      { id: "test-lender-a", name: "Test Lender A" },
      { id: "test-lender-b", name: "Test Lender B" },
    ])
    .onConflictDoUpdate({
      target: schema.lenders.id,
      set: { name: schema.lenders.name },
    });
}
