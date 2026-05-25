import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { keywords } from "@/db/schema";
import { withAuth, serverError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_STRING_FIELDS = [
  "keyword",
  "priority",
  "intent",
  "status",
  "targetUrl",
  "notes"
] as const;

export const PATCH = withAuth(
  async (_user, req, ctx: { params: { id: string } }) => {
    try {
      const body = await req.json();
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const k of ALLOWED_STRING_FIELDS) {
        if (typeof body[k] === "string") patch[k] = body[k];
      }
      if (typeof body.searchVolume === "number")
        patch.searchVolume = body.searchVolume;
      if (body.searchVolume === null) patch.searchVolume = null;
      if (typeof body.difficulty === "number")
        patch.difficulty = body.difficulty;
      if (body.difficulty === null) patch.difficulty = null;
      if (Object.keys(patch).length <= 1) {
        return NextResponse.json({ ok: true, noop: true });
      }
      await db
        .update(keywords)
        .set(patch)
        .where(eq(keywords.id, ctx.params.id));
      return NextResponse.json({ ok: true });
    } catch (err) {
      return serverError(err);
    }
  }
);

export const DELETE = withAuth(
  async (_user, _req, ctx: { params: { id: string } }) => {
    try {
      await db.delete(keywords).where(eq(keywords.id, ctx.params.id));
      return NextResponse.json({ ok: true });
    } catch (err) {
      return serverError(err);
    }
  }
);
