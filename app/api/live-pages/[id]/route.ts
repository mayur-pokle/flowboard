import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { livePages } from "@/db/schema";
import { withAuth, serverError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEXT_FIELDS = [
  "title",
  "url",
  "metaTitle",
  "metaDescription",
  "targetKeyword",
  "searchIntent",
  "contentType",
  "status",
  "owner",
  "notes"
] as const;

const NUMBER_FIELDS = [
  "monthlyTraffic",
  "rankingPosition",
  "searchVolume",
  "keywordDifficulty",
  "backlinks",
  "conversions"
] as const;

export const PATCH = withAuth(
  async (_user, req, ctx: { params: { id: string } }) => {
    try {
      const body = await req.json().catch(() => ({}));
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const k of TEXT_FIELDS) {
        if (typeof body[k] === "string") patch[k] = body[k];
      }
      for (const k of NUMBER_FIELDS) {
        if (typeof body[k] === "number") patch[k] = body[k];
        if (body[k] === null) patch[k] = null;
      }
      if (typeof body.publishDate === "string" && body.publishDate) {
        patch.publishDate = new Date(body.publishDate);
      }
      if (body.publishDate === null) patch.publishDate = null;
      if (typeof body.lastReviewedDate === "string" && body.lastReviewedDate) {
        patch.lastReviewedDate = new Date(body.lastReviewedDate);
      }
      if (body.lastReviewedDate === null) patch.lastReviewedDate = null;
      if (Array.isArray(body.tags)) {
        patch.tags = body.tags.filter((t: unknown) => typeof t === "string");
      }
      if (Object.keys(patch).length <= 1) {
        return NextResponse.json({ ok: true, noop: true });
      }
      await db
        .update(livePages)
        .set(patch)
        .where(eq(livePages.id, ctx.params.id));
      return NextResponse.json({ ok: true });
    } catch (err) {
      return serverError(err);
    }
  }
);

export const DELETE = withAuth(
  async (_user, _req, ctx: { params: { id: string } }) => {
    try {
      await db.delete(livePages).where(eq(livePages.id, ctx.params.id));
      return NextResponse.json({ ok: true });
    } catch (err) {
      return serverError(err);
    }
  }
);
