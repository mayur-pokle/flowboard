import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  settings,
  competitors as competitorsTable
} from "@/db/schema";
import { withAuth, serverError } from "@/lib/api";
import { suggestCitationsConfig } from "@/lib/citations-suggester";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/sources/ai-citations/suggest
// Reads workspace context and returns pre-filled values for the three
// AI Citations Tracker form fields. Client applies + reviews + saves —
// no DB write here.
export const POST = withAuth(async () => {
  try {
    const [brandRow] = await db
      .select()
      .from(settings)
      .where(eq(settings.id, "workspace"))
      .limit(1);
    const compRows = await db.select().from(competitorsTable);

    const result = await suggestCitationsConfig(
      {
        brand: {
          companyName: brandRow?.companyName || undefined,
          websiteUrl: brandRow?.websiteUrl || undefined,
          brandNiche: brandRow?.brandNiche || undefined,
          brandAudience: brandRow?.brandAudience || undefined,
          productDescription: brandRow?.productDescription || undefined,
          valueProposition: brandRow?.valueProposition || undefined,
          primaryCta: brandRow?.primaryCta || undefined,
          seedKeywords: brandRow?.seedKeywords || undefined
        },
        competitors: compRows.map((c) => ({
          name: c.name,
          url: c.url,
          tier: c.tier
        })),
        desiredPromptCount: 15
      },
      {
        gemini: process.env.GEMINI_API_KEY || undefined,
        openai: process.env.OPENAI_API_KEY || undefined,
        anthropic: process.env.ANTHROPIC_API_KEY || undefined,
        geminiModel: brandRow?.geminiModel || undefined,
        openaiModel: brandRow?.openaiModel || undefined,
        anthropicModel: brandRow?.anthropicModel || undefined
      }
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return serverError(err);
  }
});
