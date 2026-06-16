import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  discoveredOpportunities,
  settings,
  existingContent
} from "@/db/schema";
import { withAuth, serverError } from "@/lib/api";
import {
  buildBriefData,
  renderBriefAsMarkdown,
  findCannibalizationMatches,
  type BriefData
} from "@/lib/brief-generator";
import {
  classifyOpportunity,
  type Intent,
  type ScoreBreakdown,
  type Priority,
  type OpportunityType
} from "@/lib/opportunity-classifier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/discoveries/[id]/brief
// Deterministically (re)generates the brief from the opportunity's
// signals + workspace context. Stores the structured briefData on the
// opportunity row so the brief page is instant on every revisit. Must
// complete in under 2 seconds — no LLM in this path.
//
// PATCH same path = save an edited brief verbatim (markdown only;
// briefData is the source of truth, edits go into briefMarkdown).

export const POST = withAuth(
  async (_user, _req, ctx: { params: { id: string } }) => {
    try {
      const [opp] = await db
        .select()
        .from(discoveredOpportunities)
        .where(eq(discoveredOpportunities.id, ctx.params.id))
        .limit(1);
      if (!opp) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      const [brand] = await db
        .select()
        .from(settings)
        .where(eq(settings.id, "workspace"))
        .limit(1);
      const library = await db.select().from(existingContent);

      // Cannibalization detection — fuzzy match against library titles.
      const cannibalization =
        (opp.cannibalizingPages as Array<{ url: string; title: string }> | null) ??
        findCannibalizationMatches(
          opp.query,
          library.map((l) => ({
            url: l.url,
            title: l.title,
            targetKeyword: l.targetKeyword
          }))
        );

      // If the row doesn't have a breakdown yet (e.g. legacy GSC row),
      // re-classify now so the brief has structured score data.
      let intent = (opp.intent as Intent | null) || "informational";
      let breakdown: ScoreBreakdown | null =
        (opp.scoreBreakdown as ScoreBreakdown | null) ?? null;
      let opportunityType =
        (opp.opportunityType as OpportunityType | null) || "new";
      let priority = (opp.priority as Priority | null) || "P1";
      let totalScore = opp.score;

      if (!breakdown) {
        const m = (opp.metrics as Record<string, number> | null) || {};
        const classified = classifyOpportunity({
          source: opp.source,
          query: opp.query,
          impressions: m.impressions,
          position: m.position,
          ctr: m.ctr,
          volume: m.volume,
          difficulty: m.difficulty,
          competitorGapScore: opp.competitorGapScore || undefined,
          weeklyImpressions: opp.weeklyImpressions || undefined,
          previousWeekImpressions: opp.previousWeekImpressions || undefined,
          cannibalizingPageCount: cannibalization.length
        });
        intent = classified.intent;
        breakdown = classified.scoreBreakdown;
        opportunityType = classified.opportunityType;
        priority = classified.priority;
        totalScore = classified.totalScore;
      }

      // When the row was created by the Gemini gap identifier (or the
      // sample seeder), `query` is an article TITLE and the SEO keyword
      // lives in metrics.targetKeyword. Falling back to query keeps
      // legacy GSC rows working.
      const metricsBag =
        (opp.metrics as Record<string, unknown> | null) || {};
      const targetKeyword =
        typeof metricsBag.targetKeyword === "string" &&
        metricsBag.targetKeyword.trim().length > 0
          ? (metricsBag.targetKeyword as string).trim()
          : opp.query;

      const briefData: BriefData = buildBriefData({
        query: targetKeyword,
        articleTitle: opp.query,
        intent,
        opportunityType,
        priority,
        scoreBreakdown: breakdown,
        totalScore,
        aiCitationGap: opp.aiCitationGap ?? false,
        competitorUrls: (opp.competitorUrls as string[] | null) ?? [],
        competitorGapScore: opp.competitorGapScore ?? 0,
        aiCitationsCited: (opp.aiCitationsCited as string[] | null) ?? [],
        cannibalizingPages: cannibalization,
        brandPrimaryCta: brand?.primaryCta || undefined
      });
      const briefMarkdown = renderBriefAsMarkdown(briefData, opp.query);
      const now = new Date();

      // Auto-advance the column if the user came from Accept.
      const nextColumn =
        opp.kanbanColumn === "intake" ? "new" : opp.kanbanColumn;

      await db
        .update(discoveredOpportunities)
        .set({
          briefData,
          briefMarkdown,
          briefGeneratedAt: now,
          // Persist the classification we just (re)derived.
          intent,
          opportunityType,
          priority,
          score: totalScore,
          scoreBreakdown: breakdown,
          cannibalizingPages: cannibalization,
          kanbanColumn: nextColumn,
          status: opp.status === "new" ? "briefed" : opp.status,
          updatedAt: now
        })
        .where(eq(discoveredOpportunities.id, ctx.params.id));

      return NextResponse.json({
        ok: true,
        briefData,
        briefMarkdown,
        briefGeneratedAt: now.toISOString()
      });
    } catch (err) {
      return serverError(err);
    }
  }
);

export const PATCH = withAuth(
  async (_user, req, ctx: { params: { id: string } }) => {
    try {
      const body = await req.json().catch(() => ({}));
      if (typeof body.briefMarkdown !== "string") {
        return NextResponse.json(
          { error: "briefMarkdown (string) required" },
          { status: 400 }
        );
      }
      const now = new Date();
      await db
        .update(discoveredOpportunities)
        .set({
          briefMarkdown: body.briefMarkdown,
          briefGeneratedAt: now,
          updatedAt: now
        })
        .where(eq(discoveredOpportunities.id, ctx.params.id));
      return NextResponse.json({ ok: true });
    } catch (err) {
      return serverError(err);
    }
  }
);
