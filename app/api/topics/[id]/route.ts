import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { topics, deletedTopicHashes } from "@/db/schema";
import { withAuth, serverError } from "@/lib/api";
import { topicHash } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE — remove a topic and remember its hash so it never reappears.
export const DELETE = withAuth(async (_user, _req, ctx: { params: { id: string } }) => {
  const id = ctx.params.id;
  try {
    const [row] = await db.select().from(topics).where(eq(topics.id, id)).limit(1);
    if (!row) {
      return NextResponse.json({ ok: true, noop: true });
    }
    const h = topicHash(row.title, row.targetKeyword);
    await db.transaction(async (tx) => {
      await tx.delete(topics).where(eq(topics.id, id));
      await tx
        .insert(deletedTopicHashes)
        .values({ hash: h })
        .onConflictDoNothing();
    });
    return NextResponse.json({ ok: true, hash: h });
  } catch (err) {
    return serverError(err);
  }
});
