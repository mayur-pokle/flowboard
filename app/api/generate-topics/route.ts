import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import {
  generateTopics,
  type AIKeys,
  type BrandContext,
  type ExistingContentCtx,
  type PriorityKeywordCtx,
  type TieredCompetitor
} from "@/lib/ai";
import { db } from "@/db";
import { keywords, existingContent, competitors } from "@/db/schema";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CompetitorInput {
  name?: string;
  url?: string;
  notes?: string;
  tier?: "primary" | "secondary" | "watch";
}

interface RequestBody {
  count?: number;
  brandNiche?: string;
  brandAudience?: string;
  companyName?: string;
  websiteUrl?: string;
  productDescription?: string;
  valueProposition?: string;
  brandVoice?: string;
  primaryCta?: string;
  primaryGeo?: string;
  competitors?: Array<CompetitorInput | string>;
  seedKeywords?: string[];
  topicsToAvoid?: string[];
  recentTitles?: string[];
}

function parseList(s?: string): string[] | undefined {
  if (!s) return undefined;
  return s
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

// Read priority keywords + existing content + tiered competitors from the
// DB. We don't trust client input for these — having them server-side keeps
// the cron job (where no client is involved) using the same context.
async function loadDbContext() {
  const [kwRows, ecRows, compRows] = await Promise.all([
    db.select().from(keywords),
    db.select().from(existingContent).orderBy(desc(existingContent.createdAt)),
    db.select().from(competitors)
  ]);
  const priorityKeywords: PriorityKeywordCtx[] = kwRows
    // Skip "abandoned" — the user has decided not to chase those.
    .filter((k) => k.status !== "abandoned")
    .map((k) => ({
      keyword: k.keyword,
      priority: (k.priority === "P0" || k.priority === "P2"
        ? k.priority
        : "P1") as "P0" | "P1" | "P2",
      intent: k.intent as PriorityKeywordCtx["intent"]
    }));
  const existingItems: ExistingContentCtx[] = ecRows.map((c) => ({
    url: c.url,
    title: c.title,
    targetKeyword: c.targetKeyword || undefined,
    intent: c.intent || undefined
  }));
  const tieredCompetitors: TieredCompetitor[] = compRows.map((c) => ({
    name: c.name || undefined,
    url: c.url || undefined,
    notes: c.notes || undefined,
    tier:
      c.tier === "primary" || c.tier === "watch"
        ? (c.tier as "primary" | "watch")
        : "secondary"
  }));
  return { priorityKeywords, existingItems, tieredCompetitors };
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: RequestBody = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine */
  }

  const count = Math.max(1, Math.min(20, Number(body.count) || 8));

  // Pull priority keywords, existing content, and tiered competitors from DB.
  // These are the new cannibalization-prevention inputs.
  const { priorityKeywords, existingItems, tieredCompetitors } =
    await loadDbContext();

  // Prefer DB competitors (with tier) over whatever the client sent — the DB
  // is the source of truth. Only fall back to client input or env if DB is empty.
  const competitorsForCtx =
    tieredCompetitors.length > 0
      ? tieredCompetitors
      : body.competitors || parseList(process.env.BRAND_COMPETITORS);

  const ctx: BrandContext = {
    niche: body.brandNiche || process.env.BRAND_NICHE || "B2B SaaS for finance teams",
    audience:
      body.brandAudience ||
      process.env.BRAND_AUDIENCE ||
      "CFOs, controllers, and finance ops leaders at startups",
    companyName: body.companyName || process.env.BRAND_COMPANY_NAME,
    websiteUrl: body.websiteUrl || process.env.BRAND_WEBSITE_URL,
    productDescription:
      body.productDescription || process.env.BRAND_PRODUCT_DESCRIPTION,
    valueProposition:
      body.valueProposition || process.env.BRAND_VALUE_PROPOSITION,
    brandVoice: body.brandVoice || process.env.BRAND_VOICE,
    primaryCta: body.primaryCta || process.env.BRAND_PRIMARY_CTA,
    primaryGeo: body.primaryGeo || process.env.BRAND_PRIMARY_GEO,
    competitors: competitorsForCtx,
    seedKeywords:
      body.seedKeywords || parseList(process.env.BRAND_SEED_KEYWORDS),
    topicsToAvoid:
      body.topicsToAvoid || parseList(process.env.BRAND_TOPICS_TO_AVOID),
    recentTitles: body.recentTitles,
    priorityKeywords,
    existingContent: existingItems
  };

  const primaryProviderHeader = req.headers.get("x-primary-provider");
  const keys: AIKeys = {
    openai: req.headers.get("x-openai-key") || undefined,
    gemini: req.headers.get("x-gemini-key") || undefined,
    openaiModel: req.headers.get("x-openai-model") || undefined,
    geminiModel: req.headers.get("x-gemini-model") || undefined,
    primaryProvider:
      primaryProviderHeader === "openai" ||
      primaryProviderHeader === "gemini" ||
      primaryProviderHeader === "auto"
        ? primaryProviderHeader
        : undefined
  };

  try {
    const result = await generateTopics(ctx, count, keys);
    const keysSeen = {
      openai: Boolean(process.env.OPENAI_API_KEY || keys.openai),
      gemini: Boolean(process.env.GEMINI_API_KEY || keys.gemini)
    };
    return NextResponse.json({ ...result, keysSeen });
  } catch (err) {
    console.error("generate-topics error:", err);
    return NextResponse.json(
      { error: (err as Error).message || "Failed to generate topics" },
      { status: 500 }
    );
  }
}
