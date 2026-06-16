// ── Content quality checks ────────────────────────────────────────────
//
// Auto-verified after content generation. Each check is independent and
// returns a status: "pass" | "warning" | "fail". The strategist sees
// these as a panel — pass/warning/fail icons next to each criterion.
// One amber doesn't block publishing; it just tells the writer where
// to look.

export type CheckStatus = "pass" | "warning" | "fail";

export interface QualityCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail?: string;
}

export interface QualityChecks {
  directAnswerInP1: QualityCheck;
  comparisonTable: QualityCheck;
  faqSection: QualityCheck;
  cannibalizationAvoidance: QualityCheck;
  wordCountInRange: QualityCheck;
  // Convenience aggregate
  overall: "pass" | "warning" | "fail";
  wordCount: number;
}

// First paragraph contains the keyword AND is ≥30 words → strongest
// AEO signal. We also check this in the first 150 words just in case
// the writer led with a TL;DR block.
function checkDirectAnswer(
  markdown: string,
  targetKeyword: string
): QualityCheck {
  const firstChunk = firstNWords(markdown, 150);
  const haystack = firstChunk.toLowerCase();
  const needle = targetKeyword.toLowerCase().trim();
  if (firstChunk.split(/\s+/).filter(Boolean).length < 30) {
    return {
      id: "directAnswer",
      label: "Direct answer in opening paragraph",
      status: "fail",
      detail: "Opening is too short to be a direct answer."
    };
  }
  if (!haystack.includes(needle)) {
    const tokens = needle.split(/\s+/).filter((t) => t.length >= 3);
    const all = tokens.length > 0 && tokens.every((t) => haystack.includes(t));
    if (!all) {
      return {
        id: "directAnswer",
        label: "Direct answer in opening paragraph",
        status: "fail",
        detail: "Target keyword not in the first 150 words."
      };
    }
  }
  return {
    id: "directAnswer",
    label: "Direct answer in opening paragraph",
    status: "pass"
  };
}

// GFM table divider row signals a markdown table.
function checkComparisonTable(
  markdown: string,
  required: boolean
): QualityCheck {
  const present = /^\s*\|[-:\s|]+\|\s*$/m.test(markdown);
  if (present) {
    return {
      id: "comparisonTable",
      label: "Includes a comparison table",
      status: "pass"
    };
  }
  return {
    id: "comparisonTable",
    label: "Includes a comparison table",
    status: required ? "fail" : "warning",
    detail: required
      ? "Commercial intent requires a comparison table."
      : "Not required for this intent but tables boost AI citation odds."
  };
}

// Heading: "## Frequently asked questions" or any "## ... FAQ ..."
function checkFaqSection(markdown: string): QualityCheck {
  const has = /^##\s+(frequently asked questions|faq)/im.test(markdown);
  if (has) {
    return {
      id: "faqSection",
      label: "FAQ section present",
      status: "pass"
    };
  }
  return {
    id: "faqSection",
    label: "FAQ section present",
    status: "warning",
    detail: "No FAQ section detected — AI engines reward structured Q&A."
  };
}

// Cannibalization avoidance — the article must NOT mention the
// cannibalizing page URLs or restate their distinct angle (we proxy
// this by checking the article doesn't contain any of the URLs or
// page titles verbatim).
function checkCannibalizationAvoidance(
  markdown: string,
  cannibalizingPages: Array<{ url: string; title: string }>
): QualityCheck {
  if (cannibalizingPages.length === 0) {
    return {
      id: "cannibalization",
      label: "Cannibalization respected",
      status: "pass",
      detail: "No overlapping pages to avoid."
    };
  }
  const lower = markdown.toLowerCase();
  const hits: string[] = [];
  for (const p of cannibalizingPages) {
    if (lower.includes(p.url.toLowerCase())) hits.push(p.url);
    else if (lower.includes(p.title.toLowerCase())) hits.push(p.title);
  }
  if (hits.length === 0) {
    return {
      id: "cannibalization",
      label: "Cannibalization respected",
      status: "pass"
    };
  }
  return {
    id: "cannibalization",
    label: "Cannibalization respected",
    status: "fail",
    detail: `Article references ${hits.length} cannibalizing source${hits.length > 1 ? "s" : ""}. Remove direct mentions.`
  };
}

function checkWordCount(
  markdown: string,
  min: number,
  max: number
): QualityCheck {
  const count = countWords(markdown);
  if (count >= min && count <= max) {
    return {
      id: "wordCount",
      label: `Word count ${count.toLocaleString()} (target ${min}–${max})`,
      status: "pass"
    };
  }
  if (count >= min * 0.8 && count <= max * 1.2) {
    return {
      id: "wordCount",
      label: `Word count ${count.toLocaleString()} (target ${min}–${max})`,
      status: "warning",
      detail:
        count < min
          ? "Slightly under target — could add a worked example."
          : "Slightly over target — tighten where possible."
    };
  }
  return {
    id: "wordCount",
    label: `Word count ${count.toLocaleString()} (target ${min}–${max})`,
    status: "fail",
    detail:
      count < min
        ? "Significantly below target word count."
        : "Significantly over target word count."
  };
}

function firstNWords(s: string, n: number): string {
  return s.split(/\s+/).filter(Boolean).slice(0, n).join(" ");
}

export function countWords(markdown: string): number {
  const stripped = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/[#>*_~|`-]/g, " ");
  return stripped.split(/\s+/).filter(Boolean).length;
}

export function runQualityChecks(opts: {
  markdown: string;
  targetKeyword: string;
  intent: string;
  wordCountMin: number;
  wordCountMax: number;
  cannibalizingPages: Array<{ url: string; title: string }>;
}): QualityChecks {
  const directAnswerInP1 = checkDirectAnswer(opts.markdown, opts.targetKeyword);
  const comparisonTable = checkComparisonTable(
    opts.markdown,
    opts.intent === "commercial"
  );
  const faqSection = checkFaqSection(opts.markdown);
  const cannibalizationAvoidance = checkCannibalizationAvoidance(
    opts.markdown,
    opts.cannibalizingPages
  );
  const wordCountInRange = checkWordCount(
    opts.markdown,
    opts.wordCountMin,
    opts.wordCountMax
  );
  const all = [
    directAnswerInP1,
    comparisonTable,
    faqSection,
    cannibalizationAvoidance,
    wordCountInRange
  ];
  let overall: "pass" | "warning" | "fail" = "pass";
  if (all.some((c) => c.status === "fail")) overall = "fail";
  else if (all.some((c) => c.status === "warning")) overall = "warning";
  return {
    directAnswerInP1,
    comparisonTable,
    faqSection,
    cannibalizationAvoidance,
    wordCountInRange,
    overall,
    wordCount: countWords(opts.markdown)
  };
}
