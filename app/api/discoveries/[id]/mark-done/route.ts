import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  discoveredOpportunities,
  tasks,
  topics,
  settings
} from "@/db/schema";
import { withAuth, serverError } from "@/lib/api";
import { uid } from "@/lib/utils";
import type { BriefData } from "@/lib/brief-generator";
import type { Topic, ContentType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/discoveries/[id]/mark-done
// Moves the card from In-progress → Done. Auto-creates a Kanban task
// on /board with the article attached so the writer can publish.
// Idempotent — if a linked task already exists, just refreshes its
// content payload.

function contentTypeFor(intent: string): ContentType {
  if (intent === "transactional") return "Calculator";
  if (intent === "commercial") return "Guide";
  if (intent === "navigational") return "Guide";
  return "Guide";
}

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
      if (!opp.contentMarkdown) {
        return NextResponse.json(
          { error: "Generate content first before marking done." },
          { status: 400 }
        );
      }
      const [brand] = await db
        .select()
        .from(settings)
        .where(eq(settings.id, "workspace"))
        .limit(1);

      const brief = (opp.briefData as BriefData | null) || null;
      const intent = brief?.intent || (opp.intent as string) || "informational";
      const now = new Date();

      // Build the task content payload. The Kanban side expects a
      // GeneratedContent shape — fill the fields we have, leave the
      // rest sensible.
      const taskContent = {
        metaTitle: opp.query,
        metaDescription: "",
        urlSlug: opp.query
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, ""),
        schemaJsonLd: "",
        body: opp.contentMarkdown,
        internalLinks: [],
        ctaPlacements: brief?.ctaRecommendation
          ? [brief.ctaRecommendation]
          : [],
        faqs: [],
        wordCount: 0
      };

      // Topic snapshot — mirrors what /api/discoveries/[id]/move-to-board
      // built when promoting from the old surface.
      const topicId = opp.linkedTaskId ? opp.linkedTaskId : uid("topic");
      const snapshot: Topic = {
        id: topicId,
        title: opp.query,
        contentType: contentTypeFor(intent),
        targetKeyword: opp.query,
        searchIntent: opp.reason || `Discovery: ${opp.source}`,
        priority:
          opp.priority === "P0"
            ? "High"
            : opp.priority === "P1"
            ? "Medium"
            : "Low",
        priorityScore: opp.score,
        whyOpportunity: opp.reason || `Discovered via ${opp.source}.`,
        suggestedCta: brand?.primaryCta || "Read the full guide",
        estimatedEffort: "Medium",
        impactScore: opp.score,
        noveltyScore: 100,
        createdAt: new Date().toISOString()
      };

      let taskId = opp.linkedTaskId || null;
      if (!taskId) {
        await db
          .insert(topics)
          .values({
            id: snapshot.id,
            title: snapshot.title,
            contentType: snapshot.contentType,
            targetKeyword: snapshot.targetKeyword,
            searchIntent: snapshot.searchIntent,
            priority: snapshot.priority,
            priorityScore: snapshot.priorityScore,
            whyOpportunity: snapshot.whyOpportunity,
            suggestedCta: snapshot.suggestedCta,
            estimatedEffort: snapshot.estimatedEffort,
            impactScore: snapshot.impactScore,
            noveltyScore: snapshot.noveltyScore,
            createdByUserId: user.id
          })
          .onConflictDoNothing();
        taskId = uid("task");
        await db.insert(tasks).values({
          id: taskId,
          topicId: snapshot.id,
          topicSnapshot: snapshot,
          // Land in Done on the Kanban — Discovery has done the
          // production work; the writer's job is to publish.
          status: "done",
          contentStatus: "completed",
          content: taskContent,
          tags: [
            `source:${opp.source}`,
            `type:${opp.opportunityType}`,
            "from-discovery"
          ],
          createdByUserId: user.id
        });
      } else {
        await db
          .update(tasks)
          .set({
            content: taskContent,
            contentStatus: "completed",
            status: "done",
            updatedAt: now
          })
          .where(eq(tasks.id, taskId));
      }

      await db
        .update(discoveredOpportunities)
        .set({
          kanbanColumn: "done",
          status: "published",
          linkedTaskId: taskId,
          movedToTaskId: taskId,
          updatedAt: now
        })
        .where(eq(discoveredOpportunities.id, ctx.params.id));

      return NextResponse.json({ ok: true, taskId });
    } catch (err) {
      return serverError(err);
    }
  }
);
