// ── Source sync orchestrators ─────────────────────────────────────────
//
// Pure functions that:
//   1. Load + decrypt a source's stored credentials
//   2. Fetch fresh data from the provider
//   3. Score the rows and upsert into discoveredOpportunities
//   4. Update sourceConfigs.lastSyncedAt / lastError / status
//
// Both the HTTP route handlers and the weekly cron call these so the
// orchestration logic lives in exactly one place.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sourceConfigs } from "@/db/schema";
import { decryptJson } from "@/lib/encryption";
import { uid } from "@/lib/utils";
import {
  fetchSearchAnalytics,
  type GSCMetadata,
  type GSCTokens
} from "@/lib/gsc";
import {
  fetchCompetitorKeywords,
  type SemrushCredentials
} from "@/lib/semrush";
import {
  fetchOrganicKeywords,
  type AhrefsCredentials
} from "@/lib/ahrefs";
import {
  getCompetitorDomains,
  scoreCompetitorKeyword,
  upsertOpportunities,
  type UpsertOppInput
} from "@/lib/discovery-shared";
import { db as dbClient } from "@/db";
import { discoveredOpportunities } from "@/db/schema";

export interface SyncResult {
  source: "gsc" | "semrush" | "ahrefs";
  ok: boolean;
  sampled: number;
  opportunities: number;
  error?: string;
}

// ── GSC ───────────────────────────────────────────────────────────────

const GSC_SYNC_DAYS = 28;
const GSC_MIN_IMPRESSIONS = 30;
const GSC_MAX_CTR = 0.08;
const GSC_MIN_POSITION = 4;
const GSC_MAX_POSITION = 30;

export async function syncGsc(): Promise<SyncResult> {
  const out: SyncResult = {
    source: "gsc",
    ok: false,
    sampled: 0,
    opportunities: 0
  };
  try {
    const [config] = await db
      .select()
      .from(sourceConfigs)
      .where(eq(sourceConfigs.name, "gsc"))
      .limit(1);
    if (!config || !config.encryptedCredentials) {
      throw new Error("GSC is not connected.");
    }
    const meta = (config.metadata as GSCMetadata) || {};
    if (!meta.siteUrl) {
      throw new Error("No GSC property selected.");
    }
    const tokens = decryptJson<GSCTokens>(config.encryptedCredentials);
    const rows = await fetchSearchAnalytics(
      tokens,
      meta.siteUrl,
      GSC_SYNC_DAYS
    );
    out.sampled = rows.length;

    const ops: Array<{
      id: string;
      source: string;
      query: string;
      url: string | null;
      metrics: Record<string, number>;
      score: number;
      reason: string;
      dedupKey: string;
    }> = [];

    for (const r of rows) {
      if (r.impressions < GSC_MIN_IMPRESSIONS) continue;
      if (r.ctr > GSC_MAX_CTR) continue;
      if (r.position < GSC_MIN_POSITION || r.position > GSC_MAX_POSITION)
        continue;

      const impressionScore = Math.min(
        50,
        (Math.log10(Math.max(1, r.impressions)) / Math.log10(10000)) * 50
      );
      const positionScore = Math.max(
        0,
        30 *
          (1 -
            (r.position - GSC_MIN_POSITION) /
              (GSC_MAX_POSITION - GSC_MIN_POSITION))
      );
      const ctrScore = Math.max(0, 20 * (1 - r.ctr / GSC_MAX_CTR));
      const score = Math.round(impressionScore + positionScore + ctrScore);

      ops.push({
        id: uid("disc"),
        source: "gsc",
        query: r.query,
        url: r.page || null,
        metrics: {
          impressions: r.impressions,
          clicks: r.clicks,
          ctr: r.ctr,
          position: r.position
        },
        score,
        reason:
          `${r.impressions.toLocaleString()} impressions @ pos ${r.position.toFixed(1)} · ` +
          `${(r.ctr * 100).toFixed(1)}% CTR`,
        dedupKey: `gsc::${meta.siteUrl}::${r.query.toLowerCase()}`
      });
    }

    // Bulk insert + per-row metric refresh.
    const CHUNK = 100;
    for (let i = 0; i < ops.length; i += CHUNK) {
      const slice = ops.slice(i, i + CHUNK);
      await dbClient
        .insert(discoveredOpportunities)
        .values(
          slice.map((o) => ({
            id: o.id,
            source: o.source,
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
    for (const o of ops) {
      await dbClient
        .update(discoveredOpportunities)
        .set({
          metrics: o.metrics,
          score: o.score,
          reason: o.reason,
          url: o.url,
          updatedAt: new Date()
        })
        .where(eq(discoveredOpportunities.dedupKey, o.dedupKey));
    }
    out.opportunities = ops.length;

    await db
      .update(sourceConfigs)
      .set({
        lastSyncedAt: new Date(),
        lastError: null,
        updatedAt: new Date()
      })
      .where(eq(sourceConfigs.name, "gsc"));

    out.ok = true;
    return out;
  } catch (err) {
    out.error = (err as Error).message;
    try {
      await db
        .update(sourceConfigs)
        .set({
          status: "error",
          lastError: out.error,
          updatedAt: new Date()
        })
        .where(eq(sourceConfigs.name, "gsc"));
    } catch {
      /* best-effort */
    }
    return out;
  }
}

// ── Shared competitor-source runner (SEMrush + Ahrefs) ────────────────
// Both providers follow the same shape: pull competitors from brand
// profile, fetch each competitor's top keywords, score, upsert. Just the
// fetch + dedup-key formatting differ.

const PER_COMPETITOR_LIMIT = 50;

async function syncCompetitorSource(
  sourceName: "semrush" | "ahrefs"
): Promise<SyncResult> {
  const out: SyncResult = {
    source: sourceName,
    ok: false,
    sampled: 0,
    opportunities: 0
  };
  try {
    const [config] = await db
      .select()
      .from(sourceConfigs)
      .where(eq(sourceConfigs.name, sourceName))
      .limit(1);
    if (!config || !config.encryptedCredentials) {
      throw new Error(`${sourceName} is not connected.`);
    }

    const { competitors } = await getCompetitorDomains();
    if (competitors.length === 0) {
      throw new Error(
        "Add at least one competitor with a URL in Settings → Brand & APIs first."
      );
    }

    const rows: UpsertOppInput[] = [];
    const errors: string[] = [];

    for (const c of competitors) {
      try {
        let kws: Array<{
          keyword: string;
          position: number;
          searchVolume: number;
          url: string;
          difficulty?: number;
          cpc?: number;
          trafficPercent?: number;
          competition?: number;
          trafficValue?: number;
        }>;
        if (sourceName === "semrush") {
          const creds = decryptJson<SemrushCredentials>(
            config.encryptedCredentials
          );
          const raw = await fetchCompetitorKeywords(
            creds,
            c.url,
            PER_COMPETITOR_LIMIT
          );
          kws = raw;
        } else {
          const creds = decryptJson<AhrefsCredentials>(
            config.encryptedCredentials
          );
          const raw = await fetchOrganicKeywords(
            creds,
            c.url,
            PER_COMPETITOR_LIMIT
          );
          kws = raw;
        }
        out.sampled += kws.length;

        for (const k of kws) {
          if (k.searchVolume < 50) continue;
          if (k.position > 30) continue;
          const score = scoreCompetitorKeyword(
            k.searchVolume,
            k.position,
            k.difficulty
          );
          if (score < 25) continue;
          const reason =
            `${c.name || c.url} ranks #${k.position.toFixed(0)} · ` +
            `${k.searchVolume.toLocaleString()} vol/mo` +
            (typeof k.difficulty === "number"
              ? ` · KD ${k.difficulty}`
              : k.cpc
              ? ` · $${k.cpc.toFixed(2)} CPC`
              : "");
          rows.push({
            source: sourceName,
            query: k.keyword,
            url: k.url || null,
            metrics: {
              volume: k.searchVolume,
              position: k.position,
              ...(k.difficulty != null ? { difficulty: k.difficulty } : {}),
              ...(k.cpc != null ? { cpc: k.cpc } : {}),
              ...(k.trafficPercent != null
                ? { trafficPercent: k.trafficPercent }
                : {}),
              ...(k.competition != null
                ? { competition: k.competition }
                : {}),
              ...(k.trafficValue != null
                ? { trafficValue: k.trafficValue }
                : {}),
              competitorDomain: c.url,
              competitorName: c.name
            },
            score,
            reason,
            dedupKey: `${sourceName}::${stripDomain(c.url)}::${k.keyword.toLowerCase()}`
          });
        }
      } catch (err) {
        errors.push(`${c.name || c.url}: ${(err as Error).message}`);
      }
    }

    out.opportunities = await upsertOpportunities(rows);

    await db
      .update(sourceConfigs)
      .set({
        lastSyncedAt: new Date(),
        lastError: errors.length ? errors.join("; ").slice(0, 500) : null,
        updatedAt: new Date()
      })
      .where(eq(sourceConfigs.name, sourceName));

    out.ok = true;
    return out;
  } catch (err) {
    out.error = (err as Error).message;
    try {
      await db
        .update(sourceConfigs)
        .set({
          status: "error",
          lastError: out.error,
          updatedAt: new Date()
        })
        .where(eq(sourceConfigs.name, sourceName));
    } catch {
      /* best-effort */
    }
    return out;
  }
}

export async function syncSemrush(): Promise<SyncResult> {
  return syncCompetitorSource("semrush");
}

export async function syncAhrefs(): Promise<SyncResult> {
  return syncCompetitorSource("ahrefs");
}

// Runs every connected source. Best-effort: one source failing doesn't
// abort the others. Returns a per-source result array.
//
// `refresh` is special — it has no external credentials, so we run it
// last (if any opportunities exist to score against) and only when both
// GSC + Content Library have data. The runner itself raises a clear
// error message if those preconditions aren't met, so we just attempt
// it and catch.
export async function syncAllConnectedSources(): Promise<
  Array<SyncResult | { source: "refresh"; ok: boolean; error?: string }>
> {
  const rows = await db.select().from(sourceConfigs);
  const results: Array<
    SyncResult | { source: "refresh"; ok: boolean; error?: string }
  > = [];
  let gscRanSuccessfully = false;
  for (const r of rows) {
    if (r.status !== "connected") continue;
    if (r.name === "gsc") {
      const res = await syncGsc();
      results.push(res);
      if (res.ok) gscRanSuccessfully = true;
    } else if (r.name === "semrush") {
      results.push(await syncSemrush());
    } else if (r.name === "ahrefs") {
      results.push(await syncAhrefs());
    }
  }

  // If GSC succeeded this run, also attempt refresh detection. Lazy
  // import to avoid a circular dependency.
  if (gscRanSuccessfully) {
    try {
      const { syncRefresh } = await import("@/lib/refresh-runner");
      const r = await syncRefresh();
      results.push({
        source: "refresh",
        ok: r.ok,
        error: r.error
      });
    } catch (err) {
      results.push({
        source: "refresh",
        ok: false,
        error: (err as Error).message
      });
    }
  }

  return results;
}

function stripDomain(input: string): string {
  return input
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .trim()
    .toLowerCase();
}
