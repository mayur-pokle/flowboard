import { NextResponse } from "next/server";
import { generateContent, type AIKeys, type BrandContext } from "@/lib/ai";
import { getSession } from "@/lib/session";
import type { Topic } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CompetitorInput {
  name?: string;
  url?: string;
  notes?: string;
}

interface RequestBody {
  topic: Topic;
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
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body?.topic?.title || !body?.topic?.targetKeyword) {
    return NextResponse.json(
      { error: "Missing topic.title or topic.targetKeyword" },
      { status: 400 }
    );
  }

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
    competitors: body.competitors
  };

  const primaryProviderHeader = req.headers.get("x-primary-provider");
  const keys: AIKeys = {
    openai: req.headers.get("x-openai-key") || undefined,
    gemini: req.headers.get("x-gemini-key") || undefined,
    anthropic: req.headers.get("x-anthropic-key") || undefined,
    openaiModel: req.headers.get("x-openai-model") || undefined,
    geminiModel: req.headers.get("x-gemini-model") || undefined,
    anthropicModel: req.headers.get("x-anthropic-model") || undefined,
    primaryProvider:
      primaryProviderHeader === "openai" ||
      primaryProviderHeader === "gemini" ||
      primaryProviderHeader === "anthropic" ||
      primaryProviderHeader === "auto"
        ? primaryProviderHeader
        : undefined
  };

  try {
    const result = await generateContent(body.topic, ctx, keys);
    const keysSeen = {
      openai: Boolean(process.env.OPENAI_API_KEY || keys.openai),
      gemini: Boolean(process.env.GEMINI_API_KEY || keys.gemini),
      anthropic: Boolean(
        process.env.ANTHROPIC_API_KEY || keys.anthropic
      )
    };
    return NextResponse.json({ ...result, keysSeen });
  } catch (err) {
    console.error("generate-content error:", err);
    return NextResponse.json(
      { error: (err as Error).message || "Failed to generate content" },
      { status: 500 }
    );
  }
}
