import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { topics, tasks, movedTopicHashes } from "@/db/schema";
import { withAuth, serverError } from "@/lib/api";
import { topicHash, uid } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — move a topic to the Kanban board.
//  - Snapshots the topic onto a new tasks row
//  - Removes the topic from the pool
//  - Records the hash so the same idea can't reappear
export const POST = withAuth(async (user, _req, ctx: { params: { id: string } }) => {
  const id = ctx.params.id;
  try {
    const [row] = await db.select().from(topics).where(eq(topics.id, id)).limit(1);
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const snapshot = {
      id: row.id,
      title: row.title,
      contentType: row.contentType,
      targetKeyword: row.targetKeyword,
      searchIntent: row.searchIntent,
      priority: row.priority,
      priorityScore: row.priorityScore,
      whyOpportunity: row.whyOpportunity,
      suggestedCta: row.suggestedCta,
      estimatedEffort: row.estimatedEffort,
      competitorGap: row.competitorGap ?? undefined,
      rankingPotential: row.rankingPotential ?? undefined,
      businessImpact: row.businessImpact ?? undefined,
      createdAt: row.createdAt.toISOString()
    };
    const h = topicHash(row.title, row.targetKeyword);
    const taskId = uid("task");

    await db.transaction(async (tx) => {
      await tx.insert(tasks).values({
        id: taskId,
        topicId: row.id,
        topicSnapshot: snapshot,
        status: "todo",
        contentStatus: "not_started",
        tags: [],
        createdByUserId: user.id
      });
      await tx.delete(topics).where(eq(topics.id, id));
      await tx
        .insert(movedTopicHashes)
        .values({ hash: h })
        .onConflictDoNothing();
    });

    return NextResponse.json({ ok: true, taskId, hash: h });
  } catch (err) {
    return serverError(err);
  }
});
