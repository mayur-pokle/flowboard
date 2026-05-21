import { NextResponse } from "next/server";
import { generateTopics, type AIKeys, type BrandContext } from "@/lib/ai";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CompetitorInput {
  name?: string;
  url?: string;
  notes?: string;
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
    competitors:
      body.competitors ||
      parseList(process.env.BRAND_COMPETITORS),
    seedKeywords:
      body.seedKeywords || parseList(process.env.BRAND_SEED_KEYWORDS),
    topicsToAvoid:
      body.topicsToAvoid || parseList(process.env.BRAND_TOPICS_TO_AVOID),
    recentTitles: body.recentTitles
  };

  const keys: AIKeys = {
    openai: req.headers.get("x-openai-key") || undefined,
    gemini: req.headers.get("x-gemini-key") || undefined,
    openaiModel: req.headers.get("x-openai-model") || undefined,
    geminiModel: req.headers.get("x-gemini-model") || undefined
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
