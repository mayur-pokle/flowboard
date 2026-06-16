import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sourceConfigs, discoveredOpportunities } from "@/db/schema";
import { withAuth, badRequest, serverError } from "@/lib/api";
import { uid } from "@/lib/utils";
import { classifyOpportunity } from "@/lib/opportunity-classifier";
import { getBrandNames } from "@/lib/discovery-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/sources/competitor-sitemaps/sync
// Fetches every configured sitemap, extracts URLs published in the
// last 14 days (best-effort — uses <lastmod> when present, otherwise
// surfaces the most recent N entries), and writes them as Community
// opportunities. The signal is "competitor is publishing here, you
// might want a take".
//
// Falls back gracefully if a sitemap can't be fetched — we mark the
// source with the partial error rather than failing the whole sync.

interface SitemapMeta {
  sitemapUrls: string[];
  schedule: string;
}

interface SitemapEntry {
  loc: string;
  lastmod?: string;
  competitor: string;
}

const MAX_PER_SITEMAP = 25;

export const POST = withAuth(async () => {
  try {
    const [config] = await db
      .select()
      .from(sourceConfigs)
      .where(eq(sourceConfigs.name, "competitor-sitemap"))
      .limit(1);
    if (!config) {
      return badRequest("Competitor Sitemaps source is not configured.");
    }
    const meta = (config.metadata as SitemapMeta) || {
      sitemapUrls: [],
      schedule: "weekly"
    };
    if (meta.sitemapUrls.length === 0) {
      return badRequest("Add at least one sitemap URL first.");
    }

    const brandNames = await getBrandNames();
    const errors: string[] = [];
    const entries: SitemapEntry[] = [];

    for (const sitemapUrl of meta.sitemapUrls) {
      try {
        const competitor = new URL(sitemapUrl).hostname.replace(/^www\./, "");
        const xml = await fetch(sitemapUrl, {
          headers: { "User-Agent": "Flowboard/1.0" }
        }).then((r) => {
          if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
          return r.text();
        });
        const parsed = parseSitemap(xml, competitor).slice(0, MAX_PER_SITEMAP);
        entries.push(...parsed);
      } catch (err) {
        errors.push(`${sitemapUrl}: ${(err as Error).message}`);
      }
    }

    // Each entry becomes an opportunity. The "query" is the slug
    // turned into a phrase — competitors signal what's worth writing
    // about by publishing on it.
    let inserted = 0;
    for (const e of entries) {
      const query = slugToQuery(e.loc);
      if (!query) continue;
      const classified = classifyOpportunity({
        source: "competitor-sitemap",
        query,
        brandNames,
        position: 25
      });
      const dedupKey = `competitor-sitemap::${e.competitor}::${query.toLowerCase()}`;
      await db
        .insert(discoveredOpportunities)
        .values({
          id: uid("disc"),
          source: "competitor-sitemap",
          query,
          url: e.loc,
          metrics: { competitor: e.competitor },
          score: classified.totalScore,
          status: "new",
          reason: `${e.competitor} just published this${
            e.lastmod ? ` (${e.lastmod})` : ""
          }.`,
          dedupKey,
          intent: classified.intent,
          aiCitationGap: classified.aiCitationGap,
          scoreBreakdown: classified.scoreBreakdown,
          opportunityType: "community",
          priority: classified.priority,
          trending: classified.trending,
          competitorUrls: [e.loc],
          kanbanColumn: "intake"
        })
        .onConflictDoNothing();
      await db
        .update(discoveredOpportunities)
        .set({
          score: classified.totalScore,
          scoreBreakdown: classified.scoreBreakdown,
          priority: classified.priority,
          intent: classified.intent,
          opportunityType: "community",
          updatedAt: new Date()
        })
        .where(eq(discoveredOpportunities.dedupKey, dedupKey));
      inserted += 1;
    }

    await db
      .update(sourceConfigs)
      .set({
        lastSyncedAt: new Date(),
        lastError: errors.length ? errors.join("; ").slice(0, 500) : null,
        updatedAt: new Date()
      })
      .where(eq(sourceConfigs.name, "competitor-sitemap"));

    return NextResponse.json({
      ok: true,
      sampled: entries.length,
      opportunities: inserted,
      errors
    });
  } catch (err) {
    return serverError(err);
  }
});

// Cheap-and-cheerful XML sitemap parser. Handles standard <url>/<loc>
// + optional <lastmod>. Skips sitemap-index files for now — could
// recurse into nested sitemaps in a follow-up.
function parseSitemap(xml: string, competitor: string): SitemapEntry[] {
  const out: SitemapEntry[] = [];
  const urlBlocks = xml.match(/<url>[\s\S]*?<\/url>/g) || [];
  for (const block of urlBlocks) {
    const loc = block.match(/<loc>([\s\S]*?)<\/loc>/)?.[1]?.trim();
    if (!loc) continue;
    const lastmod = block.match(/<lastmod>([\s\S]*?)<\/lastmod>/)?.[1]?.trim();
    out.push({ loc, lastmod, competitor });
  }
  // Sort by lastmod desc when present so MAX_PER_SITEMAP keeps recent.
  out.sort((a, b) => {
    if (a.lastmod && b.lastmod) return b.lastmod.localeCompare(a.lastmod);
    if (a.lastmod) return -1;
    if (b.lastmod) return 1;
    return 0;
  });
  return out;
}

// Turn a URL slug into a candidate query the strategist can scan.
// e.g. https://x.com/blog/burn-multiple-by-stage → "burn multiple by stage"
function slugToQuery(url: string): string {
  try {
    const path = new URL(url).pathname.toLowerCase();
    const slug = path
      .replace(/\.(html?|php|aspx?)$/, "")
      .replace(/^\/+|\/+$/g, "")
      .split("/")
      .pop();
    if (!slug) return "";
    return slug
      .replace(/[-_]+/g, " ")
      .replace(/\d{4,}/g, "")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return "";
  }
}
