import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  analyzedTopics,
  discoveredOpportunities,
  topics as topicsTable
} from "@/db/schema";
import { withAuth, serverError, badRequest } from "@/lib/api";
import { uid } from "@/lib/utils";
import { classifyOpportunity } from "@/lib/opportunity-classifier";
import type { AnalysisResult } from "@/lib/topic-analyzer";
import type { Topic, ContentType, Priority } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/analyzer/[id]/promote
// Body: { destination: "discovery" | "resources" }
//
// "discovery" → creates a discoveredOpportunities row in the Intake
//   column so the strategist can see it on /discovery.
// "resources" → creates a topics row so it lands as an idea card in
//   the Ideas column of /board.

const CONTENT_TYPE_BY_PLAYBOOK: Record<string, ContentType> = {
  "free-tool": "Calculator",
  "lead-magnet": "Template",
  "programmatic-seo": "Template",
  "comparison-vs": "Guide",
  "aeo-answer": "Guide",
  "pillar-guide": "Whitepaper",
  "community-answer": "Guide",
  refresh: "Guide"
};

function priorityFromScore(score: number): Priority {
  if (score >= 70) return "High";
  if (score >= 45) return "Medium";
  return "Low";
}

export const POST = withAuth(
  async (user, req, ctx: { params: { id: string } }) => {
    try {
      const body = await req.json().catch(() => ({}));
      const destination =
        body.destination === "discovery" || body.destination === "resources"
          ? body.destination
          : null;
      if (!destination) {
        return badRequest(
          'Provide `destination: "discovery" | "resources"`.'
        );
      }

      const [row] = await db
        .select()
        .from(analyzedTopics)
        .where(eq(analyzedTopics.id, ctx.params.id))
        .limit(1);
      if (!row) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (!row.analysis) {
        return badRequest("Topic has no analysis to promote.");
      }
      const analysis = row.analysis as AnalysisResult;

      const now = new Date();

      if (destination === "discovery") {
        // Guard against duplicate promotion.
        if (row.promotedToDiscoveryId) {
          return NextResponse.json({
            ok: true,
            alreadyPromoted: true,
            destination,
            discoveryId: row.promotedToDiscoveryId
          });
        }

        // Reuse the classifier so the Discovery card's score matches
        // what the analyzer already showed the user — no drift.
        const classified = classifyOpportunity({
          source: "analyzer",
          query: analysis.targetKeyword,
          cannibalizingPageCount: analysis.cannibalization.matches.length
        });

        const discoveryId = uid("disc");
        const dedupKey = `analyzer::${row.id}`;
        await db
          .insert(discoveredOpportunities)
          .values({
            id: discoveryId,
            source: "analyzer",
            query: analysis.title,
            url: null,
            metrics: {
              targetKeyword: analysis.targetKeyword,
              playbook: analysis.playbook,
              fromAnalyzer: true
            },
            score: analysis.score,
            status: "new",
            reason: `Promoted from Topic Analyzer — playbook: ${analysis.playbookLabel}. ${analysis.recommendation.summary}`,
            dedupKey,
            intent: analysis.intent,
            aiCitationGap: analysis.aiCitationGap,
            scoreBreakdown: analysis.scoreBreakdown,
            opportunityType: analysis.opportunityType,
            priority: classified.priority,
            trending: false,
            cannibalizingPages: analysis.cannibalization.matches.map((m) => ({
              url: m.url,
              title: m.title
            })),
            briefData: analysis.brief,
            briefMarkdown: analysis.briefMarkdown,
            briefGeneratedAt: now,
            kanbanColumn: "intake"
          })
          .onConflictDoNothing();

        await db
          .update(analyzedTopics)
          .set({
            promotedToDiscoveryId: discoveryId,
            kanbanColumn: "approved",
            updatedAt: now
          })
          .where(eq(analyzedTopics.id, ctx.params.id));

        return NextResponse.json({
          ok: true,
          destination,
          discoveryId
        });
      }

      // destination === "resources"
      if (row.promotedToTaskId) {
        return NextResponse.json({
          ok: true,
          alreadyPromoted: true,
          destination,
          topicId: row.promotedToTaskId
        });
      }

      const topicId = uid("topic");
      const contentType =
        CONTENT_TYPE_BY_PLAYBOOK[analysis.playbook] || "Guide";
      const priority = priorityFromScore(analysis.score);

      // Insert into the shared `topics` table so it appears in the Ideas
      // column on /board. We don't create a Task — that happens when
      // the user accepts the idea from Ideas → To Do.
      await db
        .insert(topicsTable)
        .values({
          id: topicId,
          title: analysis.title,
          contentType,
          targetKeyword: analysis.targetKeyword,
          searchIntent: analysis.intent,
          priority,
          priorityScore: Math.round(analysis.score),
          whyOpportunity:
            row.notes || analysis.recommendation.summary || "",
          suggestedCta: analysis.brief.ctaRecommendation || "",
          estimatedEffort: "Medium",
          intent: analysis.intent,
          impactScore: Math.round(analysis.score),
          noveltyScore: 100,
          createdByUserId: user.id
        })
        .onConflictDoNothing();

      await db
        .update(analyzedTopics)
        .set({
          promotedToTaskId: topicId,
          kanbanColumn: "approved",
          updatedAt: now
        })
        .where(eq(analyzedTopics.id, ctx.params.id));

      return NextResponse.json({
        ok: true,
        destination,
        topicId
      });
    } catch (err) {
      return serverError(err);
    }
  }
);

// Silence unused-import — Topic type retained for callers that
// downstream may extend this endpoint.
void ({} as Topic);
