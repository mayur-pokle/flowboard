import { NextResponse } from "next/server";
import { desc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { topics, deletedTopicHashes, movedTopicHashes } from "@/db/schema";
import { withAuth, badRequest, serverError } from "@/lib/api";
import { topicHash, uid } from "@/lib/utils";
import type { Topic } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — list all topics + memory hashes
export const GET = withAuth(async () => {
  try {
    const [rows, deleted, moved] = await Promise.all([
      db.select().from(topics).orderBy(desc(topics.createdAt)),
      db.select().from(deletedTopicHashes),
      db.select().from(movedTopicHashes)
    ]);
    return NextResponse.json({
      topics: rows.map(rowToTopic),
      deletedTopicHashes: deleted.map((r) => r.hash),
      movedTopicHashes: moved.map((r) => r.hash)
    });
  } catch (err) {
    return serverError(err);
  }
});

// POST — bulk insert a fresh batch of generated topics, skipping duplicates
// against the in-pool, deleted, and moved memory.
export const POST = withAuth(async (user, req) => {
  try {
    const body = (await req.json()) as { topics: Topic[] };
    if (!Array.isArray(body?.topics)) {
      return badRequest("Missing topics array");
    }
    const [existingTopics, deleted, moved] = await Promise.all([
      db.select({ title: topics.title, targetKeyword: topics.targetKeyword }).from(topics),
      db.select().from(deletedTopicHashes),
      db.select().from(movedTopicHashes)
    ]);
    const seen = new Set([
      ...existingTopics.map((t) => topicHash(t.title, t.targetKeyword)),
      ...deleted.map((d) => d.hash),
      ...moved.map((m) => m.hash)
    ]);
    const fresh: Topic[] = [];
    for (const t of body.topics) {
      if (!t?.title || !t?.targetKeyword) continue;
      const h = topicHash(t.title, t.targetKeyword);
      if (seen.has(h)) continue;
      seen.add(h);
      fresh.push(t);
    }
    if (fresh.length > 0) {
      await db.insert(topics).values(
        fresh.map((t) => ({
          id: t.id || uid("topic"),
          title: t.title,
          contentType: t.contentType,
          targetKeyword: t.targetKeyword,
          searchIntent: t.searchIntent,
          priority: t.priority,
          priorityScore: t.priorityScore,
          whyOpportunity: t.whyOpportunity,
          suggestedCta: t.suggestedCta,
          estimatedEffort: t.estimatedEffort,
          competitorGap: t.competitorGap ?? null,
          rankingPotential: t.rankingPotential ?? null,
          businessImpact: t.businessImpact ?? null,
          createdByUserId: user.id
        }))
      );
    }
    return NextResponse.json({
      added: fresh.length,
      skipped: body.topics.length - fresh.length
    });
  } catch (err) {
    return serverError(err);
  }
});

function rowToTopic(r: typeof topics.$inferSelect): Topic {
  return {
    id: r.id,
    title: r.title,
    contentType: r.contentType as Topic["contentType"],
    targetKeyword: r.targetKeyword,
    searchIntent: r.searchIntent,
    priority: r.priority as Topic["priority"],
    priorityScore: r.priorityScore,
    whyOpportunity: r.whyOpportunity,
    suggestedCta: r.suggestedCta,
    estimatedEffort: r.estimatedEffort as Topic["estimatedEffort"],
    competitorGap: r.competitorGap ?? undefined,
    rankingPotential: r.rankingPotential ?? undefined,
    businessImpact: r.businessImpact ?? undefined,
    createdAt: r.createdAt.toISOString()
  };
}
