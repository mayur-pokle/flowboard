// ── Refresh detector ──────────────────────────────────────────────────
//
// Joins Content Library entries (what we've published) with GSC page-
// level performance (how those pages are actually doing) and flags
// entries that need a refresh based on:
//
//   1. Rank drop      — current 28d position is ≥ 5 worse than previous 28d
//   2. Lost top tier  — was in top 5, now isn't
//   3. Stale + ranking — > 180 days since lastReviewedDate AND ranks 6-30
//   4. Low CTR        — page is ranking with impressions but CTR is well
//                       below the SERP CTR baseline for its position
//
// Refresh candidates flow into the same `discoveredOpportunities` table
// as other sources, with source = "refresh", so they show up in the
// existing /discovery feed with their own colored pill.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  sourceConfigs,
  existingContent as existingContentTbl,
  discoveredOpportunities
} from "@/db/schema";
import { decryptJson } from "@/lib/encryption";
import { uid } from "@/lib/utils";
import {
  fetchPagePerformance,
  type GSCMetadata,
  type GSCTokens
} from "@/lib/gsc";

export interface RefreshSyncResult {
  source: "refresh";
  ok: boolean;
  pagesChecked: number;
  candidates: number;
  error?: string;
}

const CURRENT_WINDOW_DAYS = 28;
const PREVIOUS_WINDOW_DAYS = 28;
const RANK_DROP_THRESHOLD = 5;
const STALE_DAYS = 180;
const MIN_IMPRESSIONS = 50;

// Rough SERP CTR baseline by position — used to flag pages getting
// significantly less click traffic than peers at the same position.
// Source: aggregate CTR curves published by Backlinko / Advanced Web
// Ranking. Approximate; we just need a directionally correct floor.
const CTR_BASELINE: Record<number, number> = {
  1: 0.28,
  2: 0.155,
  3: 0.11,
  4: 0.08,
  5: 0.06,
  6: 0.045,
  7: 0.035,
  8: 0.028,
  9: 0.022,
  10: 0.019
};
function expectedCtrFor(position: number): number {
  const rounded = Math.max(1, Math.min(10, Math.round(position)));
  return CTR_BASELINE[rounded] ?? 0.015;
}

// Normalize a URL for matching between Content Library and GSC. Lower-
// case the scheme/host, strip trailing slash, drop the query string.
function normalizeUrl(input: string): string {
  try {
    const u = new URL(input);
    let p = u.pathname.replace(/\/$/, "");
    if (p === "") p = "/";
    return (
      u.protocol.toLowerCase() +
      "//" +
      u.host.replace(/^www\./, "").toLowerCase() +
      p
    );
  } catch {
    return input.trim().toLowerCase().replace(/\/$/, "");
  }
}

export async function syncRefresh(): Promise<RefreshSyncResult> {
  const out: RefreshSyncResult = {
    source: "refresh",
    ok: false,
    pagesChecked: 0,
    candidates: 0
  };
  try {
    // ── Preconditions: GSC connected + a property selected ──
    const [gscCfg] = await db
      .select()
      .from(sourceConfigs)
      .where(eq(sourceConfigs.name, "gsc"))
      .limit(1);
    if (!gscCfg || gscCfg.status !== "connected" || !gscCfg.encryptedCredentials) {
      throw new Error("Connect Google Search Console first.");
    }
    const meta = (gscCfg.metadata as GSCMetadata) || {};
    if (!meta.siteUrl) {
      throw new Error(
        "Pick a GSC property in Settings → Data sources first."
      );
    }
    const tokens = decryptJson<GSCTokens>(gscCfg.encryptedCredentials);

    // ── Load Content Library entries to join against ──
    const libraryRows = await db.select().from(existingContentTbl);
    if (libraryRows.length === 0) {
      throw new Error(
        "Content Library is empty. Import your sitemap in Settings → Content library first."
      );
    }

    // ── Fetch current 28d and previous 28d page-level data ──
    const now = new Date();
    const currentEnd = now;
    const currentStart = new Date(
      now.getTime() - CURRENT_WINDOW_DAYS * 24 * 60 * 60 * 1000
    );
    const previousEnd = currentStart;
    const previousStart = new Date(
      currentStart.getTime() - PREVIOUS_WINDOW_DAYS * 24 * 60 * 60 * 1000
    );

    const [current, previous] = await Promise.all([
      fetchPagePerformance(tokens, meta.siteUrl, currentStart, currentEnd),
      fetchPagePerformance(tokens, meta.siteUrl, previousStart, previousEnd)
    ]);

    // Index by normalized URL for O(1) lookup during join.
    const currentByUrl = new Map<string, (typeof current)[number]>();
    for (const r of current) currentByUrl.set(normalizeUrl(r.page), r);
    const previousByUrl = new Map<string, (typeof previous)[number]>();
    for (const r of previous) previousByUrl.set(normalizeUrl(r.page), r);

    // ── Score each library row that has matching GSC data ──
    type RefreshOpp = {
      id: string;
      query: string;
      url: string;
      metrics: Record<string, number>;
      score: number;
      reason: string;
      dedupKey: string;
    };
    const candidates: RefreshOpp[] = [];

    for (const lib of libraryRows) {
      const url = normalizeUrl(lib.url);
      const cur = currentByUrl.get(url);
      const prev = previousByUrl.get(url);
      if (!cur) continue; // page not indexed / no impressions — skip silently
      out.pagesChecked++;
      if (cur.impressions < MIN_IMPRESSIONS) continue;

      // Detect signals.
      const positionDelta = prev ? cur.position - prev.position : 0; // positive = worse
      const lostTopTier =
        Boolean(prev) && prev!.position <= 5 && cur.position > 5;
      const expectedCtr = expectedCtrFor(cur.position);
      const ctrGap = expectedCtr - cur.ctr; // positive = underperforming
      const ageDays = lib.publishedDate
        ? (now.getTime() - lib.publishedDate.getTime()) /
          (24 * 60 * 60 * 1000)
        : null;
      const reviewedDays = lib.createdAt
        ? // Use createdAt as a proxy when lastReviewedDate isn't tracked
          // — the Content Library row dates the entry was added.
          (now.getTime() - lib.createdAt.getTime()) / (24 * 60 * 60 * 1000)
        : null;

      const reasons: string[] = [];
      if (positionDelta >= RANK_DROP_THRESHOLD) {
        reasons.push(
          `Rank dropped from #${prev!.position.toFixed(1)} → #${cur.position.toFixed(1)}`
        );
      }
      if (lostTopTier) {
        reasons.push(
          `Lost top-5 ranking (now #${cur.position.toFixed(1)})`
        );
      }
      if (
        reviewedDays !== null &&
        reviewedDays > STALE_DAYS &&
        cur.position > 5 &&
        cur.position <= 30
      ) {
        reasons.push(
          `Stale (${Math.round(reviewedDays)}d since added, still ranking)`
        );
      }
      if (ctrGap > 0.02 && cur.position <= 10) {
        reasons.push(
          `CTR ${(cur.ctr * 100).toFixed(1)}% vs expected ${(
            expectedCtr * 100
          ).toFixed(1)}% at pos ${cur.position.toFixed(1)}`
        );
      }
      if (reasons.length === 0) continue;

      // Score 0-100.
      let score = 0;
      // 0-40 from rank drop magnitude (or 40 if lost top tier)
      if (lostTopTier) score += 40;
      else if (positionDelta > 0)
        score += Math.min(40, positionDelta * 4);
      // 0-30 from current impression weight (log scale)
      score += Math.min(
        30,
        (Math.log10(Math.max(1, cur.impressions)) / Math.log10(10000)) * 30
      );
      // 0-20 from CTR gap (positive gap = underperforming)
      if (ctrGap > 0) score += Math.min(20, ctrGap * 200);
      // 0-10 stale bonus
      if (reviewedDays !== null && reviewedDays > STALE_DAYS) score += 10;
      score = Math.max(0, Math.min(100, Math.round(score)));

      candidates.push({
        id: uid("disc"),
        query: lib.title || lib.url, // we don't have a query — display the title
        url: lib.url,
        metrics: {
          currentPosition: cur.position,
          previousPosition: prev?.position ?? 0,
          impressions: cur.impressions,
          clicks: cur.clicks,
          ctr: cur.ctr,
          expectedCtr,
          positionDelta,
          reviewedDays: reviewedDays ?? 0,
          ageDays: ageDays ?? 0
        },
        score,
        reason: reasons.join(" · "),
        // Use the LIBRARY url so re-syncs always update the same row
        // even if GSC normalizes differently.
        dedupKey: `refresh::${normalizeUrl(lib.url)}`
      });
    }

    // Upsert. Same pattern as the other source runners.
    const CHUNK = 100;
    for (let i = 0; i < candidates.length; i += CHUNK) {
      const slice = candidates.slice(i, i + CHUNK);
      await db
        .insert(discoveredOpportunities)
        .values(
          slice.map((o) => ({
            id: o.id,
            source: "refresh",
            query: o.query,
            url: o.url,
            metrics: o.metrics,
            score: o.score,
            status: "new",
            reason: o.reason,
            dedupKey: o.dedupKey
          }))
        )
        .onConflictDoNothing();
    }
    for (const o of candidates) {
      await db
        .update(discoveredOpportunities)
        .set({
          query: o.query,
          metrics: o.metrics,
          score: o.score,
          reason: o.reason,
          url: o.url,
          updatedAt: new Date()
        })
        .where(eq(discoveredOpportunities.dedupKey, o.dedupKey));
    }
    out.candidates = candidates.length;

    // Track lastSyncedAt + status against a virtual sourceConfigs row.
    await db
      .insert(sourceConfigs)
      .values({
        name: "refresh",
        status: "connected",
        lastSyncedAt: new Date(),
        lastError: null,
        connectedAt: new Date(),
        updatedAt: new Date()
      })
      .onConflictDoUpdate({
        target: sourceConfigs.name,
        set: {
          status: "connected",
          lastSyncedAt: new Date(),
          lastError: null,
          updatedAt: new Date()
        }
      });

    out.ok = true;
    return out;
  } catch (err) {
    out.error = (err as Error).message;
    try {
      await db
        .insert(sourceConfigs)
        .values({
          name: "refresh",
          status: "error",
          lastError: out.error,
          updatedAt: new Date()
        })
        .onConflictDoUpdate({
          target: sourceConfigs.name,
          set: {
            status: "error",
            lastError: out.error,
            updatedAt: new Date()
          }
        });
    } catch {
      /* best-effort */
    }
    return out;
  }
}
