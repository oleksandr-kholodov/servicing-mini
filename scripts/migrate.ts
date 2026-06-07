import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const connectionString =
  process.env["DATABASE_URL"] ?? "postgresql://localhost:5432/servicing_mini_dev";

async function main() {
  console.log("Running migrations against:", connectionString.replace(/\/\/.*@/, "//***@"));

  const pg = postgres(connectionString, { max: 1 });
  const db = drizzle(pg);

  await migrate(db, { migrationsFolder: "./src/lib/db/migrations" });
  console.log("Migrations complete.");

  await pg.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
