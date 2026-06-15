import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sourceConfigs } from "@/db/schema";
import { withAuth, badRequest, serverError } from "@/lib/api";
import { decryptJson } from "@/lib/encryption";
import {
  fetchCompetitorKeywords,
  type SemrushCredentials
} from "@/lib/semrush";
import {
  getCompetitorDomains,
  scoreCompetitorKeyword,
  upsertOpportunities,
  type UpsertOppInput
} from "@/lib/discovery-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/sources/semrush/sync
// Pulls top organic keywords for each Primary/Secondary competitor in
// the brand profile and writes them as opportunities, scored by
// volume + achievability.

const PER_COMPETITOR_LIMIT = 50;

export const POST = withAuth(async () => {
  try {
    const [config] = await db
      .select()
      .from(sourceConfigs)
      .where(eq(sourceConfigs.name, "semrush"))
      .limit(1);
    if (!config || !config.encryptedCredentials) {
      return badRequest(
        "SEMrush is not connected. Add your API key first."
      );
    }
    const creds = decryptJson<SemrushCredentials>(
      config.encryptedCredentials
    );

    const { competitors } = await getCompetitorDomains();
    if (competitors.length === 0) {
      return badRequest(
        "Add at least one competitor with a URL in Settings → Brand & APIs first."
      );
    }

    let totalSampled = 0;
    const rows: UpsertOppInput[] = [];
    const errors: string[] = [];

    for (const c of competitors) {
      try {
        const kws = await fetchCompetitorKeywords(
          creds,
          c.url,
          PER_COMPETITOR_LIMIT
        );
        totalSampled += kws.length;
        for (const k of kws) {
          // Filter: skip very low volume or completely entrenched
          // positions (#1 we'll never beat) — but still allow positions
          // 2-3 because they're high-prize.
          if (k.searchVolume < 50) continue;
          if (k.position > 30) continue;
          const score = scoreCompetitorKeyword(
            k.searchVolume,
            k.position
          );
          if (score < 25) continue;
          const reason =
            `${c.name || c.url} ranks #${k.position.toFixed(0)} · ` +
            `${k.searchVolume.toLocaleString()} vol/mo` +
            (k.cpc ? ` · $${k.cpc.toFixed(2)} CPC` : "");
          rows.push({
            source: "semrush",
            query: k.keyword,
            url: k.url || null,
            metrics: {
              volume: k.searchVolume,
              position: k.position,
              cpc: k.cpc,
              trafficPercent: k.trafficPercent,
              competition: k.competition,
              competitorDomain: c.url,
              competitorName: c.name
            },
            score,
            reason,
            dedupKey: `semrush::${stripDomain(c.url)}::${k.keyword.toLowerCase()}`
          });
        }
      } catch (err) {
        errors.push(`${c.name || c.url}: ${(err as Error).message}`);
      }
    }

    const upserted = await upsertOpportunities(rows);

    // Update sync timestamp + error state.
    await db
      .update(sourceConfigs)
      .set({
        lastSyncedAt: new Date(),
        lastError: errors.length ? errors.join("; ").slice(0, 500) : null,
        updatedAt: new Date()
      })
      .where(eq(sourceConfigs.name, "semrush"));

    return NextResponse.json({
      ok: true,
      sampled: totalSampled,
      opportunities: rows.length,
      upserted,
      competitorsProcessed: competitors.length,
      errors
    });
  } catch (err) {
    try {
      await db
        .update(sourceConfigs)
        .set({
          status: "error",
          lastError: (err as Error).message,
          updatedAt: new Date()
        })
        .where(eq(sourceConfigs.name, "semrush"));
    } catch {
      /* best-effort */
    }
    return serverError(err);
  }
});

function stripDomain(input: string): string {
  return input
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .trim()
    .toLowerCase();
}
