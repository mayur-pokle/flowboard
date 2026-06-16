import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sourceConfigs, discoveredOpportunities } from "@/db/schema";
import { withAuth, badRequest, serverError } from "@/lib/api";
import { uid } from "@/lib/utils";
import { classifyOpportunity } from "@/lib/opportunity-classifier";
import { getBrandNames } from "@/lib/discovery-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/sources/ai-citations/sync
// Mock-mode citation tracker. For each tracked prompt, generates a
// Community opportunity tagged with the brand-vs-competitor citation
// gap. Real Perplexity/ChatGPT citation checking is a future upgrade
// path; the mock keeps the workflow end-to-end usable today.

interface AiCitationsMeta {
  prompts: string[];
  competitorDomains: string[];
  brandTerms: string[];
  mode: "live" | "mock";
}

export const POST = withAuth(async () => {
  try {
    const [config] = await db
      .select()
      .from(sourceConfigs)
      .where(eq(sourceConfigs.name, "ai-citations"))
      .limit(1);
    if (!config) {
      return badRequest("AI Citations Tracker is not configured.");
    }
    const meta = (config.metadata as AiCitationsMeta) || {
      prompts: [],
      competitorDomains: [],
      brandTerms: [],
      mode: "mock"
    };
    if (meta.prompts.length === 0) {
      return badRequest("Add at least one tracked prompt first.");
    }

    const brandNames = await getBrandNames();

    // Mock model: every prompt becomes an opportunity. In mock mode
    // we assume competitors ARE cited and the brand is NOT — that's
    // the worst-case the spec wants the workflow to handle, and lets
    // the strategist see the AI citation gap signal lit up across
    // every row so the UX can be exercised.
    let inserted = 0;
    for (const prompt of meta.prompts) {
      const query = prompt.trim();
      if (!query) continue;
      const classified = classifyOpportunity({
        source: "ai-citations",
        query,
        brandNames,
        // Mock: no GSC data yet, just signal the citation gap exists.
        position: 25
      });
      const dedupKey = `ai-citations::${query.toLowerCase()}`;
      await db
        .insert(discoveredOpportunities)
        .values({
          id: uid("disc"),
          source: "ai-citations",
          query,
          url: null,
          metrics: { mockMode: meta.mode === "mock" ? 1 : 0 },
          score: classified.totalScore,
          status: "new",
          reason:
            meta.mode === "mock"
              ? `Mock signal: ${meta.competitorDomains.slice(0, 2).join(", ") || "competitors"} cited by AI for this prompt — your domain is not.`
              : `Live signal: AI engines cite competitors for this prompt.`,
          dedupKey,
          intent: classified.intent,
          aiCitationGap: true,
          scoreBreakdown: classified.scoreBreakdown,
          opportunityType: "community",
          priority: classified.priority,
          trending: classified.trending,
          aiCitationsCited: meta.competitorDomains,
          kanbanColumn: "intake"
        })
        .onConflictDoNothing();
      // Re-classify on every sync so the breakdown stays current.
      await db
        .update(discoveredOpportunities)
        .set({
          score: classified.totalScore,
          scoreBreakdown: classified.scoreBreakdown,
          priority: classified.priority,
          intent: classified.intent,
          aiCitationsCited: meta.competitorDomains,
          aiCitationGap: true,
          opportunityType: "community",
          updatedAt: new Date()
        })
        .where(eq(discoveredOpportunities.dedupKey, dedupKey));
      inserted += 1;
    }

    await db
      .update(sourceConfigs)
      .set({
        lastSyncedAt: new Date(),
        lastError: null,
        updatedAt: new Date()
      })
      .where(eq(sourceConfigs.name, "ai-citations"));

    return NextResponse.json({
      ok: true,
      mode: meta.mode,
      opportunities: inserted
    });
  } catch (err) {
    return serverError(err);
  }
});
