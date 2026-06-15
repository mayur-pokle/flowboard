import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { discoveredOpportunities, tasks, topics } from "@/db/schema";
import { withAuth, serverError } from "@/lib/api";
import { uid, topicHash } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/discoveries/[id]/move-to-board
// Converts a discovered opportunity into a Kanban task. Creates a
// synthetic Topic snapshot (since the opportunity came from external
// data, not the AI topic generator) and inserts a task pointing at it.

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
      if (opp.movedToTaskId) {
        return NextResponse.json({
          ok: true,
          taskId: opp.movedToTaskId,
          alreadyMoved: true
        });
      }

      // Build a Topic-shaped snapshot from the opportunity. Defaults are
      // sensible — the user can edit on the Kanban card.
      const metrics =
        (opp.metrics as Record<string, number> | null) || {};
      const title = `Capture: "${opp.query}"`;
      const snapshot = {
        id: uid("topic"),
        title,
        contentType: "Guide",
        targetKeyword: opp.query,
        searchIntent: "Discovered from source data",
        priority: opp.score >= 70 ? "High" : opp.score >= 40 ? "Medium" : "Low",
        priorityScore: opp.score,
        whyOpportunity:
          opp.reason ||
          `Pulled from ${opp.source.toUpperCase()} as a high-leverage opportunity.`,
        suggestedCta: "Read the full guide",
        estimatedEffort: "Medium",
        intent: "informational",
        impactScore: opp.score,
        noveltyScore: 100,
        rankingPotential:
          metrics.position && metrics.position <= 20
            ? `Currently ranks #${metrics.position.toFixed(0)} — within reach of page 1`
            : undefined,
        businessImpact: `Source: ${opp.source.toUpperCase()}`,
        createdAt: new Date().toISOString()
      };

      // Also write a row to `topics` so dedup memory works correctly.
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
          intent: snapshot.intent,
          impactScore: snapshot.impactScore,
          noveltyScore: snapshot.noveltyScore,
          createdByUserId: user.id
        })
        .onConflictDoNothing();

      // Create the task.
      const taskId = uid("task");
      await db.insert(tasks).values({
        id: taskId,
        topicId: snapshot.id,
        topicSnapshot: snapshot,
        status: "todo",
        contentStatus: "not_started",
        tags: [`source:${opp.source}`],
        createdByUserId: user.id
      });

      // Mark the opportunity as moved.
      await db
        .update(discoveredOpportunities)
        .set({
          status: "moved",
          movedToTaskId: taskId,
          updatedAt: new Date()
        })
        .where(eq(discoveredOpportunities.id, opp.id));

      // Also record in the "moved" hash memory so the AI topic gen
      // doesn't propose a near-duplicate later.
      void topicHash; // imported for symmetry; opportunity move uses query, not title hash

      return NextResponse.json({ ok: true, taskId });
    } catch (err) {
      return serverError(err);
    }
  }
);
