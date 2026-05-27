import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { settings, competitors } from "@/db/schema";
import { withAuth, serverError } from "@/lib/api";

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

export const GET = withAuth(async () => {
  try {
    const row = await ensureRow();
    const comps = await db
      .select()
      .from(competitors)
      .orderBy(desc(competitors.createdAt));
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
    await ensureRow();
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
    await db
      .update(settings)
      .set(patch)
      .where(eq(settings.id, SINGLETON_ID));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return serverError(err);
  }
});
