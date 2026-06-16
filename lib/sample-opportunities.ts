// ── Sample data seeder ───────────────────────────────────────────────
//
// The board MUST be usable with zero API keys + zero data sources.
// On first load (or via an explicit reseed) we drop article-LEVEL
// opportunities into the DB — each one reads like a real content
// piece a strategist might commission, not a raw search keyword.
//
// Card headline = the article title (stored in `query`).
// Underlying SEO keyword lives in `metrics.targetKeyword` so the
// brief + content generators target the right phrase.

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
  title: string;
  targetKeyword: string;
  source: string; // ai-gaps | refresh | semrush | ahrefs | gsc | ai-citations
  opportunityType: OpportunityType;
  kanbanColumn: "intake" | "new" | "in_progress" | "done";
  intent: Intent;
  priority: Priority;
  trending: boolean;
  aiCitationGap: boolean;
  weeklyImpressions: number;
  previousWeekImpressions: number;
  competitorGapScore: number;
  competitorUrls: string[];
  aiCitationsCited: string[];
  cannibalizingPages: Array<{ url: string; title: string }>;
  scoreBreakdown: ScoreBreakdown;
  reason: string;
  url: string | null;
}

const SAMPLES: Sample[] = [
  // ── Intake column — fresh gaps, awaiting decision ──
  {
    title: "AI accountants vs. human bookkeepers: when to switch in 2026",
    targetKeyword: "ai accountant vs human",
    source: "ai-gaps",
    opportunityType: "new",
    kanbanColumn: "intake",
    intent: "commercial",
    priority: "P0",
    trending: true,
    aiCitationGap: true,
    weeklyImpressions: 12480,
    previousWeekImpressions: 8930,
    competitorGapScore: 78,
    competitorUrls: [
      "https://example-competitor-a.com/ai-vs-human-bookkeeper",
      "https://example-competitor-b.com/blog/ai-accountant-comparison"
    ],
    aiCitationsCited: [
      "example-competitor-a.com",
      "example-competitor-b.com"
    ],
    cannibalizingPages: [],
    scoreBreakdown: {
      searchDemand: 17,
      trendingVelocity: 13,
      competitorGap: 16,
      aiCitationGap: 18,
      conversionFit: 10,
      cannibalizationClarity: 10
    },
    reason:
      "Competitors own the comparison query and AI engines cite them for it. You have product authority but no equivalent piece live.",
    url: null
  },
  {
    title: "The CFO's playbook: choosing cash flow forecasting software",
    targetKeyword: "cash flow forecasting software",
    source: "ai-gaps",
    opportunityType: "new",
    kanbanColumn: "intake",
    intent: "commercial",
    priority: "P0",
    trending: false,
    aiCitationGap: true,
    weeklyImpressions: 8420,
    previousWeekImpressions: 8190,
    competitorGapScore: 71,
    competitorUrls: [
      "https://example-competitor-c.com/cash-flow-software-guide",
      "https://example-competitor-d.com/best-forecasting-tools"
    ],
    aiCitationsCited: ["example-competitor-c.com"],
    cannibalizingPages: [],
    scoreBreakdown: {
      searchDemand: 15,
      trendingVelocity: 5,
      competitorGap: 14,
      aiCitationGap: 18,
      conversionFit: 10,
      cannibalizationClarity: 10
    },
    reason:
      "High commercial intent. Comparison piece is missing from your library and AI engines surface competitor guides.",
    url: null
  },
  {
    title: "How AI engines answer founders' top finance questions in 2026",
    targetKeyword: "ai answers for finance",
    source: "ai-citations",
    opportunityType: "community",
    kanbanColumn: "intake",
    intent: "informational",
    priority: "P0",
    trending: true,
    aiCitationGap: true,
    weeklyImpressions: 5840,
    previousWeekImpressions: 3290,
    competitorGapScore: 62,
    competitorUrls: [
      "https://example-competitor-d.com/glossary/runway",
      "https://example-competitor-e.com/blog/startup-runway"
    ],
    aiCitationsCited: [
      "example-competitor-d.com",
      "example-competitor-e.com"
    ],
    cannibalizingPages: [],
    scoreBreakdown: {
      searchDemand: 14,
      trendingVelocity: 13,
      competitorGap: 12,
      aiCitationGap: 18,
      conversionFit: 6,
      cannibalizationClarity: 10
    },
    reason:
      "AI Citations Tracker shows competitors cited by Perplexity + ChatGPT for these prompts; your domain is absent from the answer set.",
    url: null
  },
  {
    title: "Stripe vs. Chargebee for SaaS billing — a 2026 head-to-head",
    targetKeyword: "stripe vs chargebee saas",
    source: "ai-gaps",
    opportunityType: "new",
    kanbanColumn: "intake",
    intent: "commercial",
    priority: "P0",
    trending: false,
    aiCitationGap: true,
    weeklyImpressions: 4210,
    previousWeekImpressions: 4090,
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
    reason:
      "High-intent comparison query with structural advantage — head-to-heads are the citation pattern AI engines extract first.",
    url: null
  },
  {
    title: "Month-end close: the 12-step checklist that ships before noon",
    targetKeyword: "month-end close checklist",
    source: "refresh",
    opportunityType: "refresh",
    kanbanColumn: "intake",
    intent: "informational",
    priority: "P1",
    trending: false,
    aiCitationGap: false,
    weeklyImpressions: 2340,
    previousWeekImpressions: 2210,
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
    reason:
      "Existing piece is slipping. Refresh with 2026 timing, real CFO benchmarks, and a downloadable checklist asset.",
    url: null
  },

  // ── New column — accepted, brief generated ──
  {
    title: "How to forecast SaaS revenue (with a worked 18-month example)",
    targetKeyword: "saas revenue forecasting",
    source: "ai-gaps",
    opportunityType: "new",
    kanbanColumn: "new",
    intent: "informational",
    priority: "P0",
    trending: true,
    aiCitationGap: true,
    weeklyImpressions: 8730,
    previousWeekImpressions: 5210,
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
    reason:
      "Strong demand, accelerating searches, AI citation gap. Ready for content production.",
    url: null
  },
  {
    title: "Burn multiple benchmarks by stage: 2026 founder data set",
    targetKeyword: "burn multiple benchmark",
    source: "ai-citations",
    opportunityType: "community",
    kanbanColumn: "new",
    intent: "informational",
    priority: "P1",
    trending: false,
    aiCitationGap: true,
    weeklyImpressions: 1840,
    previousWeekImpressions: 1620,
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
    reason:
      "AI engines cite competitor benchmark data. Original numbers + a comparison table can win the citation.",
    url: null
  },

  // ── In-progress column — content being drafted ──
  {
    title: "The 2026 SaaS billing automation playbook",
    targetKeyword: "saas billing automation",
    source: "ai-gaps",
    opportunityType: "new",
    kanbanColumn: "in_progress",
    intent: "commercial",
    priority: "P0",
    trending: false,
    aiCitationGap: false,
    weeklyImpressions: 3120,
    previousWeekImpressions: 3010,
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
    reason:
      "Commercial intent, healthy gap score. Drafting in progress.",
    url: null
  },
  {
    title: "ARR vs. MRR: the calculation finance teams actually use",
    targetKeyword: "arr vs mrr calculation",
    source: "refresh",
    opportunityType: "refresh",
    kanbanColumn: "in_progress",
    intent: "informational",
    priority: "P1",
    trending: false,
    aiCitationGap: false,
    weeklyImpressions: 2210,
    previousWeekImpressions: 2890,
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
    reason:
      "Existing page slipping from page 1. Refresh with current benchmarks + a calculator embed.",
    url: "https://example.com/blog/arr-vs-mrr-explained"
  },

  // ── Done column — published, archived ──
  {
    title: "Founder-mode finance metrics: the 7 numbers that matter",
    targetKeyword: "founder finance metrics",
    source: "ai-gaps",
    opportunityType: "new",
    kanbanColumn: "done",
    intent: "informational",
    priority: "P1",
    trending: false,
    aiCitationGap: false,
    weeklyImpressions: 1450,
    previousWeekImpressions: 1380,
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
    reason:
      "Published — steady traffic, healthy CTR, ranking #6 in our segment.",
    url: "https://example.com/blog/founder-mode-finance-metrics"
  },
  {
    title:
      "Free cash flow vs. operating cash flow — the 5-minute explainer",
    targetKeyword: "free cash flow vs operating cash flow",
    source: "ai-citations",
    opportunityType: "community",
    kanbanColumn: "done",
    intent: "informational",
    priority: "P1",
    trending: false,
    aiCitationGap: false,
    weeklyImpressions: 980,
    previousWeekImpressions: 920,
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
    reason:
      "Closed loop — published and now cited by Perplexity for the original tracked prompt.",
    url: "https://example.com/blog/free-cash-flow-vs-operating-cash-flow"
  }
];

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
      // Article title in `query` — this is what the card shows as a headline.
      query: s.title,
      url: s.url,
      // SEO keyword lives in metrics — brief + content gens read it from here.
      metrics: {
        targetKeyword: s.targetKeyword,
        impressions: s.weeklyImpressions,
        position: 12
      } as Record<string, number | string>,
      score,
      status: "new" as const,
      reason: s.reason,
      dedupKey: `sample::${s.title.toLowerCase()}`,
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
