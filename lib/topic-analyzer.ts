// ── Topic Analyzer ────────────────────────────────────────────────────
//
// Given a candidate topic the strategist submits by hand, produce a
// full deterministic analysis:
//   • Detected intent + playbook (via classifiers)
//   • 6-pillar score breakdown + total + priority tier
//   • Cannibalization matches from the Content Library
//   • Deterministic brief (playbook-shaped)
//   • Alternate headline suggestions
//   • Competitor coverage summary
//   • AEO citation angle (when the shape fits)
//   • Recommendation ("proceed" / "refine" / "reconsider")
//
// No LLM call — the pipeline runs in <1s. The optional AI enrichment
// step lives in lib/topic-enricher.ts and is triggered separately.

import {
  classifyOpportunity,
  derivePriorityTier,
  type Intent,
  type OpportunityType,
  type PriorityTier,
  type ScoreBreakdown
} from "@/lib/opportunity-classifier";
import {
  detectPlaybook,
  PLAYBOOKS,
  type PlaybookId
} from "@/lib/growth-playbooks";
import {
  buildBriefData,
  findCannibalizationMatches,
  renderBriefAsMarkdown,
  type BriefData
} from "@/lib/brief-generator";
import {
  runQualityChecks,
  type QualityChecks
} from "@/lib/content-quality";

// ── Input + Output types ─────────────────────────────────────────────

export interface AnalyzeInput {
  title: string;
  targetKeyword?: string;
  notes?: string;
  // Optional draft body markdown. When present, the analyzer runs
  // the content-quality checks against it so the strategist can vet
  // copy + topic together in one pass.
  postBody?: string;
  // Workspace context — the strategist doesn't retype this, we pull
  // from settings at the call site.
  brand: {
    companyName?: string;
    brandNiche?: string;
    brandAudience?: string;
    brandVoice?: string;
    valueProposition?: string;
    productDescription?: string;
    primaryCta?: string;
  };
  competitors: Array<{ name: string; url: string; tier?: string }>;
  contentLibrary: Array<{
    url: string;
    title: string;
    targetKeyword?: string;
  }>;
}

export type Recommendation = "proceed" | "refine" | "reconsider";

export interface CannibalizationMatch {
  url: string;
  title: string;
  severity: "high" | "medium" | "low";
  reason: string;
}

export interface AnalysisResult {
  // ── Basic identity ──
  title: string;
  targetKeyword: string;
  articleTitle: string;

  // ── Classification ──
  intent: Intent;
  opportunityType: OpportunityType;
  playbook: PlaybookId;
  playbookLabel: string;
  aiCitationGap: boolean;

  // ── Score ──
  score: number;
  scoreBreakdown: ScoreBreakdown;
  priorityTier: PriorityTier;

  // ── Cannibalization ──
  cannibalization: {
    matches: CannibalizationMatch[];
    verdict: "clear" | "review" | "block";
    reason: string;
  };

  // ── Competitor coverage ──
  competitorCoverage: {
    likelyCoveredBy: Array<{ name: string; url: string }>;
    ownershipAngle: string;
    // Up to 8 candidate links that will surface real competitor
    // articles covering this topic. Deterministically generated
    // Google `site:` searches — clicking each one shows the actual
    // published pieces on that competitor domain. This is the honest
    // fallback until the Gemini enrichment step returns known URLs.
    candidateLinks: Array<{
      label: string; // "Search example.com" or "Web search"
      url: string; // Actual clickable Google search URL
      kind: "site-search" | "web-search";
      domain?: string;
    }>;
  };

  // ── Brief ──
  brief: BriefData;
  briefMarkdown: string;

  // ── AEO angle ──
  aeoAngle?: {
    citationWorthy: boolean;
    structuralAdvice: string[];
    exampleOpeningParagraph: string;
  };

  // ── Alternate headlines ──
  alternateHeadlines: string[];

  // ── Draft quality (only when postBody was provided) ──
  // Mirrors the checks Discovery runs on generated content so a
  // human-written draft is held to the same bar. When postBody is
  // absent, this is null.
  draftQuality?: {
    checks: QualityChecks;
    // Short human-readable summary of what needs fixing (or "clean").
    summary: string;
    // Content-body H2s extracted from the draft, if any — useful for
    // eyeballing the structure at a glance.
    h2Outline: string[];
  } | null;

  // ── Recommendation ──
  recommendation: {
    verdict: Recommendation;
    summary: string;
    nextSteps: string[];
  };

  // Bookkeeping
  generatedAt: string;
}

// ── Utility: derive a target keyword from a headline ─────────────────
// The strategist may submit a natural-language headline instead of a
// keyword phrase. We extract a 2-5 word keyword by stripping fillers.

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "in", "on", "to", "for", "with",
  "by", "from", "at", "your", "our", "how", "what", "why", "when",
  "which", "who", "is", "are", "be", "this", "that", "these", "those",
  "into", "about", "after", "before", "than", "then", "so", "as",
  "using", "use", "using", "vs", "vs."
]);

function deriveKeywordFromTitle(title: string): string {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const kept = words.filter((w) => !STOPWORDS.has(w) && w.length > 1);
  // Take the first 4 substantive tokens as the derived keyword.
  return kept.slice(0, 4).join(" ") || title.toLowerCase().slice(0, 40);
}

// ── Cannibalization scoring ──────────────────────────────────────────
// findCannibalizationMatches gives us title/URL overlap. We add a
// severity + reason on top so the UI can render a proper warning.

function scoreCannibalization(
  matches: Array<{ url: string; title: string; targetKeyword?: string }>,
  submittedTitle: string,
  submittedKeyword: string
): {
  matches: CannibalizationMatch[];
  verdict: "clear" | "review" | "block";
  reason: string;
} {
  if (matches.length === 0) {
    return {
      matches: [],
      verdict: "clear",
      reason: "No library titles overlap with this topic."
    };
  }
  const scored: CannibalizationMatch[] = matches.slice(0, 5).map((m) => {
    const t = m.title.toLowerCase();
    const kw = (m.targetKeyword || "").toLowerCase();
    const submittedT = submittedTitle.toLowerCase();
    const submittedKw = submittedKeyword.toLowerCase();
    // Exact keyword match → high severity.
    if (kw && (kw === submittedKw || kw === submittedT)) {
      return {
        url: m.url,
        title: m.title,
        severity: "high",
        reason: "Existing page targets the same keyword — publishing new would cannibalize."
      };
    }
    // Title very close → medium.
    const tokenOverlap = submittedT
      .split(/\s+/)
      .filter((tok) => tok.length >= 4 && t.includes(tok)).length;
    if (tokenOverlap >= 3) {
      return {
        url: m.url,
        title: m.title,
        severity: "medium",
        reason: `Title shares ${tokenOverlap} substantive tokens with an existing page. Differentiate scope.`
      };
    }
    return {
      url: m.url,
      title: m.title,
      severity: "low",
      reason: "Related but distinct — worth a quick manual scan."
    };
  });
  const worst = scored.reduce<CannibalizationMatch["severity"]>(
    (acc, c) =>
      c.severity === "high"
        ? "high"
        : c.severity === "medium" && acc !== "high"
        ? "medium"
        : acc,
    "low"
  );
  const verdict =
    worst === "high" ? "block" : worst === "medium" ? "review" : "clear";
  const reason =
    verdict === "block"
      ? "At least one existing page targets the same keyword. Refresh the existing page instead of publishing new."
      : verdict === "review"
      ? "Meaningful overlap with published content. Differentiate the angle before proceeding."
      : "Only weak overlaps — no cannibalization risk.";
  return { matches: scored, verdict, reason };
}

// ── Competitor coverage inference ────────────────────────────────────

function inferCompetitorCoverage(
  competitors: AnalyzeInput["competitors"],
  submittedTitle: string,
  targetKeyword: string
): {
  likelyCoveredBy: Array<{ name: string; url: string }>;
  ownershipAngle: string;
  candidateLinks: Array<{
    label: string;
    url: string;
    kind: "site-search" | "web-search";
    domain?: string;
  }>;
} {
  const primary = competitors.filter((c) => c.tier === "primary");
  const relevant = (primary.length > 0 ? primary : competitors).slice(0, 6);

  // Build up to 8 candidate links. Prefer per-competitor `site:` search
  // URLs (so clicking one lands on real published articles from that
  // domain). Then add up to 2 general web-search links so the
  // strategist can see the broader SERP too.
  const links: {
    label: string;
    url: string;
    kind: "site-search" | "web-search";
    domain?: string;
  }[] = [];

  // Prefer the keyword when short (better search recall) — otherwise
  // the title (which may include an angle Google can match on).
  const q =
    (targetKeyword && targetKeyword.length >= 3
      ? targetKeyword
      : submittedTitle
    ).slice(0, 140);
  const encoded = encodeURIComponent(q);

  for (const c of relevant.slice(0, 6)) {
    const domain = extractDomain(c.url);
    if (!domain) continue;
    links.push({
      label: `Search ${c.name || domain}`,
      url: `https://www.google.com/search?q=${encodeURIComponent(
        `site:${domain} ${q}`
      )}`,
      kind: "site-search",
      domain
    });
  }
  // General SERP + AI answer engines — always useful as a broader read.
  const remaining = Math.max(0, 8 - links.length);
  if (remaining >= 1) {
    links.push({
      label: `Google — "${q}"`,
      url: `https://www.google.com/search?q=${encoded}`,
      kind: "web-search"
    });
  }
  if (remaining >= 2) {
    links.push({
      label: `Perplexity — "${q}"`,
      url: `https://www.perplexity.ai/search?q=${encoded}`,
      kind: "web-search"
    });
  }

  return {
    likelyCoveredBy: relevant.map((c) => ({ name: c.name, url: c.url })),
    ownershipAngle:
      relevant.length > 0
        ? `${relevant.length} tracked competitor${
            relevant.length === 1 ? "" : "s"
          } likely cover this space. Differentiate on a specific angle (${
            submittedTitle.length > 60
              ? "you already have one"
              : "sharper vertical / stage / worked example"
          }) to earn share.`
        : "No competitors configured — the space is either uncontested or under-mapped. Add competitors in Settings for a stronger read.",
    candidateLinks: links.slice(0, 8)
  };
}

// Extract a clean hostname from a competitor URL. Returns "" when the
// URL is malformed rather than throwing.
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// ── AEO angle ────────────────────────────────────────────────────────

function buildAeoAngle(
  title: string,
  intent: Intent,
  playbook: PlaybookId,
  aiCitationGap: boolean,
  brandNiche?: string
): AnalysisResult["aeoAngle"] | undefined {
  if (!aiCitationGap && playbook !== "aeo-answer" && playbook !== "community-answer") {
    return undefined;
  }
  const t = title.toLowerCase();
  const questionShaped = /^(what|how|why|when|where|which|who|is|are)/.test(t);
  return {
    citationWorthy: questionShaped || playbook === "aeo-answer",
    structuralAdvice: [
      "Lead paragraph 1 with a 40-80-word direct answer that contains the exact keyword.",
      "Add a `> **TL;DR:**` blockquote right under paragraph 1.",
      "Frame each H2 as a follow-up question a reader would ask an AI engine.",
      "Include ≥5 quantified claims (numbers, dates, percentages) to be citation-quotable.",
      "End with a `## Frequently asked questions` section with 3-5 concise Q&A pairs."
    ],
    exampleOpeningParagraph: `${title} — a ${intent} question at the heart of what ${
      brandNiche || "this space"
    } practitioners face today. The short answer: [DIRECT ANSWER IN ONE SENTENCE]. This piece walks through the reasoning + the numbers that back it up.`
  };
}

// ── Alternate headlines ──────────────────────────────────────────────
// Deterministic variants shaped by the playbook. Not AI — pattern-based
// so the strategist gets 3 options to pick from without a Gemini call.

function generateAlternateHeadlines(
  title: string,
  keyword: string,
  playbook: PlaybookId,
  year = 2026
): string[] {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const kwCap = cap(keyword);
  const suggestions = new Set<string>();
  suggestions.add(title);

  switch (playbook) {
    case "pillar-guide":
      suggestions.add(`${kwCap}: the operator's playbook for ${year}`);
      suggestions.add(`${kwCap} — a working framework, with benchmarks`);
      suggestions.add(`What ${kwCap} looks like when it's done right`);
      break;
    case "aeo-answer":
      suggestions.add(`What is ${keyword}? The ${year} answer with worked numbers`);
      suggestions.add(`How ${keyword} actually works — a step-by-step explainer`);
      suggestions.add(`${kwCap} in ${year}: benchmarks + the direct answer`);
      break;
    case "comparison-vs":
      suggestions.add(`${kwCap}: a ${year} head-to-head`);
      suggestions.add(`The best ${keyword} options compared (with switching cost)`);
      suggestions.add(`Alternatives to ${keyword}: when each one wins`);
      break;
    case "free-tool":
      suggestions.add(`${kwCap} calculator — input your data, get the answer`);
      suggestions.add(`Free ${keyword} tool: paste it in, get a report`);
      break;
    case "lead-magnet":
      suggestions.add(`The ${year} ${keyword} template (free Notion)`);
      suggestions.add(`The ${keyword} checklist we use — download it`);
      break;
    case "refresh":
      suggestions.add(`Refresh: bring the existing ${keyword} page up to ${year} AEO standard`);
      suggestions.add(`Refresh: ${kwCap} — kill stale claims, add current benchmarks`);
      break;
    case "programmatic-seo":
      suggestions.add(`${kwCap} by industry — template that spawns 10 pages`);
      suggestions.add(`${kwCap} for [industry]: variable-driven template`);
      break;
    case "community-answer":
      suggestions.add(`How founders actually handle ${keyword}`);
      suggestions.add(`The r/startups question about ${keyword} — a practitioner answer`);
      break;
  }
  return Array.from(suggestions).slice(0, 4);
}

// ── Recommendation ───────────────────────────────────────────────────

function buildRecommendation(
  score: number,
  cannibalizationVerdict: "clear" | "review" | "block",
  aiCitationGap: boolean
): AnalysisResult["recommendation"] {
  if (cannibalizationVerdict === "block") {
    return {
      verdict: "reconsider",
      summary:
        "Cannibalization risk is high. Refresh the existing page instead of publishing a new one.",
      nextSteps: [
        "Refresh the flagged existing page — bring it up to today's AEO / structural standard.",
        "If you must publish new, pivot the angle to a clearly distinct sub-topic + retarget the keyword."
      ]
    };
  }
  if (score >= 70 && cannibalizationVerdict !== "review") {
    return {
      verdict: "proceed",
      summary: `Score ${score.toFixed(1)} / 100 — strong opportunity. ${
        aiCitationGap
          ? "AI-citation shape looks strong; write to the AEO angle."
          : "Standard SEO shape; write to the playbook."
      }`,
      nextSteps: [
        "Move to Analyzed, review the brief.",
        "Optionally enrich with Gemini for competitor + headline research.",
        "Approve and promote to AI Resources when ready to commission."
      ]
    };
  }
  if (score >= 50 || cannibalizationVerdict === "review") {
    return {
      verdict: "refine",
      summary:
        cannibalizationVerdict === "review"
          ? "Meaningful cannibalization signal — differentiate the angle before proceeding."
          : `Score ${score.toFixed(1)} / 100 — moderate. Sharpen the angle before committing.`,
      nextSteps: [
        cannibalizationVerdict === "review"
          ? "Review the flagged overlapping pages and pick a distinct angle."
          : "Consider narrowing the audience or the sub-topic to raise the score.",
        "Enrich with Gemini to see how competitors cover this."
      ]
    };
  }
  return {
    verdict: "reconsider",
    summary: `Score ${score.toFixed(1)} / 100 — below the bar for this batch. Reconsider before spending writer time.`,
    nextSteps: [
      "Check whether the target keyword is too broad or too narrow.",
      "Pivot to a related but higher-leverage angle.",
      "Archive if the score doesn't move after refinement."
    ]
  };
}

// ── Public entrypoint ────────────────────────────────────────────────

export function analyzeTopic(input: AnalyzeInput): AnalysisResult {
  const title = input.title.trim();
  const targetKeyword = (input.targetKeyword || "").trim() || deriveKeywordFromTitle(title);

  // Classifier — same 6-pillar breakdown Discovery uses.
  const brandNames = [
    input.brand.companyName,
    ...input.competitors.map((c) => c.name)
  ].filter(Boolean) as string[];

  // Cannibalization matches — need first to inform the classifier's
  // cannibalization-clarity score.
  const rawMatches = findCannibalizationMatches(
    targetKeyword,
    input.contentLibrary
  );
  const cannibalization = scoreCannibalization(
    rawMatches,
    title,
    targetKeyword
  );

  const classified = classifyOpportunity({
    source: "analyzer",
    query: targetKeyword,
    brandNames,
    // No live GSC data for a user-submitted topic — the classifier
    // falls back to intent-driven defaults for demand + trending.
    cannibalizingPageCount: cannibalization.matches.length
  });

  const playbook = detectPlaybook({
    title,
    targetKeyword,
    intent: classified.intent,
    hasCannibalizingPage: cannibalization.matches.length > 0,
    aiCitationGap: classified.aiCitationGap,
    isRefresh: cannibalization.verdict === "block"
  });

  const brief = buildBriefData({
    query: targetKeyword,
    articleTitle: title,
    intent: classified.intent,
    opportunityType: classified.opportunityType,
    priority: classified.priority,
    scoreBreakdown: classified.scoreBreakdown,
    totalScore: classified.totalScore,
    aiCitationGap: classified.aiCitationGap,
    competitorUrls: input.competitors.map((c) => c.url),
    competitorGapScore: 50,
    aiCitationsCited: [],
    cannibalizingPages: cannibalization.matches.map((m) => ({
      url: m.url,
      title: m.title
    })),
    brandPrimaryCta: input.brand.primaryCta,
    playbook
  });

  const briefMarkdown = renderBriefAsMarkdown(brief, title);
  const competitorCoverage = inferCompetitorCoverage(
    input.competitors,
    title,
    targetKeyword
  );
  const aeoAngle = buildAeoAngle(
    title,
    classified.intent,
    playbook,
    classified.aiCitationGap,
    input.brand.brandNiche
  );
  const alternateHeadlines = generateAlternateHeadlines(
    title,
    targetKeyword,
    playbook
  );
  // ── Draft quality (only when postBody is provided) ──
  // Runs the SAME quality checks the content generator runs on
  // generated articles, so a human-written draft is held to the same
  // bar. Extracts an H2 outline from the draft for at-a-glance review.
  let draftQuality: AnalysisResult["draftQuality"] = null;
  if (input.postBody && input.postBody.trim().length > 50) {
    const checks = runQualityChecks({
      markdown: input.postBody,
      targetKeyword,
      intent: classified.intent,
      wordCountMin: brief.wordCountMin,
      wordCountMax: brief.wordCountMax,
      cannibalizingPages: cannibalization.matches.map((m) => ({
        url: m.url,
        title: m.title
      }))
    });
    const failed: string[] = [];
    if (checks.directAnswerInP1.status === "fail")
      failed.push("direct-answer opening");
    if (checks.comparisonTable.status === "fail")
      failed.push("comparison table");
    if (checks.faqSection.status === "fail") failed.push("FAQ section");
    if (checks.cannibalizationAvoidance.status === "fail")
      failed.push("cannibalization avoidance");
    if (checks.wordCountInRange.status === "fail")
      failed.push("word count");
    const summary =
      checks.overall === "pass"
        ? "Draft clears every check — ready for review."
        : checks.overall === "warning"
        ? "Draft passes but has soft flags — tighten before publishing."
        : `Draft fails ${failed.length} check${failed.length === 1 ? "" : "s"}: ${failed.join(", ")}. Fix before publishing.`;

    // Pull H2 headings so the strategist can eyeball structure.
    const h2Outline: string[] = [];
    for (const line of input.postBody.split("\n")) {
      const m = line.match(/^##\s+(.+)$/);
      if (m) h2Outline.push(m[1].trim());
      if (h2Outline.length >= 15) break;
    }

    draftQuality = { checks, summary, h2Outline };
  }

  // Recommendation factors in draft quality when present — a failing
  // draft downgrades a topic that would otherwise proceed.
  const draftHasFailures =
    draftQuality?.checks.overall === "fail";
  const recommendation = buildRecommendation(
    classified.totalScore,
    // Treat a failing draft as functionally equivalent to a "review"
    // signal so the recommendation doesn't cheerfully say "proceed"
    // on broken copy.
    draftHasFailures && cannibalization.verdict === "clear"
      ? "review"
      : cannibalization.verdict,
    classified.aiCitationGap
  );

  return {
    title,
    targetKeyword,
    articleTitle: title,
    intent: classified.intent,
    opportunityType: classified.opportunityType,
    playbook,
    playbookLabel: PLAYBOOKS[playbook].label,
    aiCitationGap: classified.aiCitationGap,
    score: classified.totalScore,
    scoreBreakdown: classified.scoreBreakdown,
    priorityTier: derivePriorityTier(classified.totalScore),
    cannibalization,
    competitorCoverage,
    brief,
    briefMarkdown,
    aeoAngle,
    alternateHeadlines,
    draftQuality,
    recommendation,
    generatedAt: new Date().toISOString()
  };
}
