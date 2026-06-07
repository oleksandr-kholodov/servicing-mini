import * as dotenv from "dotenv";
import path from "path";

// Use test database
process.env["DATABASE_URL"] = "postgresql://localhost:5432/servicing_mini_test";
process.env["LLM_PROVIDER"] = "stub";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
