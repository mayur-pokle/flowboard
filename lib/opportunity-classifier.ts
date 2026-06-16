// ── Opportunity classifiers ──────────────────────────────────────────
//
// Pure functions that look at a raw discovered query + metrics and tag
// it with an intent, a 6-pillar score breakdown, an opportunity TYPE
// (drives which LLM is used for content gen), and a priority (P0/P1/P2).
// Everything in here is deterministic — no LLM calls — because these
// run on every sync and the strategist needs them stable.

export type Intent =
  | "commercial"
  | "informational"
  | "transactional"
  | "navigational";

// Three pipeline categories the Discovery kanban groups cards by. Drives
// which provider + instructions are used at content-gen time.
export type OpportunityType = "new" | "refresh" | "community";

// CRM-style priority — derived from total score on save.
export type Priority = "P0" | "P1" | "P2";

// 6-pillar breakdown. Sums to ≤100. Each ceiling stays fixed so the UI
// can render the same scale on every card.
//
//   searchDemand            (0-20) impressions / volume signal
//   trendingVelocity        (0-15) week-over-week growth
//   competitorGap           (0-20) how much room there is to beat them
//   aiCitationGap           (0-20) competitors cited by AI, we're not
//   conversionFit           (0-15) intent → likelihood to convert
//   cannibalizationClarity  (0-10) inverse cannibalization risk
export interface ScoreBreakdown {
  searchDemand: number;
  trendingVelocity: number;
  competitorGap: number;
  aiCitationGap: number;
  conversionFit: number;
  cannibalizationClarity: number;
}

// ── Intent detection ────────────────────────────────────────────────
// Keyword-pattern classifier. Strongest signals first.

const TRANSACTIONAL = [
  "buy", "purchase", "order", "free trial", "trial", "demo", "signup",
  "sign up", "sign-up", "subscribe", "download", "get started", "pricing",
  "price", "cost", "discount", "coupon", "deal", "checkout"
];
const COMMERCIAL = [
  "best", " vs ", " vs. ", "alternative", "alternatives", "review",
  "reviews", "compare", "comparison", "top ", "cheapest", "cheap",
  "tools", "software", "platform", "service", "vendor", "company"
];
const INFORMATIONAL_LEAD = [
  "what is", "what are", "how to", "how do", "how does", "why ", "when ",
  "where ", "who ", "guide", "tutorial", "explained", "definition",
  "examples", "tips"
];

export function detectIntent(
  query: string,
  opts: { brandNames?: string[] } = {}
): Intent {
  const q = ` ${query.toLowerCase().trim()} `;
  if (opts.brandNames?.length) {
    for (const b of opts.brandNames) {
      if (b && q.includes(` ${b.toLowerCase()} `)) return "navigational";
    }
  }
  for (const k of TRANSACTIONAL) if (q.includes(k)) return "transactional";
  for (const k of COMMERCIAL) if (q.includes(k)) return "commercial";
  for (const k of INFORMATIONAL_LEAD) if (q.includes(k)) return "informational";
  return "informational";
}

// Plain-English description of what an intent means for content
// approach. Used in the brief's intent section.
export function intentExplanation(intent: Intent): string {
  switch (intent) {
    case "commercial":
      return "Commercial — the reader is actively comparing options before a purchase decision, so content should facilitate that comparison rather than educate from scratch.";
    case "transactional":
      return "Transactional — the reader has decided to act and is looking for the path to a tool, sign-up, or purchase. Content should be short, clear, and conversion-focused.";
    case "navigational":
      return "Navigational — the reader is looking for a specific brand, product, or page. Content should serve as a direct destination with clear positioning.";
    case "informational":
    default:
      return "Informational — the reader is trying to understand something. Lead with a direct answer in the first two paragraphs, then expand with examples and structure.";
  }
}

// ── Opportunity type detection ───────────────────────────────────────
// Source-driven by default. Strategist can override on the card.
export function detectOpportunityType(input: {
  source: string;
  aiCitationGap?: boolean;
}): OpportunityType {
  if (input.source === "refresh") return "refresh";
  if (input.source === "ai-citations") return "community";
  if (input.source === "sitemap" || input.source === "competitor-sitemap")
    return "community";
  // AI citation gap on a GSC/competitor row also leans community — it's
  // a conversational/answer-engine signal more than a search-share one.
  if (input.aiCitationGap) return "community";
  return "new";
}

// ── AI citation gap heuristic ────────────────────────────────────────
const QUESTION_PREFIXES = [
  "what ", "what's", "whats ", "how ", "why ", "when ", "where ",
  "who ", "which ", "is ", "are ", "can ", "should ", "do ",
  "does ", "vs ", "versus "
];
const CITATION_KEYWORDS = [
  "best", "top ", "compare", "comparison", "alternative", "alternatives",
  " vs ", "guide", "explained", "definition", "meaning", "difference",
  "pros and cons"
];

export function detectAiCitationGap(input: {
  query: string;
  intent: Intent;
  position?: number;
}): boolean {
  const q = input.query.toLowerCase().trim();
  if (input.intent === "transactional") return false;
  if (input.intent === "navigational") return false;
  const isQuestionShaped = QUESTION_PREFIXES.some((p) => q.startsWith(p));
  const looksCitationWorthy = CITATION_KEYWORDS.some((k) =>
    ` ${q} `.includes(k)
  );
  if (!isQuestionShaped && !looksCitationWorthy) return false;
  if (typeof input.position === "number" && input.position <= 3) return false;
  return true;
}

// ── 6-pillar score breakdown ────────────────────────────────────────
export interface ScoreInputs {
  source: string;
  intent: Intent;
  aiCitationGap: boolean;
  // Demand inputs
  impressions?: number;
  position?: number;
  ctr?: number;
  volume?: number;
  difficulty?: number;
  // Trending inputs (impression growth vs previous week)
  weeklyImpressions?: number;
  previousWeekImpressions?: number;
  // Competitor count contributes to the gap pillar
  competitorCount?: number;
  competitorGapScore?: number; // 0-100 if provided by SEMrush/Ahrefs
  // Cannibalization — number of cannibalizing pages already published.
  // 0 = clean slot, >0 = risk.
  cannibalizingPageCount?: number;
}

export function computeScoreBreakdown(input: ScoreInputs): ScoreBreakdown {
  // 1. Search demand (0-20) — log-scale impressions OR volume
  let searchDemand = 0;
  const demand =
    typeof input.impressions === "number"
      ? input.impressions
      : typeof input.volume === "number"
      ? input.volume
      : 0;
  if (demand > 0) {
    searchDemand = Math.round(
      Math.min(20, (Math.log10(Math.max(1, demand)) / Math.log10(10000)) * 20)
    );
  }

  // 2. Trending velocity (0-15) — needs both weeks of data. Otherwise 5.
  let trendingVelocity = 5;
  if (
    typeof input.weeklyImpressions === "number" &&
    typeof input.previousWeekImpressions === "number" &&
    input.previousWeekImpressions > 0
  ) {
    const growth =
      (input.weeklyImpressions - input.previousWeekImpressions) /
      input.previousWeekImpressions;
    if (growth > 1) trendingVelocity = 15; // >100% growth
    else if (growth > 0.5) trendingVelocity = 13;
    else if (growth > 0.2) trendingVelocity = 11;
    else if (growth > 0) trendingVelocity = 8;
    else if (growth > -0.2) trendingVelocity = 4;
    else trendingVelocity = 1;
  }

  // 3. Competitor gap (0-20)
  let competitorGap = 0;
  if (typeof input.competitorGapScore === "number") {
    competitorGap = Math.round((input.competitorGapScore / 100) * 20);
  } else if (typeof input.position === "number") {
    if (input.position >= 4 && input.position <= 20) {
      competitorGap = Math.round(20 * (1 - (input.position - 4) / 16));
    } else if (input.position <= 3) {
      competitorGap = 6;
    } else {
      competitorGap = 3;
    }
  }
  if (input.competitorCount && input.competitorCount > 1) {
    competitorGap = Math.min(
      20,
      competitorGap + Math.min(6, (input.competitorCount - 1) * 2)
    );
  }
  competitorGap = Math.max(0, Math.min(20, competitorGap));

  // 4. AI citation gap (0-20)
  const aiCitationGap = input.aiCitationGap ? 18 : 0;

  // 5. Conversion fit (0-15)
  let conversionFit = 5;
  if (input.intent === "commercial") conversionFit = 10;
  else if (input.intent === "transactional") conversionFit = 13;
  else if (input.intent === "navigational") conversionFit = 4;
  else conversionFit = 6;

  // 6. Cannibalization clarity (0-10) — higher = clearer slot
  let cannibalizationClarity = 10;
  if (input.cannibalizingPageCount && input.cannibalizingPageCount > 0) {
    cannibalizationClarity = Math.max(
      0,
      10 - input.cannibalizingPageCount * 3
    );
  }

  return {
    searchDemand,
    trendingVelocity,
    competitorGap,
    aiCitationGap,
    conversionFit,
    cannibalizationClarity
  };
}

export function totalScore(b: ScoreBreakdown): number {
  return Math.round(
    b.searchDemand +
      b.trendingVelocity +
      b.competitorGap +
      b.aiCitationGap +
      b.conversionFit +
      b.cannibalizationClarity
  );
}

// ── Priority derivation ──────────────────────────────────────────────
// P0 = top quartile, P1 = middle band, P2 = lower band. Different
// thresholds at score boundaries so the priority tag is meaningful.
export function derivePriority(score: number): Priority {
  if (score >= 75) return "P0";
  if (score >= 50) return "P1";
  return "P2";
}

// ── Trending detection ───────────────────────────────────────────────
// Flagged when week-over-week impressions grew >20%.
export function isTrending(input: {
  weeklyImpressions?: number;
  previousWeekImpressions?: number;
}): boolean {
  if (
    typeof input.weeklyImpressions !== "number" ||
    typeof input.previousWeekImpressions !== "number" ||
    input.previousWeekImpressions === 0
  ) {
    return false;
  }
  const growth =
    (input.weeklyImpressions - input.previousWeekImpressions) /
    input.previousWeekImpressions;
  return growth > 0.2;
}

// Convenience — does the full classification pass in one call.
export function classifyOpportunity(input: {
  source: string;
  query: string;
  brandNames?: string[];
  impressions?: number;
  position?: number;
  ctr?: number;
  volume?: number;
  difficulty?: number;
  competitorCount?: number;
  competitorGapScore?: number;
  weeklyImpressions?: number;
  previousWeekImpressions?: number;
  cannibalizingPageCount?: number;
}): {
  intent: Intent;
  aiCitationGap: boolean;
  trending: boolean;
  opportunityType: OpportunityType;
  priority: Priority;
  scoreBreakdown: ScoreBreakdown;
  totalScore: number;
} {
  const intent = detectIntent(input.query, { brandNames: input.brandNames });
  const aiCitationGap = detectAiCitationGap({
    query: input.query,
    intent,
    position: input.position
  });
  const trending = isTrending({
    weeklyImpressions: input.weeklyImpressions,
    previousWeekImpressions: input.previousWeekImpressions
  });
  const opportunityType = detectOpportunityType({
    source: input.source,
    aiCitationGap
  });
  const breakdown = computeScoreBreakdown({
    source: input.source,
    intent,
    aiCitationGap,
    impressions: input.impressions,
    position: input.position,
    ctr: input.ctr,
    volume: input.volume,
    difficulty: input.difficulty,
    competitorCount: input.competitorCount,
    competitorGapScore: input.competitorGapScore,
    weeklyImpressions: input.weeklyImpressions,
    previousWeekImpressions: input.previousWeekImpressions,
    cannibalizingPageCount: input.cannibalizingPageCount
  });
  const score = totalScore(breakdown);
  const priority = derivePriority(score);
  return {
    intent,
    aiCitationGap,
    trending,
    opportunityType,
    priority,
    scoreBreakdown: breakdown,
    totalScore: score
  };
}
