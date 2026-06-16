// ── Sample data seeder ───────────────────────────────────────────────
//
// The board MUST be usable with zero API keys + zero data sources.
// On first load (or via an explicit reseed) we drop 10 realistic
// opportunities into the DB so the strategist can experience the full
// workflow — accept, brief, generate, mark done — without any setup.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { discoveredOpportunities } from "@/db/schema";
import { uid } from "@/lib/utils";
import type {
  Intent,
  OpportunityType,
  Priority,
  ScoreBreakdown
} from "@/lib/opportunity-classifier";

interface Sample {
  query: string;
  source: string; // gsc | semrush | ahrefs | refresh | ai-citations | sitemap
  opportunityType: OpportunityType;
  kanbanColumn: "intake" | "new" | "in_progress" | "done";
  intent: Intent;
  priority: Priority;
  trending: boolean;
  aiCitationGap: boolean;
  weeklyImpressions: number;
  previousWeekImpressions: number;
  position: number | null;
  ctr: number | null;
  competitorGapScore: number;
  competitorUrls: string[];
  aiCitationsCited: string[];
  cannibalizingPages: Array<{ url: string; title: string }>;
  scoreBreakdown: ScoreBreakdown;
  reason: string;
  url: string | null;
}

const SAMPLES: Sample[] = [
  // ── Intake column — fresh, awaiting decision ──
  {
    query: "best cash flow forecasting software",
    source: "semrush",
    opportunityType: "new",
    kanbanColumn: "intake",
    intent: "commercial",
    priority: "P0",
    trending: true,
    aiCitationGap: true,
    weeklyImpressions: 12480,
    previousWeekImpressions: 8930,
    position: 8.4,
    ctr: 0.024,
    competitorGapScore: 78,
    competitorUrls: [
      "https://example-competitor-a.com/cash-flow-software",
      "https://example-competitor-b.com/best-cash-flow-tools",
      "https://example-competitor-c.com/cfo-tools/forecasting"
    ],
    aiCitationsCited: ["example-competitor-a.com", "example-competitor-b.com"],
    cannibalizingPages: [],
    scoreBreakdown: {
      searchDemand: 17,
      trendingVelocity: 13,
      competitorGap: 16,
      aiCitationGap: 18,
      conversionFit: 10,
      cannibalizationClarity: 10
    },
    reason: "12.5K impressions, +40% WoW, page-2 ranking, competitors cited by Perplexity but you aren't.",
    url: null
  },
  {
    query: "what is runway in startups",
    source: "ai-citations",
    opportunityType: "community",
    kanbanColumn: "intake",
    intent: "informational",
    priority: "P0",
    trending: true,
    aiCitationGap: true,
    weeklyImpressions: 5840,
    previousWeekImpressions: 3290,
    position: 18,
    ctr: 0.009,
    competitorGapScore: 62,
    competitorUrls: [
      "https://example-competitor-d.com/glossary/runway",
      "https://example-competitor-e.com/blog/startup-runway"
    ],
    aiCitationsCited: ["example-competitor-d.com", "example-competitor-e.com"],
    cannibalizingPages: [],
    scoreBreakdown: {
      searchDemand: 14,
      trendingVelocity: 13,
      competitorGap: 12,
      aiCitationGap: 18,
      conversionFit: 6,
      cannibalizationClarity: 10
    },
    reason: "ChatGPT + Perplexity cite competitors when users ask this. You aren't in the answer.",
    url: null
  },
  {
    query: "stripe vs chargebee for SaaS",
    source: "ahrefs",
    opportunityType: "new",
    kanbanColumn: "intake",
    intent: "commercial",
    priority: "P0",
    trending: false,
    aiCitationGap: true,
    weeklyImpressions: 4210,
    previousWeekImpressions: 4090,
    position: 14,
    ctr: 0.015,
    competitorGapScore: 71,
    competitorUrls: [
      "https://example-competitor-f.com/stripe-vs-chargebee",
      "https://example-competitor-g.com/billing-comparison"
    ],
    aiCitationsCited: ["example-competitor-f.com"],
    cannibalizingPages: [],
    scoreBreakdown: {
      searchDemand: 12,
      trendingVelocity: 5,
      competitorGap: 15,
      aiCitationGap: 18,
      conversionFit: 10,
      cannibalizationClarity: 10
    },
    reason: "High commercial intent. KD 38 is achievable. Direct vs. comparison is one of the top citation patterns.",
    url: null
  },
  {
    query: "month-end close checklist",
    source: "gsc",
    opportunityType: "new",
    kanbanColumn: "intake",
    intent: "informational",
    priority: "P1",
    trending: false,
    aiCitationGap: false,
    weeklyImpressions: 2340,
    previousWeekImpressions: 2210,
    position: 11,
    ctr: 0.018,
    competitorGapScore: 45,
    competitorUrls: [
      "https://example-competitor-h.com/blog/month-end-close-checklist"
    ],
    aiCitationsCited: [],
    cannibalizingPages: [
      {
        url: "https://example.com/blog/closing-the-books-faster",
        title: "Closing the books faster — a step-by-step guide"
      }
    ],
    scoreBreakdown: {
      searchDemand: 11,
      trendingVelocity: 5,
      competitorGap: 9,
      aiCitationGap: 0,
      conversionFit: 6,
      cannibalizationClarity: 4
    },
    reason: "Existing article overlaps. Differentiate scope or update the existing page instead of writing new.",
    url: null
  },
  // ── New column — accepted, brief generated ──
  {
    query: "how to forecast SaaS revenue",
    source: "gsc",
    opportunityType: "new",
    kanbanColumn: "new",
    intent: "informational",
    priority: "P0",
    trending: true,
    aiCitationGap: true,
    weeklyImpressions: 8730,
    previousWeekImpressions: 5210,
    position: 9,
    ctr: 0.021,
    competitorGapScore: 68,
    competitorUrls: [
      "https://example-competitor-a.com/saas-revenue-forecasting",
      "https://example-competitor-c.com/cfo-tools/saas-forecasting-guide"
    ],
    aiCitationsCited: ["example-competitor-a.com"],
    cannibalizingPages: [],
    scoreBreakdown: {
      searchDemand: 16,
      trendingVelocity: 13,
      competitorGap: 14,
      aiCitationGap: 18,
      conversionFit: 6,
      cannibalizationClarity: 10
    },
    reason: "Strong demand, accelerating, AI citation gap. Brief ready.",
    url: null
  },
  {
    query: "burn multiple benchmark by stage",
    source: "ai-citations",
    opportunityType: "community",
    kanbanColumn: "new",
    intent: "informational",
    priority: "P1",
    trending: false,
    aiCitationGap: true,
    weeklyImpressions: 1840,
    previousWeekImpressions: 1620,
    position: 22,
    ctr: 0.004,
    competitorGapScore: 54,
    competitorUrls: [
      "https://example-competitor-b.com/benchmarks/burn-multiple"
    ],
    aiCitationsCited: ["example-competitor-b.com"],
    cannibalizingPages: [],
    scoreBreakdown: {
      searchDemand: 9,
      trendingVelocity: 5,
      competitorGap: 11,
      aiCitationGap: 18,
      conversionFit: 6,
      cannibalizationClarity: 10
    },
    reason: "AI engines cite competitor benchmarks. Original data + comparison table can win the citation.",
    url: null
  },
  // ── In-progress column — content being drafted ──
  {
    query: "saas billing automation guide",
    source: "semrush",
    opportunityType: "new",
    kanbanColumn: "in_progress",
    intent: "commercial",
    priority: "P0",
    trending: false,
    aiCitationGap: false,
    weeklyImpressions: 3120,
    previousWeekImpressions: 3010,
    position: 12,
    ctr: 0.019,
    competitorGapScore: 64,
    competitorUrls: [
      "https://example-competitor-c.com/guides/saas-billing-automation"
    ],
    aiCitationsCited: [],
    cannibalizingPages: [],
    scoreBreakdown: {
      searchDemand: 12,
      trendingVelocity: 5,
      competitorGap: 14,
      aiCitationGap: 0,
      conversionFit: 10,
      cannibalizationClarity: 10
    },
    reason: "Commercial intent, healthy gap score. Content drafting in progress.",
    url: null
  },
  {
    query: "ARR vs MRR calculation",
    source: "refresh",
    opportunityType: "refresh",
    kanbanColumn: "in_progress",
    intent: "informational",
    priority: "P1",
    trending: false,
    aiCitationGap: false,
    weeklyImpressions: 2210,
    previousWeekImpressions: 2890,
    position: 14,
    ctr: 0.011,
    competitorGapScore: 38,
    competitorUrls: [
      "https://example-competitor-a.com/arr-vs-mrr",
      "https://example-competitor-d.com/glossary/arr-mrr"
    ],
    aiCitationsCited: [],
    cannibalizingPages: [],
    scoreBreakdown: {
      searchDemand: 10,
      trendingVelocity: 1,
      competitorGap: 8,
      aiCitationGap: 0,
      conversionFit: 6,
      cannibalizationClarity: 10
    },
    reason: "Existing page slipping from page 1. Refresh with current 2026 benchmarks.",
    url: "https://example.com/blog/arr-vs-mrr-explained"
  },
  // ── Done column — published, archived ──
  {
    query: "founder mode finance metrics",
    source: "gsc",
    opportunityType: "new",
    kanbanColumn: "done",
    intent: "informational",
    priority: "P1",
    trending: false,
    aiCitationGap: false,
    weeklyImpressions: 1450,
    previousWeekImpressions: 1380,
    position: 6,
    ctr: 0.043,
    competitorGapScore: 30,
    competitorUrls: ["https://example-competitor-e.com/founder-finance"],
    aiCitationsCited: [],
    cannibalizingPages: [],
    scoreBreakdown: {
      searchDemand: 9,
      trendingVelocity: 5,
      competitorGap: 5,
      aiCitationGap: 0,
      conversionFit: 6,
      cannibalizationClarity: 10
    },
    reason: "Published. Steady traffic, healthy CTR.",
    url: "https://example.com/blog/founder-mode-finance-metrics"
  },
  {
    query: "free cash flow vs operating cash flow",
    source: "ai-citations",
    opportunityType: "community",
    kanbanColumn: "done",
    intent: "informational",
    priority: "P1",
    trending: false,
    aiCitationGap: false,
    weeklyImpressions: 980,
    previousWeekImpressions: 920,
    position: 4,
    ctr: 0.067,
    competitorGapScore: 22,
    competitorUrls: [],
    aiCitationsCited: [],
    cannibalizingPages: [],
    scoreBreakdown: {
      searchDemand: 8,
      trendingVelocity: 5,
      competitorGap: 4,
      aiCitationGap: 0,
      conversionFit: 6,
      cannibalizationClarity: 10
    },
    reason: "Closed loop — published and now cited by Perplexity for the original prompt.",
    url: "https://example.com/blog/free-cash-flow-vs-operating-cash-flow"
  }
];

// Compute total score from the breakdown for storage.
function totalFromBreakdown(b: ScoreBreakdown): number {
  return Math.round(
    b.searchDemand +
      b.trendingVelocity +
      b.competitorGap +
      b.aiCitationGap +
      b.conversionFit +
      b.cannibalizationClarity
  );
}

// Returns counts. If `force` is true, also wipes existing sample rows
// before reseeding (useful in dev). Default behavior is no-op if any
// row exists in the table.
export async function seedSampleOpportunities(
  opts: { force?: boolean } = {}
): Promise<{ inserted: number; skipped: boolean }> {
  if (!opts.force) {
    const existing = await db.select().from(discoveredOpportunities).limit(1);
    if (existing.length > 0) {
      return { inserted: 0, skipped: true };
    }
  }
  const rows = SAMPLES.map((s) => {
    const score = totalFromBreakdown(s.scoreBreakdown);
    return {
      id: uid("disc"),
      source: s.source,
      query: s.query,
      url: s.url,
      metrics: {
        impressions: s.weeklyImpressions,
        clicks: Math.round(s.weeklyImpressions * (s.ctr || 0)),
        ctr: s.ctr,
        position: s.position
      } as Record<string, number | null>,
      score,
      status: "new" as const,
      reason: s.reason,
      dedupKey: `sample::${s.query.toLowerCase()}`,
      intent: s.intent,
      aiCitationGap: s.aiCitationGap,
      scoreBreakdown: s.scoreBreakdown,
      opportunityType: s.opportunityType,
      priority: s.priority,
      trending: s.trending,
      kanbanColumn: s.kanbanColumn,
      weeklyImpressions: s.weeklyImpressions,
      previousWeekImpressions: s.previousWeekImpressions,
      competitorUrls: s.competitorUrls,
      competitorGapScore: s.competitorGapScore,
      aiCitationsCited: s.aiCitationsCited,
      cannibalizingPages: s.cannibalizingPages,
      isSample: true
    };
  });
  await db
    .insert(discoveredOpportunities)
    .values(rows)
    .onConflictDoNothing();
  return { inserted: rows.length, skipped: false };
}

// Removes every sample row. Used when the strategist clicks "Clear
// sample data" after connecting real sources.
export async function clearSampleOpportunities(): Promise<number> {
  const rows = await db
    .select()
    .from(discoveredOpportunities)
    .where(eq(discoveredOpportunities.isSample, true));
  if (rows.length === 0) return 0;
  await db
    .delete(discoveredOpportunities)
    .where(eq(discoveredOpportunities.isSample, true));
  return rows.length;
}
