import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { importLoanTape } from "../src/lib/import/loan-import";
import * as dotenv from "dotenv";
import path from "path";
import fs from "fs";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

// We need a version of db that matches what importLoanTape expects
import * as schema from "../src/lib/db/schema";

const connectionString =
  process.env["DATABASE_URL"] ?? "postgresql://localhost:5432/servicing_mini_dev";

async function main() {
  const pg = postgres(connectionString, { max: 1 });
  const db = drizzle(pg, { schema });

  console.log("Seeding lenders…");

  await db
    .insert(schema.lenders)
    .values([
      { id: "acme-mortgage", name: "Acme Mortgage Corp" },
      { id: "beacon-lending", name: "Beacon Lending LLC" },
    ])
    .onConflictDoUpdate({
      target: schema.lenders.id,
      set: { name: schema.lenders.name },
    });

  console.log("Seeding loans from samples/loans-v1.csv (acme-mortgage)…");
  const v1 = fs.readFileSync(path.resolve(process.cwd(), "samples/loans-v1.csv"), "utf8");
  const r1 = await importLoanTape(db as any, v1, "loans-v1.csv", "acme-mortgage");
  console.log("  acme-mortgage:", r1);

  console.log("Seeding loans from samples/loans-beacon.csv (beacon-lending)…");
  const vb = fs.readFileSync(path.resolve(process.cwd(), "samples/loans-beacon.csv"), "utf8");
  const rb = await importLoanTape(db as any, vb, "loans-beacon.csv", "beacon-lending");
  console.log("  beacon-lending:", rb);

  console.log("Seed complete.");
  await pg.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
