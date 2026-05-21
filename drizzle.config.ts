// Load .env.local before reading process.env. drizzle-kit only auto-loads .env,
// not .env.local, so we explicitly use Next's loader for parity with `next dev`.
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import type { Config } from "drizzle-kit";

const url =
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL ||
  "";

if (!url) {
  console.warn(
    "[drizzle] No Postgres URL found. Set POSTGRES_URL in .env.local or .env."
  );
}

export default {
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true
} satisfies Config;
