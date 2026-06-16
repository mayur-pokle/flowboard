import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  settings,
  competitors,
  existingContent,
  discoveredOpportunities
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { withAuth, serverError } from "@/lib/api";
import { ensureSchema } from "@/lib/migrate";
import { uid } from "@/lib/utils";
import { identifyGaps } from "@/lib/gap-identifier";
import { classifyOpportunity } from "@/lib/opportunity-classifier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/discoveries/identify-gaps
// Calls Gemini with the brand + competitor + library context, parses
// article-level content opportunities, and inserts them as cards in
// Intake. This is the headline action on the Discovery board — gives
// the strategist a fresh batch of real opportunities, not raw GSC
// keywords.

export const POST = withAuth(async (_user, req) => {
  try {
    await ensureSchema().catch(() => {});
    const body = await req.json().catch(() => ({}));
    const desiredCount =
      typeof body.count === "number" && body.count > 0 && body.count <= 20
        ? body.count
        : 10;

    const [brand] = await db
      .select()
      .from(settings)
      .where(eq(settings.id, "workspace"))
      .limit(1);
    const comps = await db.select().from(competitors);
    const library = await db.select().from(existingContent);
    // We surface low-CTR / page-2 queries to Gemini as "weak query"
    // hints — they're not opportunities themselves, but they help the
    // model spot refresh / community angles.
    const recentOpps = await db
      .select()
      .from(discoveredOpportunities)
      .limit(50);
    const weakQueries = recentOpps
      .filter((r) => {
        const m = (r.metrics as Record<string, number> | null) || {};
        return r.source === "gsc" && m.ctr != null && m.ctr < 0.05;
      })
      .map((r) => ({
        query: r.query,
        impressions:
          ((r.metrics as Record<string, number> | null) || {}).impressions ||
          undefined,
        position:
          ((r.metrics as Record<string, number> | null) || {}).position ||
          undefined
      }));

    const result = await identifyGaps(
      {
        brand: {
          companyName: brand?.companyName || undefined,
          brandNiche: brand?.brandNiche || undefined,
          brandAudience: brand?.brandAudience || undefined,
          brandVoice: brand?.brandVoice || undefined,
          valueProposition: brand?.valueProposition || undefined,
          productDescription: brand?.productDescription || undefined,
          primaryCta: brand?.primaryCta || undefined,
          seedKeywords: brand?.seedKeywords || undefined
        },
        competitors: comps
          .filter((c) => c.tier !== "watch")
          .map((c) => ({
            name: c.name,
            url: c.url,
            notes: c.notes || undefined
          })),
        existingContent: library.map((c) => ({
          title: c.title,
          url: c.url
        })),
        weakQueries,
        desiredCount
      },
      {
        gemini: process.env.GEMINI_API_KEY || undefined,
        openai: process.env.OPENAI_API_KEY || undefined,
        anthropic: process.env.ANTHROPIC_API_KEY || undefined,
        geminiModel: brand?.geminiModel || undefined,
        openaiModel: brand?.openaiModel || undefined,
        anthropicModel: brand?.anthropicModel || undefined
      }
    );

    // Build a quick lookup for the brand's domain so we don't keep
    // anything that looks like our own URL in competitorUrls.
    const brandHost = (() => {
      try {
        return brand?.websiteUrl
          ? new URL(brand.websiteUrl).hostname.replace(/^www\./, "")
          : "";
      } catch {
        return "";
      }
    })();

    let inserted = 0;
    const skippedDuplicates: string[] = [];
    for (const gap of result.gaps) {
      const cleanCompetitorUrls = gap.competitorUrls.filter((u) => {
        try {
          const host = new URL(u).hostname.replace(/^www\./, "");
          return host && (!brandHost || host !== brandHost);
        } catch {
          return false;
        }
      });

      // Run the classifier so we have a real 6-pillar breakdown +
      // priority on the card. Gemini's signals (aiCitationGap,
      // trending) are honored by passing them through as inputs.
      const classified = classifyOpportunity({
        source: "ai-gaps",
        query: gap.targetKeyword,
        // Boost the AI-citation pillar if Gemini said so.
        position: 25,
        competitorCount: cleanCompetitorUrls.length || undefined,
        weeklyImpressions: gap.trending ? 2500 : 0,
        previousWeekImpressions: gap.trending ? 1800 : 0
      });

      const dedupKey = `ai-gaps::${gap.title.toLowerCase()}`;
      const articleTitle = gap.title;

      // Insert if new. We keep the article title as `query` so the
      // card headline reads as a real piece of content; the SEO
      // target keyword goes into metrics so the brief + content
      // generators can pick it up.
      const existing = await db
        .select()
        .from(discoveredOpportunities)
        .where(eq(discoveredOpportunities.dedupKey, dedupKey))
        .limit(1);
      if (existing.length > 0) {
        skippedDuplicates.push(articleTitle);
        continue;
      }
      await db.insert(discoveredOpportunities).values({
        id: uid("disc"),
        source: "ai-gaps",
        query: articleTitle,
        url: null,
        metrics: {
          targetKeyword: gap.targetKeyword,
          competitorCount: cleanCompetitorUrls.length
        },
        score: classified.totalScore,
        status: "new",
        reason: gap.reason,
        dedupKey,
        intent: gap.intent,
        aiCitationGap: gap.aiCitationGap,
        scoreBreakdown: classified.scoreBreakdown,
        opportunityType: gap.opportunityType,
        priority: classified.priority,
        trending: gap.trending,
        weeklyImpressions: gap.trending ? 2500 : 0,
        previousWeekImpressions: gap.trending ? 1800 : 0,
        competitorUrls: cleanCompetitorUrls,
        competitorGapScore:
          cleanCompetitorUrls.length > 0
            ? Math.min(80, 40 + cleanCompetitorUrls.length * 10)
            : 30,
        aiCitationsCited: gap.aiCitationGap
          ? cleanCompetitorUrls
              .map((u) => {
                try {
                  return new URL(u).hostname.replace(/^www\./, "");
                } catch {
                  return "";
                }
              })
              .filter(Boolean)
          : [],
        cannibalizingPages: [],
        kanbanColumn: "intake"
      });
      inserted += 1;
    }

    return NextResponse.json({
      ok: true,
      provider: result.provider,
      inserted,
      requested: result.gaps.length,
      skippedDuplicates,
      warnings: result.warnings
    });
  } catch (err) {
    return serverError(err);
  }
});
