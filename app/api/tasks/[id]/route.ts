import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { withAuth, badRequest, serverError } from "@/lib/api";
import { rowToTask } from "@/lib/db-mappers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH — partial update. Accepts any of: status, priority, tags,
// contentStatus, content (replaces), addContentVersion (pushes a version).
export const PATCH = withAuth(async (_user, req, ctx: { params: { id: string } }) => {
  const id = ctx.params.id;
  try {
    const body = await req.json();
    const [existing] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, id))
      .limit(1);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updates: Partial<typeof tasks.$inferInsert> = {
      updatedAt: new Date()
    };

    if (typeof body.status === "string") updates.status = body.status;
    if (typeof body.contentStatus === "string")
      updates.contentStatus = body.contentStatus;
    if (Array.isArray(body.tags)) updates.tags = body.tags;
    if (typeof body.publishedUrl === "string")
      updates.publishedUrl = body.publishedUrl.trim() || null;
    if (body.publishedUrl === null) updates.publishedUrl = null;
    if (body.content !== undefined) {
      // Push previous content (if any) into versions array.
      const prev = existing.content;
      if (prev) {
        const versions = Array.isArray(existing.contentVersions)
          ? [...(existing.contentVersions as unknown[])]
          : [];
        versions.unshift(prev);
        updates.contentVersions = versions.slice(0, 5);
      }
      updates.content = body.content;
    }
    if (body.priority) {
      // Priority lives on the topicSnapshot — patch the snapshot.
      const snap =
        (existing.topicSnapshot as Record<string, unknown>) || {};
      updates.topicSnapshot = { ...snap, priority: body.priority };
    }

    if (Object.keys(updates).length === 1) {
      // Only updatedAt — nothing meaningful changed.
      return badRequest("No supported fields to update");
    }

    const [updated] = await db
      .update(tasks)
      .set(updates)
      .where(eq(tasks.id, id))
      .returning();

    return NextResponse.json({ task: rowToTask(updated) });
  } catch (err) {
    return serverError(err);
  }
});

export const DELETE = withAuth(async (_user, _req, ctx: { params: { id: string } }) => {
  try {
    await db.delete(tasks).where(eq(tasks.id, ctx.params.id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return serverError(err);
  }
});
