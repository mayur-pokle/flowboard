// ── Self-healing schema migrations ────────────────────────────────────
//
// Runs idempotent DDL to catch the production database up to the
// current `db/schema.ts`. Designed to be called:
//
//   1. Manually via POST /api/admin/migrate (signed-in users only)
//   2. Automatically by `/api/settings` GET/PATCH if a query fails with
//      "column does not exist" / "relation does not exist"
//
// All statements use IF NOT EXISTS, so calling this repeatedly is safe
// — at worst it's a no-op. We swallow per-statement errors so one bad
// row doesn't block the rest of the migration.

import { sql } from "@vercel/postgres";

// Tracks whether we've already run during this server's lifetime, so we
// don't hammer Postgres with the same DDL on every request once the
// schema is in sync.
let alreadyRan = false;

export interface MigrateResult {
  ran: number;
  failed: Array<{ statement: string; error: string }>;
}

// Each entry is a self-contained DDL statement we expect to be safe to
// run repeatedly. We don't wrap them in a transaction — if one fails
// (e.g. partial state from a half-applied push), the rest should still
// proceed.
const STATEMENTS: string[] = [
  // ── meta (used by other features + bootstrap flag) ──
  `CREATE TABLE IF NOT EXISTS "meta" (
    "key" text PRIMARY KEY,
    "value" text NOT NULL,
    "updatedAt" timestamp DEFAULT now() NOT NULL
  )`,

  // ── settings columns ──
  `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "anthropicModel" text NOT NULL DEFAULT 'claude-haiku-4-5'`,
  `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "primaryProvider" text NOT NULL DEFAULT 'auto'`,
  `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "openaiModel" text NOT NULL DEFAULT 'gpt-4o-mini'`,
  `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "geminiModel" text NOT NULL DEFAULT 'gemini-2.0-flash'`,
  `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "companyName" text NOT NULL DEFAULT ''`,
  `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "websiteUrl" text NOT NULL DEFAULT ''`,
  `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "brandNiche" text NOT NULL DEFAULT ''`,
  `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "brandAudience" text NOT NULL DEFAULT ''`,
  `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "productDescription" text NOT NULL DEFAULT ''`,
  `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "valueProposition" text NOT NULL DEFAULT ''`,
  `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "brandVoice" text NOT NULL DEFAULT ''`,
  `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "primaryCta" text NOT NULL DEFAULT ''`,
  `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "primaryGeo" text NOT NULL DEFAULT ''`,
  `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "seedKeywords" text NOT NULL DEFAULT ''`,
  `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "topicsToAvoid" text NOT NULL DEFAULT ''`,
  `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "lastGeneratedAt" timestamp`,
  `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "updatedAt" timestamp DEFAULT now() NOT NULL`,

  // ── competitors columns ──
  `ALTER TABLE "competitors" ADD COLUMN IF NOT EXISTS "tier" text NOT NULL DEFAULT 'secondary'`,
  `ALTER TABLE "competitors" ADD COLUMN IF NOT EXISTS "notes" text NOT NULL DEFAULT ''`,

  // ── topics columns (cannibalization + impact scoring) ──
  `ALTER TABLE "topics" ADD COLUMN IF NOT EXISTS "intent" text`,
  `ALTER TABLE "topics" ADD COLUMN IF NOT EXISTS "impactScore" integer`,
  `ALTER TABLE "topics" ADD COLUMN IF NOT EXISTS "noveltyScore" integer`,
  `ALTER TABLE "topics" ADD COLUMN IF NOT EXISTS "overlapWithUrl" text`,
  `ALTER TABLE "topics" ADD COLUMN IF NOT EXISTS "overlapWithTitle" text`,
  `ALTER TABLE "topics" ADD COLUMN IF NOT EXISTS "competitorGap" text`,
  `ALTER TABLE "topics" ADD COLUMN IF NOT EXISTS "rankingPotential" text`,
  `ALTER TABLE "topics" ADD COLUMN IF NOT EXISTS "businessImpact" text`,
  `ALTER TABLE "topics" ADD COLUMN IF NOT EXISTS "createdByUserId" text`,

  // ── tasks columns (per-article performance) ──
  `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "publishedUrl" text`,
  `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "publishedUrlMetrics" jsonb`,
  `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "contentStatus" text NOT NULL DEFAULT 'not_started'`,
  `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "content" jsonb`,
  `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "contentVersions" jsonb`,
  `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "tags" text[] NOT NULL DEFAULT '{}'`,
  `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "createdByUserId" text`,

  // ── deletedTopicHashes / movedTopicHashes ──
  `CREATE TABLE IF NOT EXISTS "deletedTopicHashes" (
    "hash" text PRIMARY KEY,
    "createdAt" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "movedTopicHashes" (
    "hash" text PRIMARY KEY,
    "createdAt" timestamp DEFAULT now() NOT NULL
  )`,

  // ── keywords ──
  `CREATE TABLE IF NOT EXISTS "keywords" (
    "id" text PRIMARY KEY,
    "keyword" text NOT NULL,
    "priority" text NOT NULL DEFAULT 'P1',
    "intent" text NOT NULL DEFAULT 'informational',
    "status" text NOT NULL DEFAULT 'targeting',
    "searchVolume" integer,
    "difficulty" integer,
    "targetUrl" text,
    "notes" text NOT NULL DEFAULT '',
    "createdAt" timestamp DEFAULT now() NOT NULL,
    "updatedAt" timestamp DEFAULT now() NOT NULL
  )`,

  // ── existingContent ──
  `CREATE TABLE IF NOT EXISTS "existingContent" (
    "id" text PRIMARY KEY,
    "url" text NOT NULL,
    "title" text NOT NULL,
    "targetKeyword" text NOT NULL DEFAULT '',
    "intent" text NOT NULL DEFAULT '',
    "publishedDate" timestamp,
    "notes" text NOT NULL DEFAULT '',
    "embedding" jsonb,
    "sourceSitemapUrl" text,
    "enrichedAt" timestamp,
    "createdAt" timestamp DEFAULT now() NOT NULL
  )`,
  `ALTER TABLE "existingContent" ADD COLUMN IF NOT EXISTS "sourceSitemapUrl" text`,
  `ALTER TABLE "existingContent" ADD COLUMN IF NOT EXISTS "enrichedAt" timestamp`,
  `ALTER TABLE "existingContent" ADD COLUMN IF NOT EXISTS "embedding" jsonb`,
  `ALTER TABLE "existingContent" ADD COLUMN IF NOT EXISTS "intent" text NOT NULL DEFAULT ''`,
  `ALTER TABLE "existingContent" ADD COLUMN IF NOT EXISTS "targetKeyword" text NOT NULL DEFAULT ''`,
  `ALTER TABLE "existingContent" ADD COLUMN IF NOT EXISTS "notes" text NOT NULL DEFAULT ''`,
  `ALTER TABLE "existingContent" ADD COLUMN IF NOT EXISTS "publishedDate" timestamp`,

  // ── taskComments ──
  `CREATE TABLE IF NOT EXISTS "taskComments" (
    "id" text PRIMARY KEY,
    "taskId" text NOT NULL,
    "body" text NOT NULL,
    "authorEmail" text NOT NULL DEFAULT '',
    "authorName" text NOT NULL DEFAULT '',
    "createdAt" timestamp DEFAULT now() NOT NULL,
    "updatedAt" timestamp DEFAULT now() NOT NULL
  )`,

  // ── sourceConfigs ──
  `CREATE TABLE IF NOT EXISTS "sourceConfigs" (
    "name" text PRIMARY KEY,
    "status" text NOT NULL DEFAULT 'disconnected',
    "encryptedCredentials" text,
    "metadata" jsonb,
    "lastError" text,
    "lastSyncedAt" timestamp,
    "connectedAt" timestamp,
    "updatedAt" timestamp DEFAULT now() NOT NULL
  )`,

  // ── discoveredOpportunities ──
  `CREATE TABLE IF NOT EXISTS "discoveredOpportunities" (
    "id" text PRIMARY KEY,
    "source" text NOT NULL,
    "query" text NOT NULL,
    "url" text,
    "metrics" jsonb,
    "score" integer NOT NULL DEFAULT 0,
    "status" text NOT NULL DEFAULT 'new',
    "reason" text,
    "movedToTaskId" text,
    "dedupKey" text NOT NULL UNIQUE,
    "createdAt" timestamp DEFAULT now() NOT NULL,
    "updatedAt" timestamp DEFAULT now() NOT NULL
  )`,
  // ── discoveredOpportunities: CRM workflow + breakdown columns ──
  `ALTER TABLE "discoveredOpportunities" ADD COLUMN IF NOT EXISTS "scoreBreakdown" jsonb`,
  `ALTER TABLE "discoveredOpportunities" ADD COLUMN IF NOT EXISTS "intent" text`,
  `ALTER TABLE "discoveredOpportunities" ADD COLUMN IF NOT EXISTS "aiCitationGap" boolean NOT NULL DEFAULT false`,
  `ALTER TABLE "discoveredOpportunities" ADD COLUMN IF NOT EXISTS "briefMarkdown" text`,
  `ALTER TABLE "discoveredOpportunities" ADD COLUMN IF NOT EXISTS "briefGeneratedAt" timestamp`,
  `ALTER TABLE "discoveredOpportunities" ADD COLUMN IF NOT EXISTS "contentMarkdown" text`,
  `ALTER TABLE "discoveredOpportunities" ADD COLUMN IF NOT EXISTS "contentGeneratedAt" timestamp`,
  `ALTER TABLE "discoveredOpportunities" ADD COLUMN IF NOT EXISTS "qualitySignals" jsonb`,
  `ALTER TABLE "discoveredOpportunities" ADD COLUMN IF NOT EXISTS "linkedTaskId" text`
];

// Run all statements. Each one is wrapped in its own try/catch so a
// single failure (e.g. column-already-exists on a different code path)
// doesn't abort the rest. Returns counts so the migrate endpoint can
// surface a useful summary.
export async function ensureSchema(opts: { force?: boolean } = {}): Promise<MigrateResult> {
  if (alreadyRan && !opts.force) {
    return { ran: 0, failed: [] };
  }
  let ran = 0;
  const failed: MigrateResult["failed"] = [];
  for (const stmt of STATEMENTS) {
    try {
      // @vercel/postgres `sql.query` accepts a raw string.
      await sql.query(stmt);
      ran += 1;
    } catch (err) {
      const msg = (err as Error).message || String(err);
      // Postgres throws SQLSTATE 42701 (duplicate_column) for ADD
      // COLUMN IF NOT EXISTS races — those are harmless. Same for
      // duplicate_object on CREATE TABLE IF NOT EXISTS.
      if (
        /already exists/i.test(msg) ||
        /duplicate_column/i.test(msg) ||
        /42701/.test(msg)
      ) {
        ran += 1;
        continue;
      }
      failed.push({
        statement: stmt.split("\n")[0].trim().slice(0, 120),
        error: msg
      });
    }
  }
  alreadyRan = failed.length === 0;
  return { ran, failed };
}

// Heuristic — does this error look like schema drift we can fix?
// Postgres SQLSTATE codes:
//   42703 = undefined_column
//   42P01 = undefined_table
export function isSchemaError(err: unknown): boolean {
  const msg = ((err as Error)?.message || String(err)).toLowerCase();
  return (
    msg.includes("does not exist") ||
    msg.includes("42703") ||
    msg.includes("42p01") ||
    msg.includes("undefined_column") ||
    msg.includes("undefined_table")
  );
}
