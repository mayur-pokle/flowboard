import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  discoveredOpportunities,
  settings,
  competitors,
  existingContent
} from "@/db/schema";
import { withAuth, serverError } from "@/lib/api";
import {
  generateBriefMarkdown,
  findCannibalizationMatches,
  findRelatedContent,
  type BriefInput
} from "@/lib/brief-generator";
import type {
  Intent,
  ScoreBreakdown
} from "@/lib/opportunity-classifier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/discoveries/[id]/brief
// Deterministically (re)generates the brief markdown from the
// opportunity + workspace context. Saves and returns it.
//
// PATCH same path = save an edited brief verbatim.

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
      const comps = await db.select().from(competitors);
      const library = await db.select().from(existingContent);

      const cannibalization = findCannibalizationMatches(
        opp.query,
        library.map((l) => ({
          url: l.url,
          title: l.title,
          targetKeyword: l.targetKeyword
        }))
      );
      const cannibalUrls = new Set(cannibalization.map((c) => c.url));
      const related = findRelatedContent(
        opp.query,
        library.map((l) => ({
          url: l.url,
          title: l.title,
          targetKeyword: l.targetKeyword
        })),
        cannibalUrls
      );

      const briefInput: BriefInput = {
        query: opp.query,
        source: opp.source,
        intent: (opp.intent as Intent | null) ?? null,
        score: opp.score,
        scoreBreakdown:
          (opp.scoreBreakdown as ScoreBreakdown | null) ?? null,
        aiCitationGap: opp.aiCitationGap ?? false,
        metrics:
          (opp.metrics as Record<string, number | string> | null) ?? null,
        reason: opp.reason,
        brand: {
          companyName: brand?.companyName ?? "",
          brandNiche: brand?.brandNiche ?? "",
          brandAudience: brand?.brandAudience ?? "",
          brandVoice: brand?.brandVoice ?? "",
          primaryCta: brand?.primaryCta ?? "",
          valueProposition: brand?.valueProposition ?? ""
        },
        competitors: comps
          .filter((c) => c.tier !== "watch")
          .map((c) => ({ name: c.name, url: c.url, tier: c.tier })),
        relatedExistingContent: related,
        cannibalizationMatches: cannibalization
      };

      const briefMarkdown = generateBriefMarkdown(briefInput);
      const now = new Date();

      await db
        .update(discoveredOpportunities)
        .set({
          briefMarkdown,
          briefGeneratedAt: now,
          // Advance pipeline status if it's still "new" or legacy.
          status:
            opp.status === "new" || opp.status === "triaging"
              ? "briefed"
              : opp.status,
          updatedAt: now
        })
        .where(eq(discoveredOpportunities.id, ctx.params.id));

      return NextResponse.json({
        ok: true,
        briefMarkdown,
        briefGeneratedAt: now.toISOString(),
        cannibalization,
        related
      });
    } catch (err) {
      return serverError(err);
    }
  }
);

// Save an edited brief verbatim. We don't validate the markdown — the
// writer owns this surface.
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
