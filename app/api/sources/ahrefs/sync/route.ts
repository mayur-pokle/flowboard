import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sourceConfigs } from "@/db/schema";
import { withAuth, badRequest, serverError } from "@/lib/api";
import { decryptJson } from "@/lib/encryption";
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PER_COMPETITOR_LIMIT = 50;

export const POST = withAuth(async () => {
  try {
    const [config] = await db
      .select()
      .from(sourceConfigs)
      .where(eq(sourceConfigs.name, "ahrefs"))
      .limit(1);
    if (!config || !config.encryptedCredentials) {
      return badRequest("Ahrefs is not connected. Add your API key first.");
    }
    const creds = decryptJson<AhrefsCredentials>(
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
        const kws = await fetchOrganicKeywords(
          creds,
          c.url,
          PER_COMPETITOR_LIMIT
        );
        totalSampled += kws.length;
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
              : "");
          rows.push({
            source: "ahrefs",
            query: k.keyword,
            url: k.url || null,
            metrics: {
              volume: k.searchVolume,
              position: k.position,
              difficulty: k.difficulty,
              trafficValue: k.trafficValue,
              competitorDomain: c.url,
              competitorName: c.name
            },
            score,
            reason,
            dedupKey: `ahrefs::${stripDomain(c.url)}::${k.keyword.toLowerCase()}`
          });
        }
      } catch (err) {
        errors.push(`${c.name || c.url}: ${(err as Error).message}`);
      }
    }

    const upserted = await upsertOpportunities(rows);

    await db
      .update(sourceConfigs)
      .set({
        lastSyncedAt: new Date(),
        lastError: errors.length ? errors.join("; ").slice(0, 500) : null,
        updatedAt: new Date()
      })
      .where(eq(sourceConfigs.name, "ahrefs"));

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
        .where(eq(sourceConfigs.name, "ahrefs"));
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
