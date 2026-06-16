import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  discoveredOpportunities,
  settings
} from "@/db/schema";
import { withAuth, serverError } from "@/lib/api";
import {
  generateDiscoveryContent,
  type ProviderName
} from "@/lib/discovery-content";
import { runQualityChecks } from "@/lib/content-quality";
import type { BriefData } from "@/lib/brief-generator";
import type { OpportunityType } from "@/lib/opportunity-classifier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/discoveries/[id]/content
// Generates the article using the per-opportunity-type LLM provider
// from settings. Runs quality checks. Advances the card from New →
// In-progress. Does NOT auto-create a Kanban task (that happens on
// Mark done, separately).
//
// PATCH same path = save edited content + recompute quality checks.

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
      if (!opp.briefData) {
        return NextResponse.json(
          { error: "Generate the brief first." },
          { status: 400 }
        );
      }
      const brief = opp.briefData as BriefData;

      const [brand] = await db
        .select()
        .from(settings)
        .where(eq(settings.id, "workspace"))
        .limit(1);

      const providerByType: Record<OpportunityType, ProviderName> = {
        new: (brand?.newOppProvider as ProviderName | null) || "openai",
        refresh:
          (brand?.refreshOppProvider as ProviderName | null) || "anthropic",
        community:
          (brand?.communityOppProvider as ProviderName | null) || "gemini"
      };
      const instructionsByType: Record<OpportunityType, string> = {
        new: brand?.newOppInstructions || "",
        refresh: brand?.refreshOppInstructions || "",
        community: brand?.communityOppInstructions || ""
      };

      const oppType = (opp.opportunityType as OpportunityType) || "new";

      // For Gemini-sourced cards, `query` holds the article TITLE.
      // The actual SEO keyword to optimize for lives in metrics.
      const metricsBag =
        (opp.metrics as Record<string, unknown> | null) || {};
      const targetKeyword =
        typeof metricsBag.targetKeyword === "string" &&
        metricsBag.targetKeyword.trim().length > 0
          ? (metricsBag.targetKeyword as string).trim()
          : opp.query;

      // Move to In-progress IMMEDIATELY so the UI reflects state — the
      // generation work itself runs synchronously below but the column
      // change is the user-visible "instant" transition.
      const now = new Date();
      await db
        .update(discoveredOpportunities)
        .set({
          kanbanColumn:
            opp.kanbanColumn === "new" ? "in_progress" : opp.kanbanColumn,
          updatedAt: now
        })
        .where(eq(discoveredOpportunities.id, ctx.params.id));

      const result = await generateDiscoveryContent({
        query: targetKeyword,
        articleTitle: opp.query,
        brief,
        opportunityType: oppType,
        providerByType,
        instructionsByType,
        brand: {
          companyName: brand?.companyName || undefined,
          brandNiche: brand?.brandNiche || undefined,
          brandAudience: brand?.brandAudience || undefined,
          brandVoice: brand?.brandVoice || undefined,
          primaryCta: brand?.primaryCta || undefined,
          productDescription: brand?.productDescription || undefined,
          valueProposition: brand?.valueProposition || undefined
        },
        keys: {
          openai: process.env.OPENAI_API_KEY || undefined,
          anthropic: process.env.ANTHROPIC_API_KEY || undefined,
          gemini: process.env.GEMINI_API_KEY || undefined,
          openaiModel: brand?.openaiModel || undefined,
          anthropicModel: brand?.anthropicModel || undefined,
          geminiModel: brand?.geminiModel || undefined
        }
      });

      const quality = runQualityChecks({
        markdown: result.markdown,
        targetKeyword,
        intent: brief.intent,
        wordCountMin: brief.wordCountMin,
        wordCountMax: brief.wordCountMax,
        cannibalizingPages:
          brief.cannibalization?.overlappingPages ??
          ((opp.cannibalizingPages as Array<{
            url: string;
            title: string;
          }> | null) ??
            [])
      });

      const completedAt = new Date();
      await db
        .update(discoveredOpportunities)
        .set({
          contentMarkdown: result.markdown,
          contentGeneratedAt: completedAt,
          contentChecks: quality,
          status: "in_progress",
          updatedAt: completedAt
        })
        .where(eq(discoveredOpportunities.id, ctx.params.id));

      return NextResponse.json({
        ok: true,
        contentMarkdown: result.markdown,
        contentGeneratedAt: completedAt.toISOString(),
        provider: result.provider,
        isTemplate: result.isTemplate,
        metaDescription: result.metaDescription,
        titleVariants: result.titleVariants,
        warnings: result.warnings,
        quality
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
      if (typeof body.contentMarkdown !== "string") {
        return NextResponse.json(
          { error: "contentMarkdown (string) required" },
          { status: 400 }
        );
      }
      const [opp] = await db
        .select()
        .from(discoveredOpportunities)
        .where(eq(discoveredOpportunities.id, ctx.params.id))
        .limit(1);
      if (!opp) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      const brief = (opp.briefData as BriefData | null) || null;
      const now = new Date();
      let quality = null;
      if (brief) {
        const metricsBag =
          (opp.metrics as Record<string, unknown> | null) || {};
        const targetKw =
          typeof metricsBag.targetKeyword === "string" &&
          metricsBag.targetKeyword.trim().length > 0
            ? (metricsBag.targetKeyword as string).trim()
            : opp.query;
        quality = runQualityChecks({
          markdown: body.contentMarkdown,
          targetKeyword: targetKw,
          intent: brief.intent,
          wordCountMin: brief.wordCountMin,
          wordCountMax: brief.wordCountMax,
          cannibalizingPages:
            brief.cannibalization?.overlappingPages ??
            ((opp.cannibalizingPages as Array<{
              url: string;
              title: string;
            }> | null) ?? [])
        });
      }
      await db
        .update(discoveredOpportunities)
        .set({
          contentMarkdown: body.contentMarkdown,
          contentGeneratedAt: now,
          contentChecks: quality,
          updatedAt: now
        })
        .where(eq(discoveredOpportunities.id, ctx.params.id));
      return NextResponse.json({ ok: true, quality });
    } catch (err) {
      return serverError(err);
    }
  }
);
