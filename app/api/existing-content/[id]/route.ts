import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { existingContent } from "@/db/schema";
import { withAuth, serverError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = ["url", "title", "targetKeyword", "intent", "notes"] as const;

export const PATCH = withAuth(
  async (_user, req, ctx: { params: { id: string } }) => {
    try {
      const body = await req.json();
      const patch: Record<string, unknown> = {};
      for (const k of ALLOWED) {
        if (typeof body[k] === "string") patch[k] = body[k];
      }
      if (typeof body.publishedDate === "string" && body.publishedDate) {
        patch.publishedDate = new Date(body.publishedDate);
      }
      // Invalidate cached embedding when title/keyword changes.
      if (
        typeof body.title === "string" ||
        typeof body.targetKeyword === "string"
      ) {
        patch.embedding = null;
      }
      if (Object.keys(patch).length === 0) {
        return NextResponse.json({ ok: true, noop: true });
      }
      await db
        .update(existingContent)
        .set(patch)
        .where(eq(existingContent.id, ctx.params.id));
      return NextResponse.json({ ok: true });
    } catch (err) {
      return serverError(err);
    }
  }
);

export const DELETE = withAuth(
  async (_user, _req, ctx: { params: { id: string } }) => {
    try {
      await db
        .delete(existingContent)
        .where(eq(existingContent.id, ctx.params.id));
      return NextResponse.json({ ok: true });
    } catch (err) {
      return serverError(err);
    }
  }
);
