// ── Content quality signals ──────────────────────────────────────────
//
// Self-check that runs after AI generation. The Content screen renders
// these as a "did the system catch itself" panel. Each signal is
// independent — one amber doesn't fail the article, it just tells the
// writer where to look.

export interface QualitySignals {
  directAnswer: boolean;
  comparisonTable: boolean;
  cannibalizationOk: boolean;
  wordCount: number;
  wordCountTarget: number;
}

// First paragraph (≥30 words AND contains the target keyword) = the
// reader gets the answer immediately. This is the single biggest AEO
// signal — AI engines and search engines reward direct-answer leads.
export function checkDirectAnswer(
  markdown: string,
  targetKeyword: string
): boolean {
  // Strip leading H1/quote/separator lines, find first content paragraph.
  const lines = markdown.split("\n");
  let para: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("#") || line.startsWith(">") || line.startsWith("---")) {
      // Heading/quote — skip if we haven't started a paragraph yet.
      if (para.length === 0) continue;
      // Otherwise, the paragraph ended.
      break;
    }
    if (line === "") {
      if (para.length > 0) break;
      continue;
    }
    para.push(line);
  }
  if (para.length === 0) return false;
  const text = para.join(" ");
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < 30) return false;
  const haystack = text.toLowerCase();
  const needle = targetKeyword.toLowerCase().trim();
  if (!needle) return words >= 30;
  // Match either the full keyword or every multi-character token in it.
  if (haystack.includes(needle)) return true;
  const tokens = needle.split(/\s+/).filter((t) => t.length >= 3);
  if (tokens.length === 0) return true;
  return tokens.every((t) => haystack.includes(t));
}

// Markdown table detection: the divider row (`|---|---|`) is unique to
// GFM tables and cheap to grep for.
export function checkComparisonTable(markdown: string): boolean {
  return /^\s*\|[-:\s|]+\|\s*$/m.test(markdown);
}

// Cannibalization: this article's H1 (or first heading line) shouldn't
// exact-match an existing title in the library. We're lenient — only
// flag near-exact dupes, because the brief already surfaced fuzzy
// overlap warnings.
export function checkCannibalizationOk(
  markdown: string,
  libraryTitles: string[]
): boolean {
  const firstHeading = markdown
    .split("\n")
    .find((l) => l.startsWith("# "))
    ?.slice(2)
    .trim();
  if (!firstHeading) return true;
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const target = norm(firstHeading);
  for (const t of libraryTitles) {
    if (norm(t) === target) return false;
  }
  return true;
}

export function countWords(markdown: string): number {
  // Strip markdown noise then count word-ish tokens.
  const stripped = markdown
    .replace(/```[\s\S]*?```/g, " ") // code blocks
    .replace(/`[^`]*`/g, " ") // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[[^\]]*\]\([^)]*\)/g, " ") // links
    .replace(/[#>*_~|`-]/g, " ");
  return stripped.split(/\s+/).filter(Boolean).length;
}

export function computeQualitySignals(opts: {
  markdown: string;
  targetKeyword: string;
  wordCountTarget: number;
  libraryTitles: string[];
}): QualitySignals {
  return {
    directAnswer: checkDirectAnswer(opts.markdown, opts.targetKeyword),
    comparisonTable: checkComparisonTable(opts.markdown),
    cannibalizationOk: checkCannibalizationOk(
      opts.markdown,
      opts.libraryTitles
    ),
    wordCount: countWords(opts.markdown),
    wordCountTarget: opts.wordCountTarget
  };
}
