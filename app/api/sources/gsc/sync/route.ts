import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  sourceConfigs,
  discoveredOpportunities
} from "@/db/schema";
import { withAuth, badRequest, serverError } from "@/lib/api";
import { uid } from "@/lib/utils";
import { decryptJson } from "@/lib/encryption";
import {
  fetchSearchAnalytics,
  type GSCTokens,
  type GSCMetadata
} from "@/lib/gsc";
import { classifyOpportunity } from "@/lib/opportunity-classifier";
import { getBrandNames } from "@/lib/discovery-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/sources/gsc/sync
// Body: { siteUrl?: string }  — if omitted, uses sourceConfig.metadata.siteUrl
//
// Fetches last 28d of query data, scores each row, upserts into
// discoveredOpportunities. Returns counts.

const SYNC_DAYS = 28;
// Only consider rows with at least this many impressions — anything less
// is noise.
const MIN_IMPRESSIONS = 30;
// Only flag rows that DON'T already convert well — i.e. there's headroom
// to improve. Pages already crushing it aren't opportunities.
const MAX_CTR_FOR_OPPORTUNITY = 0.08;
// Sweet spot: ranking on page 2 or bottom of page 1 — a content/SEO push
// can realistically promote these to top-of-page-1.
const MIN_POSITION = 4;
const MAX_POSITION = 30;

export const POST = withAuth(async (_user, req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const [config] = await db
      .select()
      .from(sourceConfigs)
      .where(eq(sourceConfigs.name, "gsc"))
      .limit(1);
    if (!config || !config.encryptedCredentials) {
      return badRequest("GSC is not connected.");
    }
    const tokens = decryptJson<GSCTokens>(config.encryptedCredentials);
    const meta = (config.metadata as GSCMetadata) || {};
    const siteUrl: string =
      (typeof body.siteUrl === "string" && body.siteUrl) ||
      meta.siteUrl ||
      "";
    if (!siteUrl) {
      return badRequest(
        "No site selected. Pick a Search Console property first."
      );
    }

    const rows = await fetchSearchAnalytics(tokens, siteUrl, SYNC_DAYS);
    const brandNames = await getBrandNames();

    // Score + filter. Opportunities are rows where there's real demand
    // (impressions ≥ threshold), our CTR is low (headroom exists), and
    // we're ranking on page 2 / bottom of page 1 (a push can move it up).
    type Opp = {
      id: string;
      source: string;
      query: string;
      url: string | null;
      metrics: Record<string, number>;
      score: number;
      reason: string;
      dedupKey: string;
      intent: string;
      aiCitationGap: boolean;
      scoreBreakdown: Record<string, number>;
    };
    // GSC's `dimensions: ["query", "page"]` returns one row per (query,
    // page) pair — the same query showing on two different pages comes
    // back as two rows. Our dedupKey only includes the query, so we
    // first dedupe by key, keeping the highest-impression row as the
    // canonical entry. Without this, the bulk upsert hits Postgres's
    // "ON CONFLICT DO UPDATE command cannot affect row a second time"
    // error.
    const byKey = new Map<string, Opp>();
    for (const r of rows) {
      if (r.impressions < MIN_IMPRESSIONS) continue;
      if (r.ctr > MAX_CTR_FOR_OPPORTUNITY) continue;
      if (r.position < MIN_POSITION || r.position > MAX_POSITION) continue;

      // Use the new 4-pillar classifier so the score has a breakdown,
      // intent, and AI citation gap signal attached.
      const classified = classifyOpportunity({
        source: "gsc",
        query: r.query,
        brandNames,
        impressions: r.impressions,
        position: r.position,
        ctr: r.ctr
      });

      const reason =
        `${r.impressions.toLocaleString()} impressions @ pos ${r.position.toFixed(1)} · ` +
        `${(r.ctr * 100).toFixed(1)}% CTR`;

      const dedupKey = `gsc::${siteUrl}::${r.query.toLowerCase()}`;
      const existing = byKey.get(dedupKey);
      // Keep the row with the higher impressions — that's the
      // best-performing page for the query, the most useful URL to
      // surface as the example link.
      if (existing && existing.metrics.impressions >= r.impressions) continue;

      byKey.set(dedupKey, {
        id: existing?.id || uid("disc"),
        source: "gsc",
        query: r.query,
        url: r.page || null,
        metrics: {
          impressions: r.impressions,
          clicks: r.clicks,
          ctr: r.ctr,
          position: r.position
        },
        score: classified.totalScore,
        reason,
        dedupKey,
        intent: classified.intent,
        aiCitationGap: classified.aiCitationGap,
        scoreBreakdown: classified.scoreBreakdown as unknown as Record<
          string,
          number
        >
      });
    }
    const ops: Opp[] = Array.from(byKey.values());

    // Upsert: insert anything new (skip dups via onConflictDoNothing),
    // then refresh metrics on every row in a separate UPDATE pass. We
    // can't use a single ON CONFLICT DO UPDATE because Drizzle's `set`
    // values are static per-call (they apply the FIRST row's values to
    // every conflicting row, not the row-specific values).
    const CHUNK = 100;
    for (let i = 0; i < ops.length; i += CHUNK) {
      const slice = ops.slice(i, i + CHUNK);
      await db
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
            dedupKey: o.dedupKey,
            intent: o.intent,
            aiCitationGap: o.aiCitationGap,
            scoreBreakdown: o.scoreBreakdown
          }))
        )
        .onConflictDoNothing();
    }

    // Per-row UPDATE so re-syncs refresh metrics + score on rows that
    // already existed.
    for (const o of ops) {
      await db
        .update(discoveredOpportunities)
        .set({
          metrics: o.metrics,
          score: o.score,
          reason: o.reason,
          url: o.url,
          intent: o.intent,
          aiCitationGap: o.aiCitationGap,
          scoreBreakdown: o.scoreBreakdown,
          updatedAt: new Date()
        })
        .where(eq(discoveredOpportunities.dedupKey, o.dedupKey));
    }
    const upserts = ops.length;

    // Persist selected site + lastSyncedAt so subsequent syncs default to it.
    await db
      .update(sourceConfigs)
      .set({
        metadata: { ...meta, siteUrl },
        lastSyncedAt: new Date(),
        lastError: null,
        updatedAt: new Date()
      })
      .where(eq(sourceConfigs.name, "gsc"));

    return NextResponse.json({
      ok: true,
      siteUrl,
      sampled: rows.length,
      opportunities: ops.length,
      upserted: upserts
    });
  } catch (err) {
    // Mark the source as errored for visibility on the Settings page.
    try {
      await db
        .update(sourceConfigs)
        .set({
          status: "error",
          lastError: (err as Error).message,
          updatedAt: new Date()
        })
        .where(eq(sourceConfigs.name, "gsc"));
    } catch {
      /* best-effort */
    }
    return serverError(err);
  }
});
