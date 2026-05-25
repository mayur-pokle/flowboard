import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { taskComments } from "@/db/schema";
import { withAuth, badRequest, serverError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Edit/delete are author-only: a user can only mutate their own comments.
// Returns 404 (intentionally not 403) when the comment exists but the
// caller isn't the author, to avoid leaking author identity.

export const PATCH = withAuth(
  async (
    user,
    req,
    ctx: { params: { id: string; commentId: string } }
  ) => {
    try {
      const body = await req.json().catch(() => ({}));
      const text = typeof body?.body === "string" ? body.body.trim() : "";
      if (!text) return badRequest("Comment body is required");
      const result = await db
        .update(taskComments)
        .set({ body: text, updatedAt: new Date() })
        .where(
          and(
            eq(taskComments.id, ctx.params.commentId),
            eq(taskComments.taskId, ctx.params.id),
            eq(taskComments.authorEmail, user.email)
          )
        )
        .returning({ id: taskComments.id });
      if (result.length === 0) {
        return NextResponse.json(
          { error: "Comment not found" },
          { status: 404 }
        );
      }
      return NextResponse.json({ ok: true });
    } catch (err) {
      return serverError(err);
    }
  }
);

export const DELETE = withAuth(
  async (
    user,
    _req,
    ctx: { params: { id: string; commentId: string } }
  ) => {
    try {
      const result = await db
        .delete(taskComments)
        .where(
          and(
            eq(taskComments.id, ctx.params.commentId),
            eq(taskComments.taskId, ctx.params.id),
            eq(taskComments.authorEmail, user.email)
          )
        )
        .returning({ id: taskComments.id });
      if (result.length === 0) {
        return NextResponse.json(
          { error: "Comment not found" },
          { status: 404 }
        );
      }
      return NextResponse.json({ ok: true });
    } catch (err) {
      return serverError(err);
    }
  }
);
