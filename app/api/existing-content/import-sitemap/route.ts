import { NextResponse } from "next/server";
import { db } from "@/db";
import { existingContent } from "@/db/schema";
import { withAuth, badRequest, serverError } from "@/lib/api";
import { uid } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ───────────────────────────────────────────────────────────────────
// Sitemap importer.
//
// 1. Fetch the sitemap.xml (follows sitemap-index files one level).
// 2. Extract <loc> URLs.
// 3. For up to 30 URLs, fetch the page, grab <title>, insert.
//
// This intentionally caps at 30 to keep request time under the
// platform timeout. Users with bigger sites can run it twice or fall
// back to CSV import.
// ───────────────────────────────────────────────────────────────────

const MAX_URLS = 30;
const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url: string, ms = FETCH_TIMEOUT_MS) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, {
      signal: ctl.signal,
      headers: {
        "User-Agent": "FlowboardBot/1.0 (+content audit)"
      }
    });
  } finally {
    clearTimeout(t);
  }
}

function extractLocs(xml: string): string[] {
  // Light regex parse — handles both <loc> in urlset and sitemapindex.
  const matches = xml.match(/<loc>([^<]+)<\/loc>/gi) || [];
  return matches
    .map((m) => m.replace(/<\/?loc>/gi, "").trim())
    .filter(Boolean);
}

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return "";
  return m[1].trim().replace(/\s+/g, " ").slice(0, 220);
}

export const POST = withAuth(async (_user, req) => {
  try {
    const body = await req.json().catch(() => ({}));
    let sitemapUrl: string =
      typeof body.sitemapUrl === "string" ? body.sitemapUrl.trim() : "";
    if (!sitemapUrl) return badRequest("Provide sitemapUrl");

    // Normalize: append /sitemap.xml if a bare domain was given.
    if (!/sitemap.*\.xml(\?|$)/i.test(sitemapUrl)) {
      sitemapUrl = sitemapUrl.replace(/\/+$/, "") + "/sitemap.xml";
    }
    if (!/^https?:\/\//i.test(sitemapUrl)) {
      sitemapUrl = "https://" + sitemapUrl;
    }

    const res = await fetchWithTimeout(sitemapUrl);
    if (!res.ok) {
      return NextResponse.json(
        { error: `Sitemap fetch failed: ${res.status}` },
        { status: 502 }
      );
    }
    const xml = await res.text();
    let locs = extractLocs(xml);

    // Sitemap index → follow first 3 child sitemaps.
    const looksLikeIndex = /<sitemapindex/i.test(xml);
    if (looksLikeIndex) {
      const childUrls = locs.slice(0, 3);
      locs = [];
      for (const child of childUrls) {
        try {
          const r = await fetchWithTimeout(child);
          if (r.ok) {
            const cx = await r.text();
            locs.push(...extractLocs(cx));
          }
        } catch {
          /* keep going */
        }
      }
    }

    // Dedup and cap.
    const unique = Array.from(new Set(locs)).slice(0, MAX_URLS);
    if (unique.length === 0) {
      return NextResponse.json(
        { error: "No URLs found in sitemap" },
        { status: 422 }
      );
    }

    // Skip URLs we already have on file (case-insensitive match).
    const existing = await db
      .select({ url: existingContent.url })
      .from(existingContent);
    const seen = new Set(existing.map((e) => e.url.toLowerCase()));

    const rows: {
      id: string;
      url: string;
      title: string;
      targetKeyword: string;
      intent: string;
      publishedDate: Date | null;
      notes: string;
    }[] = [];
    let skipped = 0;

    for (const url of unique) {
      if (seen.has(url.toLowerCase())) {
        skipped++;
        continue;
      }
      let title = "";
      try {
        const r = await fetchWithTimeout(url);
        if (r.ok) {
          const html = await r.text();
          title = extractTitle(html);
        }
      } catch {
        /* leave title empty */
      }
      // Fall back to URL path if we couldn't grab a title.
      if (!title) {
        try {
          title = new URL(url).pathname.replace(/^\/|\/$/g, "") || url;
        } catch {
          title = url;
        }
      }
      rows.push({
        id: uid("ec"),
        url,
        title,
        targetKeyword: "",
        intent: "",
        publishedDate: null,
        notes: "Imported from sitemap"
      });
    }

    if (rows.length > 0) {
      await db.insert(existingContent).values(rows);
    }
    return NextResponse.json({
      imported: rows.length,
      skipped,
      sampled: unique.length
    });
  } catch (err) {
    return serverError(err);
  }
});
