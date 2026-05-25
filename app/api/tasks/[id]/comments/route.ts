import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { taskComments } from "@/db/schema";
import { withAuth, badRequest, serverError } from "@/lib/api";
import { uid } from "@/lib/utils";
import type { TaskComment } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function rowToComment(r: typeof taskComments.$inferSelect): TaskComment {
  return {
    id: r.id,
    taskId: r.taskId,
    body: r.body,
    authorEmail: r.authorEmail ?? "",
    authorName: r.authorName ?? "",
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString()
  };
}

export const GET = withAuth(
  async (_user, _req, ctx: { params: { id: string } }) => {
    try {
      const rows = await db
        .select()
        .from(taskComments)
        .where(eq(taskComments.taskId, ctx.params.id))
        .orderBy(asc(taskComments.createdAt));
      return NextResponse.json({ comments: rows.map(rowToComment) });
    } catch (err) {
      return serverError(err);
    }
  }
);

export const POST = withAuth(
  async (user, req, ctx: { params: { id: string } }) => {
    try {
      const body = await req.json().catch(() => ({}));
      const text = typeof body?.body === "string" ? body.body.trim() : "";
      if (!text) return badRequest("Comment body is required");
      const id = uid("cmt");
      const now = new Date();
      // The user object from withAuth only has id + email. Pull a friendly
      // name from the email's local-part as a fallback for display.
      const fallbackName = user.email.split("@")[0] || user.email;
      await db.insert(taskComments).values({
        id,
        taskId: ctx.params.id,
        body: text,
        authorEmail: user.email,
        authorName: fallbackName,
        createdAt: now,
        updatedAt: now
      });
      const comment: TaskComment = {
        id,
        taskId: ctx.params.id,
        body: text,
        authorEmail: user.email,
        authorName: fallbackName,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      };
      return NextResponse.json({ comment });
    } catch (err) {
      return serverError(err);
    }
  }
);
