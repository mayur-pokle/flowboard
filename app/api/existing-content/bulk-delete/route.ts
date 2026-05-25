import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { existingContent } from "@/db/schema";
import { withAuth, badRequest, serverError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Used by the "Delete X removed URLs" CTA on the refresh-sitemap modal.
export const POST = withAuth(async (_user, req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const ids: unknown = body?.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      return badRequest("Provide ids[] to delete");
    }
    const safeIds = ids.filter((x): x is string => typeof x === "string");
    if (safeIds.length === 0) return badRequest("No valid IDs");
    await db
      .delete(existingContent)
      .where(inArray(existingContent.id, safeIds));
    return NextResponse.json({ deleted: safeIds.length });
  } catch (err) {
    return serverError(err);
  }
});
