import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString =
  process.env["DATABASE_URL"] ?? "postgresql://localhost:5432/servicing_mini_dev";

// Singleton connection — safe for Next.js serverless routes
const globalForPg = globalThis as unknown as { pg: ReturnType<typeof postgres> | undefined };

const pg =
  globalForPg.pg ??
  postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });

if (process.env["NODE_ENV"] !== "production") {
  globalForPg.pg = pg;
}

export const db = drizzle(pg, { schema });
export type DB = typeof db;
