import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  discoveredOpportunities,
  settings,
  competitors,
  existingContent,
  tasks,
  topics
} from "@/db/schema";
import { withAuth, serverError } from "@/lib/api";
import { uid } from "@/lib/utils";
import { generateContent, type BrandContext } from "@/lib/ai";
import {
  computeQualitySignals,
  type QualitySignals
} from "@/lib/content-quality";
import type {
  Intent
} from "@/lib/opportunity-classifier";
import type {
  Topic,
  ContentType,
  Priority,
  Effort,
  SearchIntentType
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Maps the opportunity's detected intent to a content type the existing
// AI prompts know how to produce. Keep these strictly in the union the
// type system enforces.
function contentTypeForIntent(intent: Intent | null | undefined): ContentType {
  switch (intent) {
    case "transactional":
      return "Calculator";
    case "commercial":
      return "Guide";
    case "navigational":
      return "Guide";
    case "informational":
    default:
      return "Guide";
  }
}

function wordCountTargetForIntent(intent: Intent | null | undefined): number {
  switch (intent) {
    case "transactional":
      return 800;
    case "commercial":
      return 2000;
    case "navigational":
      return 1200;
    default:
      return 1800;
  }
}

// POST /api/discoveries/[id]/content
// Generates the full article using the same AI fallback chain Kanban
// content uses. Computes quality signals, auto-creates a Kanban task
// in "done" with the article attached, and returns everything.
export const POST = withAuth(
  async (user, _req, ctx: { params: { id: string } }) => {
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

      const intent = (opp.intent as Intent | null) ?? "informational";
      const contentType = contentTypeForIntent(intent);
      const wordCountTarget = wordCountTargetForIntent(intent);

      // Build a Topic shape the AI module can ingest.
      const topicId = uid("topic");
      const synthTopic: Topic = {
        id: topicId,
        title: opp.query,
        contentType,
        targetKeyword: opp.query,
        searchIntent:
          opp.reason || `Opportunity discovered from ${opp.source}.`,
        priority: (opp.score >= 70
          ? "High"
          : opp.score >= 40
          ? "Medium"
          : "Low") as Priority,
        priorityScore: opp.score,
        whyOpportunity:
          opp.reason ||
          `${opp.source.toUpperCase()} flagged this query as high-leverage.`,
        suggestedCta: brand?.primaryCta || "Read the full guide",
        estimatedEffort: "Medium" as Effort,
        intent: (intent as SearchIntentType) || undefined,
        impactScore: opp.score,
        noveltyScore: 100,
        createdAt: new Date().toISOString()
      };

      const ctxAi: BrandContext = {
        niche: brand?.brandNiche || "",
        audience: brand?.brandAudience || "",
        companyName: brand?.companyName || undefined,
        websiteUrl: brand?.websiteUrl || undefined,
        productDescription: brand?.productDescription || undefined,
        valueProposition: brand?.valueProposition || undefined,
        brandVoice: brand?.brandVoice || undefined,
        primaryCta: brand?.primaryCta || undefined,
        primaryGeo: brand?.primaryGeo || undefined,
        competitors: comps
          .filter((c) => c.tier !== "watch")
          .map((c) => ({
            name: c.name,
            url: c.url,
            notes: c.notes,
            tier: c.tier as "primary" | "secondary" | "watch"
          })),
        existingContent: library.slice(0, 60).map((l) => ({
          url: l.url,
          title: l.title,
          targetKeyword: l.targetKeyword
        }))
      };

      const { content, provider, warnings } = await generateContent(
        synthTopic,
        ctxAi,
        {
          openaiModel: brand?.openaiModel || undefined,
          geminiModel: brand?.geminiModel || undefined,
          anthropicModel: brand?.anthropicModel || undefined,
          primaryProvider:
            (brand?.primaryProvider as
              | "auto"
              | "openai"
              | "gemini"
              | "anthropic"
              | undefined) || "auto"
        }
      );

      const articleMarkdown = content.body;
      const quality: QualitySignals = computeQualitySignals({
        markdown: articleMarkdown,
        targetKeyword: opp.query,
        wordCountTarget,
        libraryTitles: library.map((l) => l.title)
      });

      // ── Auto-create Kanban task in Done ──
      // The task gets the article in its content payload + a tag so the
      // user can trace it back to the opportunity. If the opportunity
      // already produced a task, we update that task instead of making
      // a new one (so Regenerate doesn't pile up duplicate cards).
      let taskId = opp.linkedTaskId || opp.movedToTaskId || null;
      const topicSnapshot = {
        ...synthTopic
      };

      if (!taskId) {
        // Insert the synthetic topic so /api/topics dedupe still works.
        await db
          .insert(topics)
          .values({
            id: synthTopic.id,
            title: synthTopic.title,
            contentType: synthTopic.contentType,
            targetKeyword: synthTopic.targetKeyword,
            searchIntent: synthTopic.searchIntent,
            priority: synthTopic.priority,
            priorityScore: synthTopic.priorityScore,
            whyOpportunity: synthTopic.whyOpportunity,
            suggestedCta: synthTopic.suggestedCta,
            estimatedEffort: synthTopic.estimatedEffort,
            intent: synthTopic.intent,
            impactScore: synthTopic.impactScore,
            noveltyScore: synthTopic.noveltyScore,
            createdByUserId: user.id
          })
          .onConflictDoNothing();

        taskId = uid("task");
        await db.insert(tasks).values({
          id: taskId,
          topicId: synthTopic.id,
          topicSnapshot,
          // Auto-ship to "done" — the article is generated, the user
          // can move it back if they want to keep iterating.
          status: "done",
          contentStatus: "completed",
          content,
          tags: [`source:${opp.source}`, "from-discovery"],
          createdByUserId: user.id
        });
      } else {
        // Refresh content on the existing task.
        await db
          .update(tasks)
          .set({
            content,
            contentStatus: "completed",
            updatedAt: new Date()
          })
          .where(eq(tasks.id, taskId));
      }

      const now = new Date();
      await db
        .update(discoveredOpportunities)
        .set({
          contentMarkdown: articleMarkdown,
          contentGeneratedAt: now,
          qualitySignals: quality,
          linkedTaskId: taskId,
          movedToTaskId: taskId,
          status: "in_progress",
          updatedAt: now
        })
        .where(eq(discoveredOpportunities.id, ctx.params.id));

      return NextResponse.json({
        ok: true,
        provider,
        warnings,
        contentMarkdown: articleMarkdown,
        contentGeneratedAt: now.toISOString(),
        quality,
        wordCountTarget,
        taskId
      });
    } catch (err) {
      return serverError(err);
    }
  }
);

// Save an edited article verbatim.
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
      // Recompute quality on save so the right-side panel stays honest.
      const [opp] = await db
        .select()
        .from(discoveredOpportunities)
        .where(eq(discoveredOpportunities.id, ctx.params.id))
        .limit(1);
      if (!opp) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      const library = await db.select().from(existingContent);
      const intent = (opp.intent as Intent | null) ?? "informational";
      const quality = computeQualitySignals({
        markdown: body.contentMarkdown,
        targetKeyword: opp.query,
        wordCountTarget: wordCountTargetForIntent(intent),
        libraryTitles: library.map((l) => l.title)
      });
      const now = new Date();
      await db
        .update(discoveredOpportunities)
        .set({
          contentMarkdown: body.contentMarkdown,
          contentGeneratedAt: now,
          qualitySignals: quality,
          updatedAt: now
        })
        .where(eq(discoveredOpportunities.id, ctx.params.id));

      // Mirror into the linked task content so the Kanban card stays
      // in sync. We only update the body — the rest of GeneratedContent
      // (meta, schema, faqs) is left alone.
      if (opp.linkedTaskId) {
        const [t] = await db
          .select()
          .from(tasks)
          .where(eq(tasks.id, opp.linkedTaskId))
          .limit(1);
        if (t && t.content && typeof t.content === "object") {
          await db
            .update(tasks)
            .set({
              content: {
                ...(t.content as Record<string, unknown>),
                body: body.contentMarkdown
              },
              updatedAt: now
            })
            .where(eq(tasks.id, opp.linkedTaskId));
        }
      }

      return NextResponse.json({ ok: true, quality });
    } catch (err) {
      return serverError(err);
    }
  }
);
