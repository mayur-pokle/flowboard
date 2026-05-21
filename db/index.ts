import { sql } from "@vercel/postgres";
import { drizzle } from "drizzle-orm/vercel-postgres";
import * as schema from "./schema";

// Drizzle client backed by Vercel Postgres (Neon). Reads POSTGRES_URL from env.
// Use a singleton in dev to avoid exhausting connections during HMR.
declare global {
  // eslint-disable-next-line no-var
  var __flowboard_db: ReturnType<typeof drizzle<typeof schema>> | undefined;
}

export const db =
  globalThis.__flowboard_db ?? drizzle(sql, { schema });

if (process.env.NODE_ENV !== "production") {
  globalThis.__flowboard_db = db;
}

export { schema };
