import { db } from "@/db";
import {
  competitors,
  discoveredOpportunities,
  settings
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { uid } from "@/lib/utils";

// Shared helpers used by both SEMrush + Ahrefs sync routes — pulling
// competitor list from the brand profile and writing opportunity rows
// to the DB.

export async function getCompetitorDomains(): Promise<{
  ourDomain: string | null;
  competitors: Array<{ name: string; url: string; tier: string }>;
}> {
  const [s] = await db
    .select()
    .from(settings)
    .where(eq(settings.id, "workspace"))
    .limit(1);
  const comps = await db.select().from(competitors);
  const usable = comps
    .filter((c) => c.url && c.tier !== "watch")
    .map((c) => ({ name: c.name, url: c.url, tier: c.tier }));
  return { ourDomain: s?.websiteUrl || null, competitors: usable };
}

// All brand-ish names we might want to treat as "navigational" hits in
// the intent classifier — our own company + every competitor's name.
export async function getBrandNames(): Promise<string[]> {
  const [s] = await db
    .select()
    .from(settings)
    .where(eq(settings.id, "workspace"))
    .limit(1);
  const comps = await db.select().from(competitors);
  const names = new Set<string>();
  if (s?.companyName) names.add(s.companyName.trim());
  for (const c of comps) {
    if (c.name) names.add(c.name.trim());
  }
  return Array.from(names).filter(Boolean);
}

export interface UpsertOppInput {
  source: "semrush" | "ahrefs";
  query: string;
  url: string | null;
  metrics: Record<string, unknown>;
  score: number;
  reason: string;
  dedupKey: string;
  // New 4-pillar fields. Optional for backwards-compat with refresh
  // runner + any older callers, but every fresh sync should set them.
  intent?: string;
  aiCitationGap?: boolean;
  scoreBreakdown?: Record<string, number>;
}

// Score a competitor keyword: log-scale volume × (penalize-low-positions
// because higher positions = more achievable for us). Clamped 0-100.
export function scoreCompetitorKeyword(
  volume: number,
  position: number,
  difficulty?: number
): number {
  if (!volume || volume < 10) return 0;
  // 0-70 from volume (log scale, 10k vol caps it at 70)
  const volumeScore = Math.min(
    70,
    (Math.log10(Math.max(1, volume)) / Math.log10(10000)) * 70
  );
  // 0-20 from achievability — if competitor is at position 4-15, we can
  // realistically chase. Positions 1-3 are very entrenched, 16+ already
  // weak (less of a "they're winning" signal).
  let positionScore = 0;
  if (position >= 4 && position <= 15) {
    positionScore = 20 * (1 - (position - 4) / 11);
  } else if (position <= 3) {
    positionScore = 8; // they're dominant; hard to beat but high prize
  } else if (position <= 30) {
    positionScore = 4; // still ranks but weak
  }
  // 0-10 difficulty bonus (inverse — easier keywords get more)
  let difficultyScore = 5;
  if (typeof difficulty === "number") {
    difficultyScore = Math.max(0, 10 - difficulty / 10);
  }
  return Math.round(volumeScore + positionScore + difficultyScore);
}

// Upserts a batch of opportunities using dedupKey for idempotency.
export async function upsertOpportunities(
  rows: UpsertOppInput[]
): Promise<number> {
  if (rows.length === 0) return 0;
  const CHUNK = 100;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    await db
      .insert(discoveredOpportunities)
      .values(
        slice.map((o) => ({
          id: uid("disc"),
          source: o.source,
          query: o.query,
          url: o.url,
          metrics: o.metrics,
          score: o.score,
          status: "new",
          reason: o.reason,
          dedupKey: o.dedupKey,
          intent: o.intent,
          aiCitationGap: o.aiCitationGap ?? false,
          scoreBreakdown: o.scoreBreakdown
        }))
      )
      .onConflictDoNothing();
  }
  // Per-row accurate update for metrics/score since onConflictDoNothing
  // skipped duplicates above. This ensures re-sync refreshes data.
  for (const o of rows) {
    await db
      .update(discoveredOpportunities)
      .set({
        metrics: o.metrics,
        score: o.score,
        reason: o.reason,
        url: o.url,
        intent: o.intent,
        aiCitationGap: o.aiCitationGap ?? false,
        scoreBreakdown: o.scoreBreakdown,
        updatedAt: new Date()
      })
      .where(eq(discoveredOpportunities.dedupKey, o.dedupKey));
  }
  return rows.length;
}
