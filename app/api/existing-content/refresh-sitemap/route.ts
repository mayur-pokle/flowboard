import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { existingContent } from "@/db/schema";
import { withAuth, badRequest, serverError } from "@/lib/api";
import { uid } from "@/lib/utils";
import {
  fetchAllSitemapUrls,
  normalizeSitemapInput,
  titleFromUrl
} from "@/lib/sitemap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ───────────────────────────────────────────────────────────────────
// Refresh a previously-imported sitemap.
//
// Body: { sitemapUrl: string }
//
// 1. Fetch sitemap again.
// 2. Pull all DB rows where sourceSitemapUrl === provided URL.
// 3. Compute deltas:
//    - added = in sitemap, not in DB → insert
//    - removed = in DB (with this sourceSitemapUrl), not in sitemap → return for confirmation
// 4. Does NOT auto-delete removed rows — client confirms via separate DELETE.
// ───────────────────────────────────────────────────────────────────

export const POST = withAuth(async (_user, req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const rawInput =
      typeof body.sitemapUrl === "string" ? body.sitemapUrl : "";
    if (!rawInput) return badRequest("Provide sitemapUrl");
    const sitemapUrl = normalizeSitemapInput(rawInput);

    const { urls, truncated } = await fetchAllSitemapUrls(sitemapUrl);
    if (urls.length === 0) {
      return NextResponse.json(
        { error: "No URLs found in sitemap" },
        { status: 422 }
      );
    }

    // Rows that were imported from this specific sitemap.
    const tagged = await db
      .select()
      .from(existingContent)
      .where(eq(existingContent.sourceSitemapUrl, sitemapUrl));
    const taggedUrls = new Set(tagged.map((r) => r.url.toLowerCase()));

    // ALL existing URLs (to skip cross-source duplicates).
    const all = await db
      .select({ url: existingContent.url })
      .from(existingContent);
    const allUrls = new Set(all.map((r) => r.url.toLowerCase()));

    // New URLs in sitemap that we don't have yet (from any source).
    const sitemapSet = new Set(urls.map((u) => u.toLowerCase()));
    const newUrls = urls.filter((u) => !allUrls.has(u.toLowerCase()));

    if (newUrls.length > 0) {
      const rows = newUrls.map((url) => ({
        id: uid("ec"),
        url,
        title: titleFromUrl(url),
        targetKeyword: "",
        intent: "",
        publishedDate: null,
        notes: "Imported from sitemap",
        sourceSitemapUrl: sitemapUrl,
        enrichedAt: null
      }));
      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        await db.insert(existingContent).values(rows.slice(i, i + CHUNK));
      }
    }

    // Removed: rows tagged with this sitemap that aren't in the latest
    // sitemap fetch. We DON'T delete automatically — client confirms.
    const removed = tagged
      .filter((r) => !sitemapSet.has(r.url.toLowerCase()))
      .map((r) => ({ id: r.id, url: r.url, title: r.title }));

    void taggedUrls; // currently unused; kept for symmetry

    return NextResponse.json({
      added: newUrls.length,
      removed,
      sampled: urls.length,
      truncated,
      sitemapUrl
    });
  } catch (err) {
    return serverError(err);
  }
});
