import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { settings, competitors } from "@/db/schema";
import { withAuth, serverError } from "@/lib/api";
import { ensureSchema, isSchemaError } from "@/lib/migrate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SINGLETON_ID = "workspace";

const defaults = {
  id: SINGLETON_ID,
  companyName: "",
  websiteUrl: "",
  brandNiche: "B2B SaaS for finance teams",
  brandAudience:
    "CFOs, controllers, and finance ops leaders at startups",
  productDescription: "",
  valueProposition: "",
  brandVoice: "Professional, helpful, and direct — no fluff",
  primaryCta: "Book a 20-min demo",
  primaryGeo: "United States",
  seedKeywords: "",
  topicsToAvoid: "",
  openaiModel: "gpt-4o-mini",
  geminiModel: "gemini-2.0-flash",
  anthropicModel: "claude-haiku-4-5",
  primaryProvider: "auto"
};

async function ensureRow() {
  const [existing] = await db
    .select()
    .from(settings)
    .where(eq(settings.id, SINGLETON_ID))
    .limit(1);
  if (existing) return existing;
  const [inserted] = await db
    .insert(settings)
    .values(defaults)
    .returning();
  return inserted;
}

// Helper that runs `fn`, and if it fails with a schema-drift error
// (e.g. column or table doesn't exist on the live DB), runs the
// idempotent migrate routine and retries once. This makes the Settings
// page self-heal after a schema change ships without the operator
// needing to remember to run `db:push`.
async function withSchemaSelfHeal<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isSchemaError(err)) throw err;
    console.warn(
      "[settings] schema drift detected, running auto-migrate:",
      (err as Error).message
    );
    await ensureSchema({ force: true });
    return await fn();
  }
}

export const GET = withAuth(async () => {
  try {
    // Eager pass: catches the live DB up to the latest schema BEFORE we
    // query, so a stale Neon won't blow up the very first read after a
    // deploy. After the first successful call per server lifetime this
    // is a no-op (see alreadyRan in lib/migrate.ts).
    await ensureSchema().catch((e) =>
      console.warn("[settings] eager migrate failed (continuing):", e)
    );
    const { row, comps } = await withSchemaSelfHeal(async () => {
      const row = await ensureRow();
      const comps = await db
        .select()
        .from(competitors)
        .orderBy(desc(competitors.createdAt));
      return { row, comps };
    });
    // AI keys + Slack are NOT exposed via the DB — they live in server env.
    return NextResponse.json({
      settings: { ...row, competitors: comps },
      // Hint to client about server-side config.
      serverConfigured: {
        openaiKey: Boolean(process.env.OPENAI_API_KEY),
        geminiKey: Boolean(process.env.GEMINI_API_KEY),
        anthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
        slackWebhook: Boolean(process.env.SLACK_WEBHOOK_URL)
      }
    });
  } catch (err) {
    return serverError(err);
  }
});

export const PATCH = withAuth(async (_user, req) => {
  try {
    const body = await req.json();
    const allowed = [
      "companyName",
      "websiteUrl",
      "brandNiche",
      "brandAudience",
      "productDescription",
      "valueProposition",
      "brandVoice",
      "primaryCta",
      "primaryGeo",
      "seedKeywords",
      "topicsToAvoid",
      "openaiModel",
      "geminiModel",
      "anthropicModel",
      "primaryProvider"
    ] as const;
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const k of allowed) {
      if (typeof body[k] === "string") patch[k] = body[k];
    }
    if (body.lastGeneratedAt) {
      patch.lastGeneratedAt = new Date(body.lastGeneratedAt);
    }
    await withSchemaSelfHeal(async () => {
      await ensureRow();
      await db
        .update(settings)
        .set(patch)
        .where(eq(settings.id, SINGLETON_ID));
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return serverError(err);
  }
});
