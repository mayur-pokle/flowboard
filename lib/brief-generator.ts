// ── Deterministic brief generator ────────────────────────────────────
//
// Assembles a writer-facing brief markdown from a discovered
// opportunity's signals + workspace context. No LLM in this path
// because briefs should be FAST and AUDITABLE: the strategist must
// trust that the same opportunity always produces the same brief
// unless the inputs change. AI is reserved for the article itself.
//
// Output is plain markdown. The Brief page renders it left-column;
// warning boxes (cannibalization, AI citation angle) are derived
// directly from opportunity fields on the page rather than baked into
// the markdown — they need to be styled, dismissible, and clickable.

import type { Intent, ScoreBreakdown } from "@/lib/opportunity-classifier";

export interface BriefInput {
  query: string;
  source: string;
  intent: Intent | null;
  score: number;
  scoreBreakdown: ScoreBreakdown | null;
  aiCitationGap: boolean;
  metrics: Record<string, number | string | null | undefined> | null;
  reason: string | null;
  // Settings context
  brand: {
    companyName?: string;
    brandNiche?: string;
    brandAudience?: string;
    brandVoice?: string;
    primaryCta?: string;
    valueProposition?: string;
  };
  competitors: Array<{ name: string; url: string; tier?: string }>;
  // Top relevant pieces from the existing content library — used in the
  // internal-linking section.
  relatedExistingContent: Array<{
    url: string;
    title: string;
    targetKeyword?: string;
  }>;
  // Library pieces that may cannibalize — same keyword/intent already
  // published. Surfaced in the warning box at the top of the page.
  cannibalizationMatches: Array<{
    url: string;
    title: string;
    targetKeyword?: string;
  }>;
}

// Content type recommendation derived from intent. Strategist can
// override on the Kanban card later.
function contentTypeFor(intent: Intent | null): {
  type: string;
  shape: string;
  wordCountTarget: number;
} {
  switch (intent) {
    case "transactional":
      return {
        type: "Landing page / Tool",
        shape: "Free tool, template, or calculator with a clear CTA",
        wordCountTarget: 800
      };
    case "commercial":
      return {
        type: "Comparison / Buyer's guide",
        shape:
          "Comparison table + criteria-based recommendation + clear next-step CTA",
        wordCountTarget: 2000
      };
    case "navigational":
      return {
        type: "Brand page",
        shape: "Direct answer + product positioning + customer evidence",
        wordCountTarget: 1200
      };
    case "informational":
    default:
      return {
        type: "Guide / Explainer",
        shape:
          "Direct answer in first 2 paragraphs + structured how-to + examples",
        wordCountTarget: 1800
      };
  }
}

// Outline templates per intent — these are starting points, the writer
// reshapes them. They give the brief enough scaffolding to feel
// useful, not so much that they constrain the writer.
function outlineFor(query: string, intent: Intent | null): string[] {
  switch (intent) {
    case "transactional":
      return [
        `What ${query} solves (one-liner)`,
        "How it works in 60 seconds",
        "Step-by-step usage / inputs needed",
        "Worked example",
        "Common edge cases",
        "Get started CTA"
      ];
    case "commercial":
      return [
        `Direct answer: the short version`,
        "Evaluation criteria",
        "Top contenders compared (table)",
        "Honorable mentions",
        "How to decide based on your situation",
        "Recommendation + next step"
      ];
    case "navigational":
      return [
        `What ${query} is`,
        "Who it's for",
        "How it compares to alternatives",
        "Customer outcomes",
        "Where to go next"
      ];
    case "informational":
    default:
      return [
        `Direct answer in 2 paragraphs (lead with the answer)`,
        `Background: why ${query} matters`,
        "Step-by-step explanation",
        "Worked example",
        "Common mistakes",
        "Related concepts",
        "FAQ / quick reference"
      ];
  }
}

// Format the metrics dict into a single-line summary the brief can
// quote. Different sources contribute different fields.
function metricsLine(
  metrics: BriefInput["metrics"],
  source: string
): string {
  if (!metrics) return "—";
  const parts: string[] = [];
  if (typeof metrics.impressions === "number") {
    parts.push(`${metrics.impressions.toLocaleString()} impressions`);
  }
  if (typeof metrics.clicks === "number") {
    parts.push(`${metrics.clicks.toLocaleString()} clicks`);
  }
  if (typeof metrics.ctr === "number") {
    parts.push(`${(metrics.ctr * 100).toFixed(1)}% CTR`);
  }
  if (typeof metrics.position === "number") {
    parts.push(`avg pos ${(metrics.position as number).toFixed(1)}`);
  }
  if (typeof metrics.volume === "number") {
    parts.push(`${metrics.volume.toLocaleString()} vol/mo`);
  }
  if (typeof metrics.difficulty === "number") {
    parts.push(`KD ${metrics.difficulty}`);
  }
  if (parts.length === 0) return source.toUpperCase();
  return parts.join(" · ");
}

export function generateBriefMarkdown(input: BriefInput): string {
  const ct = contentTypeFor(input.intent);
  const outline = outlineFor(input.query, input.intent);
  const brand = input.brand;
  const lines: string[] = [];

  // ── Title block ─────────────────────────────────────────────────
  lines.push(`# Brief: ${input.query}`);
  lines.push("");
  lines.push(
    `> **${ct.type}** · target keyword \`${input.query}\` · intent: **${input.intent || "informational"}** · target ~${ct.wordCountTarget} words`
  );
  lines.push("");

  // ── Strategic context ───────────────────────────────────────────
  lines.push("## Why we're writing this");
  if (input.reason) {
    lines.push(input.reason);
  }
  const sb = input.scoreBreakdown;
  if (sb) {
    lines.push("");
    lines.push(
      `Score ${input.score}/100 = GSC velocity ${sb.gscVelocity} + ` +
        `competitor gap ${sb.competitorGap} + AI citation gap ${sb.aiCitationGap} + ` +
        `conversion fit ${sb.conversions}.`
    );
  }
  lines.push("");
  lines.push(`**Source signal:** ${metricsLine(input.metrics, input.source)}`);
  lines.push("");

  // ── Audience + voice ────────────────────────────────────────────
  if (
    brand.brandAudience ||
    brand.brandVoice ||
    brand.valueProposition
  ) {
    lines.push("## Audience + voice");
    if (brand.brandAudience) lines.push(`**Reader:** ${brand.brandAudience}`);
    if (brand.brandVoice) lines.push(`**Voice:** ${brand.brandVoice}`);
    if (brand.valueProposition) {
      lines.push(`**Our angle:** ${brand.valueProposition}`);
    }
    lines.push("");
  }

  // ── Content shape ───────────────────────────────────────────────
  lines.push("## Content shape");
  lines.push(ct.shape);
  lines.push("");
  lines.push(
    `**Word count target:** ~${ct.wordCountTarget} words (±15%).`
  );
  lines.push("");

  // ── Outline ─────────────────────────────────────────────────────
  lines.push("## Suggested outline");
  for (const item of outline) {
    lines.push(`- ${item}`);
  }
  lines.push("");

  // ── AI citation angle (also in the purple box, but in-brief too
  // so it survives copy-paste). ─────────────────────────────────
  if (input.aiCitationGap) {
    lines.push("## AI citation angle (AEO/GEO)");
    lines.push(
      "This query is the shape AI engines (Perplexity, AI Overviews, ChatGPT) tend to answer directly. To earn citations:"
    );
    lines.push(
      "- **Lead with a direct answer in the first 2 paragraphs.** No throat-clearing intro."
    );
    lines.push(
      "- **Add a short summary box** at the top with the headline answer in plain English."
    );
    lines.push(
      "- **Cite specific numbers** — AI engines prefer sources with concrete data over generic claims."
    );
    lines.push(
      "- **Use unambiguous H2s** that match likely follow-up questions."
    );
    lines.push("");
  }

  // ── Cannibalization callout ──────────────────────────────────────
  if (input.cannibalizationMatches.length > 0) {
    lines.push("## ⚠️ Cannibalization risk");
    lines.push(
      "These existing pages already target overlapping intent. Either update them instead, or differentiate this piece clearly:"
    );
    for (const c of input.cannibalizationMatches.slice(0, 5)) {
      lines.push(`- [${c.title}](${c.url})${c.targetKeyword ? ` — \`${c.targetKeyword}\`` : ""}`);
    }
    lines.push("");
  }

  // ── Internal linking ─────────────────────────────────────────────
  if (input.relatedExistingContent.length > 0) {
    lines.push("## Internal links to weave in");
    for (const c of input.relatedExistingContent.slice(0, 8)) {
      lines.push(`- [${c.title}](${c.url})`);
    }
    lines.push("");
  }

  // ── Competitor reference ────────────────────────────────────────
  if (input.competitors.length > 0) {
    lines.push("## Competitor reference");
    lines.push(
      "Read these before drafting so you know what's already out there:"
    );
    for (const c of input.competitors.slice(0, 5)) {
      lines.push(`- [${c.name || c.url}](${c.url})`);
    }
    lines.push("");
  }

  // ── CTA + brand ─────────────────────────────────────────────────
  lines.push("## CTA");
  lines.push(brand.primaryCta || "Book a demo");
  lines.push("");
  if (brand.brandNiche) {
    lines.push(`*Brand context: ${brand.brandNiche}.*`);
  }

  return lines.join("\n");
}

// Heuristic: find existingContent rows that could cannibalize this
// query (same keyword OR title contains the query). Returns at most
// `limit` matches sorted by overlap strength.
export function findCannibalizationMatches(
  query: string,
  library: Array<{ url: string; title: string; targetKeyword?: string }>,
  limit = 5
): Array<{ url: string; title: string; targetKeyword?: string }> {
  const q = query.toLowerCase().trim();
  const tokens = q.split(/\s+/).filter((t) => t.length >= 3);
  if (tokens.length === 0) return [];

  type Scored = { item: (typeof library)[number]; score: number };
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
    if (score >= 3) scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.item);
}

// Looser version of above — return RELATED (not cannibalizing) pieces
// to suggest as internal links. Lower threshold + excludes the
// cannibalizing matches.
export function findRelatedContent(
  query: string,
  library: Array<{ url: string; title: string; targetKeyword?: string }>,
  excludeUrls: Set<string>,
  limit = 8
): Array<{ url: string; title: string; targetKeyword?: string }> {
  const q = query.toLowerCase().trim();
  const tokens = q.split(/\s+/).filter((t) => t.length >= 3);
  if (tokens.length === 0) return [];

  type Scored = { item: (typeof library)[number]; score: number };
  const scored: Scored[] = [];
  for (const item of library) {
    if (excludeUrls.has(item.url)) continue;
    const t = item.title.toLowerCase();
    let score = 0;
    for (const tok of tokens) {
      if (t.includes(tok)) score += 1;
    }
    if (score >= 1) scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.item);
}
