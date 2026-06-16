// ── Opportunity classifiers ──────────────────────────────────────────
//
// Pure functions that look at a raw discovered query + metrics and tag
// it with an intent, an AI citation gap signal, and a 4-pillar score
// breakdown. Everything in here is deterministic — no LLM calls —
// because these run on every sync and the strategist needs them stable.

export type Intent =
  | "commercial"
  | "informational"
  | "transactional"
  | "navigational";

export interface ScoreBreakdown {
  // 0-30 — how much demand + headroom GSC shows
  gscVelocity: number;
  // 0-30 — does a competitor rank for this & how hard is it
  competitorGap: number;
  // 0-25 — citation-worthy query that AI engines might be answering
  aiCitationGap: number;
  // 0-15 — converts well historically OR matches a high-intent kw bank entry
  conversions: number;
}

// ── Intent detection ────────────────────────────────────────────────
// Keyword-pattern classifier. Order matters: we check the strongest
// signals first (transactional → commercial → navigational → informational
// default). We don't try to be clever about ambiguity — strategists
// override on the brief if we're wrong.

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
  // Navigational: query contains one of our brand or competitor names.
  if (opts.brandNames?.length) {
    for (const b of opts.brandNames) {
      if (b && q.includes(` ${b.toLowerCase()} `)) return "navigational";
    }
  }
  for (const k of TRANSACTIONAL) {
    if (q.includes(k)) return "transactional";
  }
  for (const k of COMMERCIAL) {
    if (q.includes(k)) return "commercial";
  }
  for (const k of INFORMATIONAL_LEAD) {
    if (q.includes(k)) return "informational";
  }
  // No strong signal → assume informational (default content type).
  return "informational";
}

// ── AI citation gap heuristic ────────────────────────────────────────
// Returns true when this query has the shape that AI engines like
// Perplexity, ChatGPT, and Google AI Overviews tend to answer
// directly — AND we're not strongly ranking, AND the query is the kind
// of question users ask in chat. The combination = competitors are
// likely getting cited, we're not.
//
// Real Perplexity citation tracking is an upgrade path (separate API).
// This heuristic catches the obvious wins in v1 with zero cost.

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
  // Transactional queries are bottom-of-funnel — users go straight to a
  // product page, AI citation matters less. Skip.
  if (input.intent === "transactional") return false;
  // Navigational queries are people looking for a specific brand. Skip.
  if (input.intent === "navigational") return false;

  const isQuestionShaped = QUESTION_PREFIXES.some((p) => q.startsWith(p));
  const looksCitationWorthy = CITATION_KEYWORDS.some((k) =>
    ` ${q} `.includes(k)
  );
  if (!isQuestionShaped && !looksCitationWorthy) return false;

  // If we're already ranking top-3, AI engines probably ARE citing us.
  // Below top-3 = realistic gap.
  if (typeof input.position === "number" && input.position <= 3) return false;

  return true;
}

// ── 4-pillar score breakdown ────────────────────────────────────────
// Each pillar caps at a fixed ceiling so total <= 100. Lets the UI
// render "85 / 100 = GSC 28 + Comp 22 + AI 20 + Conv 15".
//
// GSC velocity (0-30): for GSC rows, blends impressions + position
//   headroom. For non-GSC, defaults to a flat 8 (we don't know yet).
// Competitor gap (0-30): rewards competitor-flagged queries; the more
//   competitors flag the same query, the higher this gets.
// AI citation gap (0-25): flat 22 if the heuristic flags it, else 0.
// Conversions (0-15): for now, flat 8 if intent is commercial /
//   transactional (those are likely to convert) + bonus if the
//   conversionsBonus param is set. Future: pull GA4 data here.

export interface ScoreInputs {
  source: "gsc" | "semrush" | "ahrefs" | "refresh";
  intent: Intent;
  aiCitationGap: boolean;
  // GSC-specific
  impressions?: number;
  position?: number;
  ctr?: number;
  // Competitor-specific
  volume?: number;
  difficulty?: number;
  competitorCount?: number; // how many competitor domains flag this query
  // Future GA4 hook
  conversionsBonus?: number;
}

export function computeScoreBreakdown(input: ScoreInputs): ScoreBreakdown {
  let gscVelocity = 0;
  let competitorGap = 0;
  let aiCitationGap = 0;
  let conversions = 0;

  // ── GSC velocity ──
  if (input.source === "gsc" || input.source === "refresh") {
    const impressions = input.impressions ?? 0;
    const position = input.position ?? 50;
    // Up to 18 from impressions (log scale, 10k = full marks)
    const impScore = Math.min(
      18,
      (Math.log10(Math.max(1, impressions)) / Math.log10(10000)) * 18
    );
    // Up to 12 from position headroom (positions 4-20 = the sweet spot)
    let posScore = 0;
    if (position >= 4 && position <= 20) {
      posScore = 12 * (1 - (position - 4) / 16);
    } else if (position > 20 && position <= 40) {
      posScore = 5;
    }
    gscVelocity = Math.round(impScore + posScore);
  } else {
    // Non-GSC source: flat baseline, real number lands when GSC syncs
    gscVelocity = 8;
  }

  // ── Competitor gap ──
  if (input.source === "semrush" || input.source === "ahrefs") {
    const volume = input.volume ?? 0;
    const position = input.position ?? 50;
    const difficulty = input.difficulty;
    // Up to 18 from volume (log scale)
    const volScore = Math.min(
      18,
      (Math.log10(Math.max(1, volume)) / Math.log10(10000)) * 18
    );
    // Up to 8 from achievability — competitor at 4-15 = realistic chase
    let achievScore = 0;
    if (position >= 4 && position <= 15) {
      achievScore = 8 * (1 - (position - 4) / 11);
    } else if (position <= 3) {
      achievScore = 3;
    }
    // Up to 4 from low difficulty
    let diffScore = 2;
    if (typeof difficulty === "number") {
      diffScore = Math.max(0, 4 - difficulty / 25);
    }
    competitorGap = Math.round(volScore + achievScore + diffScore);
  }
  // Multi-source bonus — if multiple competitors flag this, that's a
  // crowd-sourced signal of value. +3 per extra competitor, cap +9.
  if (input.competitorCount && input.competitorCount > 1) {
    competitorGap = Math.min(
      30,
      competitorGap + Math.min(9, (input.competitorCount - 1) * 3)
    );
  }
  competitorGap = Math.min(30, competitorGap);

  // ── AI citation gap ──
  aiCitationGap = input.aiCitationGap ? 22 : 0;

  // ── Conversions / business value ──
  // Higher for commercial/transactional intent — those convert harder.
  if (input.intent === "commercial") conversions = 9;
  else if (input.intent === "transactional") conversions = 13;
  else if (input.intent === "navigational") conversions = 4;
  else conversions = 5;
  if (input.conversionsBonus) {
    conversions = Math.min(15, conversions + input.conversionsBonus);
  }

  return {
    gscVelocity: Math.max(0, Math.min(30, gscVelocity)),
    competitorGap: Math.max(0, Math.min(30, competitorGap)),
    aiCitationGap: Math.max(0, Math.min(25, aiCitationGap)),
    conversions: Math.max(0, Math.min(15, conversions))
  };
}

export function totalScore(b: ScoreBreakdown): number {
  return Math.round(
    b.gscVelocity + b.competitorGap + b.aiCitationGap + b.conversions
  );
}

// Convenience — does the full classification pass in one call.
export function classifyOpportunity(input: {
  source: "gsc" | "semrush" | "ahrefs" | "refresh";
  query: string;
  brandNames?: string[];
  impressions?: number;
  position?: number;
  ctr?: number;
  volume?: number;
  difficulty?: number;
  competitorCount?: number;
}): {
  intent: Intent;
  aiCitationGap: boolean;
  scoreBreakdown: ScoreBreakdown;
  totalScore: number;
} {
  const intent = detectIntent(input.query, {
    brandNames: input.brandNames
  });
  const aiCitationGap = detectAiCitationGap({
    query: input.query,
    intent,
    position: input.position
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
    competitorCount: input.competitorCount
  });
  return {
    intent,
    aiCitationGap,
    scoreBreakdown: breakdown,
    totalScore: totalScore(breakdown)
  };
}
