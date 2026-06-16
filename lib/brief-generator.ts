// ── Deterministic brief generator ────────────────────────────────────
//
// Pure data-assembly function. Speed + predictability matter more than
// richness — the brief is a framework, not a finished document. Output
// is BOTH a structured BriefData shape (stored on the opportunity for
// programmatic access by content generation) AND a rendered markdown
// preview for the writer to read on the brief page.

import type {
  Intent,
  ScoreBreakdown,
  Priority,
  OpportunityType
} from "@/lib/opportunity-classifier";
import { intentExplanation } from "@/lib/opportunity-classifier";

export interface BriefData {
  // ── Intent ──
  intent: Intent;
  intentExplanation: string;
  // ── Format & scope ──
  recommendedFormat: string; // "comparison guide" | "how-to" | "landing page" | "FAQ" | "listicle"
  wordCountMin: number;
  wordCountMax: number;
  // ── Structure ──
  h2Structure: string[]; // 5-7 substantive H2s
  // ── Competitor gap analysis ──
  topCompetitors: Array<{ domain: string; coverage: string }>;
  competitorGaps: string[]; // angles the new piece should own
  // ── AI citation angle (conditional) ──
  aiCitationAngle?: {
    competitorsCited: string[]; // domains
    structuralAdvice: string[]; // bullets
  };
  // ── Cannibalization warning (conditional) ──
  cannibalization?: {
    overlappingPages: Array<{ url: string; title: string }>;
    resolution: "differentiate" | "consolidate" | "canonical" | "redirect";
    resolutionReason: string;
  };
  // ── CTA ──
  ctaRecommendation: string;
  // ── Bookkeeping ──
  generatedAt: string;
  opportunityType: OpportunityType;
  priority: Priority;
  scoreBreakdown: ScoreBreakdown;
  totalScore: number;
}

// ── Format + word-count derivation ──
function formatFor(intent: Intent, competitorGapScore: number): {
  format: string;
  wordCountMin: number;
  wordCountMax: number;
} {
  if (intent === "transactional") {
    return { format: "landing page", wordCountMin: 600, wordCountMax: 1000 };
  }
  if (intent === "commercial") {
    // High gap → full comparison guide. Lower gap → focused buyer's brief.
    if (competitorGapScore >= 60) {
      return {
        format: "comparison guide",
        wordCountMin: 1800,
        wordCountMax: 2400
      };
    }
    return {
      format: "buyer's guide",
      wordCountMin: 1400,
      wordCountMax: 1800
    };
  }
  if (intent === "navigational") {
    return { format: "brand page", wordCountMin: 800, wordCountMax: 1400 };
  }
  // Informational: question shape → FAQ-leaning, otherwise how-to.
  return {
    format: "how-to guide",
    wordCountMin: 1500,
    wordCountMax: 2000
  };
}

// ── H2 structure ──
// Substantive headings derived from intent + query + competitor URL slugs.
function h2StructureFor(input: {
  query: string;
  intent: Intent;
  competitorSlugs: string[];
}): string[] {
  const q = input.query;
  const slugWords = new Set(
    input.competitorSlugs
      .flatMap((s) =>
        s
          .toLowerCase()
          .replace(/^https?:\/\/[^/]+\//, "")
          .replace(/\.[a-z]+$/, "")
          .split(/[/\-_]+/)
      )
      .filter((w) => w.length > 3)
  );

  const cap = (s: string) =>
    s.charAt(0).toUpperCase() + s.slice(1);

  if (input.intent === "commercial") {
    const out = [
      `${cap(q)} at a glance`,
      `How we evaluated`,
      `Top options compared`,
      `When to choose each`,
      `Pricing and onboarding`,
      `Our recommendation`,
      `Frequently asked questions`
    ];
    return out.slice(0, 7);
  }
  if (input.intent === "transactional") {
    return [
      `What ${q} does in 60 seconds`,
      `Who it's for`,
      `How to get started`,
      `Pricing and plans`,
      `Frequently asked questions`
    ];
  }
  if (input.intent === "navigational") {
    return [
      `${cap(q)} — the short answer`,
      `Who uses it`,
      `How it compares`,
      `Customer outcomes`,
      `Where to go next`
    ];
  }
  // Informational
  const base = [
    `${cap(q)} — the short answer`,
    `Why this matters now`,
    `Step-by-step explanation`,
    `Worked example`,
    `Common mistakes to avoid`,
    `Frequently asked questions`
  ];
  // If competitor slugs hint at "benchmarks", "metrics", "framework" — splice in.
  if (slugWords.has("benchmark") || slugWords.has("benchmarks")) {
    base.splice(3, 0, "Benchmark data by stage");
  }
  if (slugWords.has("template") || slugWords.has("templates")) {
    base.splice(3, 0, "Templates you can copy");
  }
  return base.slice(0, 7);
}

// ── Competitor gap analysis ──
// We don't have crawled content for competitor URLs — we infer
// coverage + gaps from the URL slug pattern. This gives the writer a
// directional read without requiring a crawl layer.
function summarizeCompetitor(url: string): string {
  const slug = url
    .replace(/^https?:\/\/[^/]+\//, "")
    .replace(/\.[a-z]+$/, "")
    .replace(/[/_-]+/g, " ")
    .trim();
  if (!slug) return "Generic landing page";
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

function gapAnglesFor(input: {
  intent: Intent;
  hasComparisonSlug: boolean;
  aiCitationGap: boolean;
}): string[] {
  const gaps: string[] = [];
  if (input.intent === "commercial") {
    gaps.push(
      "A side-by-side comparison table with specific numbers (most competitors use vague claims)."
    );
    gaps.push(
      "A decision tree by use case — competitors lead with feature lists rather than situational fit."
    );
  }
  if (input.intent === "informational") {
    gaps.push(
      "A direct, quotable answer in the opening paragraph — competitors meander before answering."
    );
    gaps.push(
      "A worked numerical example — most competitors stop at definitions."
    );
  }
  if (input.aiCitationGap) {
    gaps.push(
      "Structured headings that map to common follow-up questions so AI engines can extract sub-answers."
    );
  }
  if (!input.hasComparisonSlug && input.intent !== "informational") {
    gaps.push(
      "A comparison angle — none of the top results have a head-to-head breakdown."
    );
  }
  return gaps;
}

// ── AI citation structural advice ──
function aiCitationStructuralAdvice(): string[] {
  return [
    "Lead with a direct, factual answer to the implied question in the first 2 paragraphs.",
    "Include a structured comparison table — AI engines extract these into citations.",
    "Cite specific quantified claims (numbers, dates, percentages) over generic phrasing.",
    "Use heading hierarchy that maps to common follow-up questions — H2 = question, H3 = sub-question.",
    "Add a clear summary or TL;DR block at the top — this is the chunk AI engines pull first."
  ];
}

// ── CTA recommendation ──
function ctaFor(intent: Intent, defaultCta?: string): string {
  if (intent === "commercial") {
    return defaultCta || "Book a demo to see how it compares.";
  }
  if (intent === "transactional") {
    return defaultCta || "Start your free trial — no credit card required.";
  }
  if (intent === "navigational") {
    return defaultCta || "See the product overview.";
  }
  return defaultCta || "Get the playbook by email.";
}

// ── Public assembly entrypoint ──
export interface BriefInput {
  query: string;
  intent: Intent;
  opportunityType: OpportunityType;
  priority: Priority;
  scoreBreakdown: ScoreBreakdown;
  totalScore: number;
  aiCitationGap: boolean;
  competitorUrls: string[];
  competitorGapScore: number;
  aiCitationsCited: string[];
  cannibalizingPages: Array<{ url: string; title: string }>;
  brandPrimaryCta?: string;
}

export function buildBriefData(input: BriefInput): BriefData {
  const fmt = formatFor(input.intent, input.competitorGapScore);
  const h2s = h2StructureFor({
    query: input.query,
    intent: input.intent,
    competitorSlugs: input.competitorUrls
  });
  const hasComparisonSlug = input.competitorUrls.some((u) =>
    /vs|compare|comparison|alternative/i.test(u)
  );
  const gaps = gapAnglesFor({
    intent: input.intent,
    hasComparisonSlug,
    aiCitationGap: input.aiCitationGap
  });
  const topCompetitors = input.competitorUrls.slice(0, 3).map((url) => ({
    domain: url.replace(/^https?:\/\//, "").split("/")[0],
    coverage: summarizeCompetitor(url)
  }));

  const data: BriefData = {
    intent: input.intent,
    intentExplanation: intentExplanation(input.intent),
    recommendedFormat: fmt.format,
    wordCountMin: fmt.wordCountMin,
    wordCountMax: fmt.wordCountMax,
    h2Structure: h2s,
    topCompetitors,
    competitorGaps: gaps,
    ctaRecommendation: ctaFor(input.intent, input.brandPrimaryCta),
    generatedAt: new Date().toISOString(),
    opportunityType: input.opportunityType,
    priority: input.priority,
    scoreBreakdown: input.scoreBreakdown,
    totalScore: input.totalScore
  };

  if (input.aiCitationGap) {
    data.aiCitationAngle = {
      competitorsCited: input.aiCitationsCited,
      structuralAdvice: aiCitationStructuralAdvice()
    };
  }
  if (input.cannibalizingPages.length > 0) {
    // Heuristic resolution: 1 overlap → differentiate, 2+ → consolidate.
    const count = input.cannibalizingPages.length;
    data.cannibalization = {
      overlappingPages: input.cannibalizingPages,
      resolution: count === 1 ? "differentiate" : "consolidate",
      resolutionReason:
        count === 1
          ? "One existing page targets overlapping intent. Differentiate scope clearly (target a different sub-angle) before publishing."
          : "Multiple existing pages compete for this intent. Consolidate them and update the strongest, redirect the weaker ones."
    };
  }

  return data;
}

// ── Markdown view of BriefData ──
// Used by the brief page when rendering the structured data as a
// reading document. The structured BriefData is the source of truth;
// markdown is derived for display.
export function renderBriefAsMarkdown(brief: BriefData, query: string): string {
  const lines: string[] = [];
  lines.push(`# Brief: ${query}`);
  lines.push("");
  lines.push(
    `> **${brief.recommendedFormat}** · intent: **${brief.intent}** · ` +
      `target ${brief.wordCountMin.toLocaleString()}–${brief.wordCountMax.toLocaleString()} words · ` +
      `priority **${brief.priority}** · score **${brief.totalScore}/100**`
  );
  lines.push("");

  lines.push("## Intent");
  lines.push(brief.intentExplanation);
  lines.push("");

  lines.push("## Format and scope");
  lines.push(
    `**${brief.recommendedFormat[0].toUpperCase() + brief.recommendedFormat.slice(1)}**, ` +
      `${brief.wordCountMin.toLocaleString()}–${brief.wordCountMax.toLocaleString()} words.`
  );
  lines.push("");

  lines.push("## Suggested article structure");
  for (const h of brief.h2Structure) lines.push(`- ${h}`);
  lines.push("");

  if (brief.topCompetitors.length > 0) {
    lines.push("## Competitor gap analysis");
    lines.push("Top-ranking competitors cover:");
    for (const c of brief.topCompetitors) {
      lines.push(`- **${c.domain}** — ${c.coverage}`);
    }
    lines.push("");
    if (brief.competitorGaps.length > 0) {
      lines.push("What they miss (= what this piece should own):");
      for (const g of brief.competitorGaps) lines.push(`- ${g}`);
      lines.push("");
    }
  }

  if (brief.aiCitationAngle) {
    lines.push("## AI citation angle");
    if (brief.aiCitationAngle.competitorsCited.length > 0) {
      lines.push(
        `AI engines (Perplexity, AI Overviews, ChatGPT) currently cite **${brief.aiCitationAngle.competitorsCited
          .map((d) => `\`${d}\``)
          .join(", ")}** for this query — your domain is not in the answer. To win the citation:`
      );
    } else {
      lines.push(
        "This query is the shape AI engines answer directly. To earn citations:"
      );
    }
    for (const a of brief.aiCitationAngle.structuralAdvice) {
      lines.push(`- ${a}`);
    }
    lines.push("");
  }

  if (brief.cannibalization) {
    lines.push("## ⚠️ Cannibalization risk");
    lines.push(
      `**Resolution: ${brief.cannibalization.resolution}.** ${brief.cannibalization.resolutionReason}`
    );
    lines.push("");
    lines.push("Overlapping pages:");
    for (const p of brief.cannibalization.overlappingPages) {
      lines.push(`- [${p.title}](${p.url})`);
    }
    lines.push("");
  }

  lines.push("## CTA");
  lines.push(brief.ctaRecommendation);
  lines.push("");

  return lines.join("\n");
}

// ── Cannibalization detection helper ──
// Lightweight fuzzy match against existing library titles. Returns the
// rows whose title overlaps strongly with the query.
export function findCannibalizationMatches(
  query: string,
  library: Array<{ url: string; title: string; targetKeyword?: string }>,
  limit = 5
): Array<{ url: string; title: string }> {
  const q = query.toLowerCase().trim();
  const tokens = q.split(/\s+/).filter((t) => t.length >= 3);
  if (tokens.length === 0) return [];
  type Scored = { item: { url: string; title: string }; score: number };
  const scored: Scored[] = [];
  for (const item of library) {
    const t = item.title.toLowerCase();
    const k = (item.targetKeyword || "").toLowerCase();
    let score = 0;
    if (k && (k === q || k.includes(q) || q.includes(k))) score += 10;
    for (const tok of tokens) {
      if (t.includes(tok)) score += 1;
      if (k && k.includes(tok)) score += 1;
    }
    if (score >= 3)
      scored.push({ item: { url: item.url, title: item.title }, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.item);
}
