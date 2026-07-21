import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  settings,
  competitors as competitorsTable,
  existingContent,
  keywords as keywordsTable
} from "@/db/schema";
import { withAuth, serverError } from "@/lib/api";
import {
  suggestKeywords,
  fetchHomepageText
} from "@/lib/keyword-suggester";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/settings/suggest-keywords
// Reads workspace context, optionally fetches the brand's own homepage,
// and returns a prioritized (P0/P1/P2) keyword list from Gemini
// (with fallback chain). Does NOT write to the DB — the client
// reviews + bulk-adds via /api/keywords.

export const POST = withAuth(async (_user, req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const includeHomepage =
      typeof body.includeHomepage === "boolean"
        ? body.includeHomepage
        : true;

    const [brandRow] = await db
      .select()
      .from(settings)
      .where(eq(settings.id, "workspace"))
      .limit(1);
    const compRows = await db.select().from(competitorsTable);
    const libRows = await db.select().from(existingContent);
    const kwRows = await db.select().from(keywordsTable);

    // Fetch the brand's own homepage when configured. Best-effort — if
    // it 404s, the suggester still runs with just the brand context.
    let homepageText: string | undefined;
    let homepageError: string | null = null;
    if (includeHomepage && brandRow?.websiteUrl) {
      try {
        const text = await fetchHomepageText(brandRow.websiteUrl);
        if (text && text.length > 100) {
          homepageText = text;
        } else {
          homepageError =
            "Homepage fetched but returned no usable text. Continuing with brand context only.";
        }
      } catch (err) {
        homepageError = `Homepage fetch failed: ${(err as Error).message}. Continuing with brand context only.`;
      }
    }

    const result = await suggestKeywords(
      {
        brand: {
          companyName: brandRow?.companyName || undefined,
          websiteUrl: brandRow?.websiteUrl || undefined,
          brandNiche: brandRow?.brandNiche || undefined,
          brandAudience: brandRow?.brandAudience || undefined,
          productDescription: brandRow?.productDescription || undefined,
          valueProposition: brandRow?.valueProposition || undefined,
          primaryCta: brandRow?.primaryCta || undefined,
          seedKeywords: brandRow?.seedKeywords || undefined,
          topicsToAvoid: brandRow?.topicsToAvoid || undefined
        },
        competitors: compRows.map((c) => ({
          name: c.name,
          url: c.url,
          tier: c.tier
        })),
        contentLibrary: libRows.map((l) => ({
          title: l.title,
          targetKeyword: l.targetKeyword
        })),
        existingKeywords: kwRows.map((k) => k.keyword),
        homepageText,
        desiredCount: 25
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

    return NextResponse.json({
      ok: true,
      ...result,
      homepageError,
      website: brandRow?.websiteUrl || null,
      existingCount: kwRows.length
    });
  } catch (err) {
    return serverError(err);
  }
});
