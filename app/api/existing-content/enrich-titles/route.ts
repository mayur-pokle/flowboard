import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { existingContent } from "@/db/schema";
import { withAuth, badRequest, serverError } from "@/lib/api";
import {
  fetchWithTimeout,
  extractTitleFromHtml
} from "@/lib/sitemap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fetch real <title> tags for up to 10 URLs per call. Larger batches risk
// hitting the serverless timeout. The client chunks through unenriched
// rows N at a time and shows a progress bar.
const MAX_PER_CALL = 10;

export const POST = withAuth(async (_user, req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const ids: unknown = body?.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      return badRequest("Provide ids[] (array of existingContent IDs)");
    }
    const safeIds = ids
      .filter((x): x is string => typeof x === "string")
      .slice(0, MAX_PER_CALL);
    if (safeIds.length === 0) return badRequest("No valid IDs");

    const rows = await db
      .select()
      .from(existingContent)
      .where(inArray(existingContent.id, safeIds));

    const results = await Promise.allSettled(
      rows.map(async (r) => {
        try {
          const res = await fetchWithTimeout(r.url, 6000);
          if (!res.ok) return null;
          const html = await res.text();
          const newTitle = extractTitleFromHtml(html);
          if (!newTitle) return null;
          return { id: r.id, title: newTitle };
        } catch {
          return null;
        }
      })
    );

    let enriched = 0;
    const now = new Date();
    for (const r of results) {
      if (r.status !== "fulfilled" || !r.value) continue;
      await db
        .update(existingContent)
        .set({ title: r.value.title, enrichedAt: now })
        .where(inArray(existingContent.id, [r.value.id]));
      enriched++;
    }

    return NextResponse.json({
      processed: safeIds.length,
      enriched,
      failed: safeIds.length - enriched
    });
  } catch (err) {
    return serverError(err);
  }
});
