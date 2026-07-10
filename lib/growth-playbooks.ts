// ── Growth Playbook Library ──────────────────────────────────────────
//
// One place for every content-opportunity archetype the app knows how
// to produce. Each playbook codifies a framework from the skills
// library (content-strategy, ai-seo, competitors, programmatic-seo,
// free-tools, lead-magnets, customer-research, marketing-ideas, etc.)
// so the generators can produce a diverse mix instead of a single flat
// "10 blog post ideas" list.
//
// The library is used at THREE points in the funnel:
//   1. TOPIC gen — the prompt requires the LLM to emit items across
//      playbooks. Quotas enforce minimum coverage.
//   2. BRIEF gen — dispatches to a playbook-specific brief section
//      (comparison table skeleton, AEO answer block, tool spec, etc.).
//   3. CONTENT gen — playbook-specific instructions replace the
//      one-size-fits-all article rules.

export type PlaybookId =
  | "pillar-guide"
  | "aeo-answer"
  | "comparison-vs"
  | "programmatic-seo"
  | "free-tool"
  | "lead-magnet"
  | "refresh"
  | "community-answer";

export interface Playbook {
  id: PlaybookId;
  label: string;
  // Source skill(s) that inform this playbook. Surfaced in the prompt
  // so the LLM knows where the rules came from.
  sourceSkills: string[];
  // Short user-facing description.
  description: string;
  // When the LLM should reach for this playbook.
  whenToUse: string;
  // Example titles the LLM can pattern-match against.
  exampleTitles: string[];
  // Titles / titles patterns the LLM should AVOID for this playbook.
  bannedPatterns: string[];
  // What the article structure should look like (rendered into brief).
  structureRules: string[];
  // What the CONTENT generation prompt should enforce for this playbook.
  contentRules: string[];
  // Small extra section that goes into the brief markdown when the
  // playbook is this one.
  briefAddon: string;
  // Word count target range.
  wordCountMin: number;
  wordCountMax: number;
  // Minimum number of items this playbook should represent when the
  // generator is asked for N total. Used to build quotas.
  minShare: number; // 0-1
}

// ── Playbook definitions ─────────────────────────────────────────────

export const PLAYBOOKS: Record<PlaybookId, Playbook> = {
  "pillar-guide": {
    id: "pillar-guide",
    label: "Pillar Guide",
    sourceSkills: ["content-strategy", "site-architecture", "seo-audit"],
    description:
      "A comprehensive hub article on a core topic that anchors a content cluster. Links out to spoke articles.",
    whenToUse:
      "The brand has authority in a domain but no definitive resource for its core term. Ranks for broad head keywords.",
    exampleTitles: [
      "Cash flow forecasting for SaaS: the operator's playbook",
      "The 2026 guide to burn multiple — how to read it, benchmark it, act on it",
      "SaaS revenue recognition: rules, edge cases, and worked examples"
    ],
    bannedPatterns: [
      "'Complete guide to X'",
      "'Ultimate guide to X'",
      "'Everything you need to know about X'"
    ],
    structureRules: [
      "H1 — pillar topic phrased as an operator's frame",
      "TL;DR block (3-5 bullets) at the top",
      "5-8 H2 sections, each mapped to a distinct sub-topic (which becomes a spoke article target)",
      "Internal links to spoke articles inside each H2",
      "Downloadable resource block (template / checklist) near the end",
      "FAQ section with 5-7 questions"
    ],
    contentRules: [
      "Open with a TL;DR — 3-5 bullets summarizing the piece before section 1.",
      "Every H2 must open with a direct one-sentence takeaway before expanding.",
      "Include a comparison table when the topic has multiple approaches / tools.",
      "End with a FAQ block (## Frequently asked questions) covering common follow-ups.",
      "Include ≥3 quantified claims (numbers, dates, percentages)."
    ],
    briefAddon:
      "This is a **pillar article** — it should anchor a content cluster. Include internal-link stubs where each H2 will eventually link to a dedicated spoke article on the sub-topic. Add a downloadable template or checklist as the primary conversion asset.",
    wordCountMin: 2200,
    wordCountMax: 3200,
    minShare: 0.15
  },

  "aeo-answer": {
    id: "aeo-answer",
    label: "AEO Answer",
    sourceSkills: ["ai-seo", "schema", "content-strategy"],
    description:
      "A citation-worthy article shaped for AI answer engines. Direct answer + quantified claims + heading Q&A structure.",
    whenToUse:
      "Question-shaped queries where competitors are cited by Perplexity/ChatGPT and the brand isn't. High leverage for AEO gap closure.",
    exampleTitles: [
      "What is runway? The 4-step calculation and 2026 benchmarks",
      "How to forecast SaaS ARR: a worked example with real numbers",
      "Free cash flow vs. operating cash flow — the differences that matter"
    ],
    bannedPatterns: [
      "'A beginner's guide to X'",
      "'Understanding X'",
      "'What is X? (Everything you need to know)'"
    ],
    structureRules: [
      "Question-shaped H1 that matches how humans ask AI engines",
      "Direct answer paragraph FIRST — 40-80 words, contains the exact keyword",
      "TL;DR block right after the answer paragraph",
      "H2s framed as sub-questions ('How is X calculated?', 'When does X apply?')",
      "Quantified claims throughout — numbers, dates, percentages",
      "Comparison table if the query invites comparison",
      "Structured FAQ section at the bottom with schema-friendly Q&A"
    ],
    contentRules: [
      "Paragraph 1 MUST answer the implied question directly in 40-80 words and contain the exact target keyword.",
      "Include a `> **TL;DR:**` blockquote right under paragraph 1 with 2-3 bullet-style sentences.",
      "Every H2 should be a natural follow-up question a reader/AI engine would ask.",
      "Include at least 5 specific numbers or dates that make claims quotable.",
      "End with `## Frequently asked questions` containing 3-5 Q&A pairs, each answer under 60 words.",
      "Never bury the answer. If you find yourself writing 'in this article we'll cover…' — rewrite."
    ],
    briefAddon:
      "This is an **AEO Answer** piece — the goal is to get cited by AI engines (Perplexity, Google AI Overviews, ChatGPT). The FIRST paragraph must directly answer the question. Every H2 should be a follow-up question. Density of quantified claims determines citation likelihood.",
    wordCountMin: 1400,
    wordCountMax: 2000,
    minShare: 0.2
  },

  "comparison-vs": {
    id: "comparison-vs",
    label: "Comparison / Alternative",
    sourceSkills: ["competitors", "competitor-profiling", "cro"],
    description:
      "Head-to-head comparison or 'best alternatives to X' article. High commercial intent, high citation-density.",
    whenToUse:
      "Commercial-intent queries with 'vs', 'alternatives', 'compare'. Or when a competitor already ranks a comparison page and we don't.",
    exampleTitles: [
      "Stripe vs. Chargebee for SaaS billing — a 2026 head-to-head",
      "5 alternatives to QuickBooks for startups (with switching cost breakdowns)",
      "Notion vs. Coda for finance teams — the ops-first comparison"
    ],
    bannedPatterns: [
      "Any title without a clear comparison signal",
      "'Best X' without naming who's being compared"
    ],
    structureRules: [
      "Direct-answer opening naming the winner + when the alternative wins",
      "Evaluation criteria section (5-8 axes)",
      "Comparison table (must include 4+ columns and 3+ rows)",
      "Detailed section per option (feature depth, price, ideal user)",
      "Decision tree — 'if you're X, pick Y'",
      "FAQ + our-recommendation footer with CTA"
    ],
    contentRules: [
      "Include a markdown comparison table with at least 4 columns (option / best-for / starting-price / key-limitation) and 3+ rows.",
      "Lead with a 60-word direct-answer paragraph naming the top pick + the criterion that would flip the choice.",
      "Do not fluff each option — pick the 2-3 axes that matter and rank them.",
      "Include a 'When to pick each' or 'Decision by use case' section — no vague equal-weighting.",
      "End with a clear CTA (demo/trial/pricing) matching the brand's primary CTA."
    ],
    briefAddon:
      "This is a **Comparison / Alternative** page — high commercial intent. Structure MUST include a comparison table. Lead with a direct pick, not diplomatic hedging. Assume the reader has already decided to compare — they want the answer.",
    wordCountMin: 1800,
    wordCountMax: 2600,
    minShare: 0.1
  },

  "programmatic-seo": {
    id: "programmatic-seo",
    label: "Programmatic SEO",
    sourceSkills: ["programmatic-seo", "site-architecture"],
    description:
      "Template + data page — one article defines the pattern; the pattern spawns N similar pages by varying an input (industry, city, use case, integration).",
    whenToUse:
      "Long-tail keywords where the same information structure could be repeated with variable substitution. Directory-style intent.",
    exampleTitles: [
      "Cash flow forecasting templates by industry (SaaS, agency, ecom, consulting)",
      "AI accounting tools for [industry] — a template for evaluating fit",
      "Runway calculator: benchmarks by stage (pre-seed → Series B)"
    ],
    bannedPatterns: [
      "Fully-baked one-off article shapes without a variable pattern"
    ],
    structureRules: [
      "First page defines the template — H2 skeleton stays constant, data slots vary",
      "Explicit 'variable slot' descriptions in the brief so future pages can be spawned quickly",
      "One canonical example page fully written",
      "Instructions to the writer/AI for producing the next N pages using the pattern"
    ],
    contentRules: [
      "Write ONE canonical page in full using the template. Do not attempt to produce all variants inline.",
      "Every reusable section should have a clear boundary the writer can replace when spawning the next page.",
      "Include a 'This is page 1 of a template' note at the end explaining the pattern.",
      "Choose the highest-intent variable value for the first page — real search demand, not the alphabetical first entry."
    ],
    briefAddon:
      "This is a **Programmatic SEO** template page — page 1 is the pattern definition. Identify the VARIABLE clearly (industry / city / integration / use-case). Write it so the next page can be spawned by swapping one input.",
    wordCountMin: 1000,
    wordCountMax: 1600,
    minShare: 0.05
  },

  "free-tool": {
    id: "free-tool",
    label: "Free Tool",
    sourceSkills: ["free-tools", "cro", "lead-magnets"],
    description:
      "An interactive calculator, generator, grader, or auditor. Not an article — a small tool page with copy that positions the tool.",
    whenToUse:
      "The topic involves a calculation, a decision matrix, or a repeatable audit. Users would rather compute than read.",
    exampleTitles: [
      "SaaS runway calculator — input revenue, burn, headcount → get runway",
      "Cash flow health check: paste your 6-month P&L, get a red/yellow/green report",
      "Pricing generator for tiered SaaS plans"
    ],
    bannedPatterns: [
      "Content-first titles that don't imply a tool"
    ],
    structureRules: [
      "Landing-page copy shape: hero + tool embed + how it works + examples + FAQ",
      "Inputs + outputs specified explicitly",
      "Under-the-hood formula documented",
      "Email-gated 'send me the full report' CTA (optional, high-intent)",
      "Related content links to a matching AEO/pillar article"
    ],
    contentRules: [
      "Do NOT write a full article. Write LANDING PAGE copy: hero headline + subhead + 'how it works' + 'when to use' + FAQ.",
      "Include a 'Formula' section documenting the exact math so the writer/engineer building the tool has a spec.",
      "Explicitly name the inputs (with types + example values) and the output shape.",
      "Add a 'What next?' block linking to the nearest pillar / AEO article on the topic.",
      "Keep hero copy under 30 words. The tool speaks for itself."
    ],
    briefAddon:
      "This is a **Free Tool** — output is a landing page + a spec for the tool itself. Nail the inputs / outputs / formula. This is engineering-as-marketing: the tool is the moat.",
    wordCountMin: 600,
    wordCountMax: 1000,
    minShare: 0.1
  },

  "lead-magnet": {
    id: "lead-magnet",
    label: "Lead Magnet",
    sourceSkills: ["lead-magnets", "content-strategy"],
    description:
      "A downloadable resource — checklist, template, playbook, benchmark report. Paired with a short landing page.",
    whenToUse:
      "The audience benefits from a portable asset (spreadsheet, PDF, doc). Best when the content is reusable, not consumed once.",
    exampleTitles: [
      "The 2026 SaaS finance close checklist (Notion template)",
      "Burn multiple by stage — free benchmark PDF for founders",
      "The KPI dashboard template every controller should copy"
    ],
    bannedPatterns: [
      "Articles disguised as templates"
    ],
    structureRules: [
      "Short landing page copy (400-700 words) — problem, what's inside, how to use, download",
      "Explicit spec of the downloadable — sections, columns, or slides",
      "Email-gate copy line ('Enter your email — we'll send the template.')",
      "Follow-up sequence hint (what emails go out next)"
    ],
    contentRules: [
      "Write the LANDING PAGE copy, not the asset itself.",
      "Specify the asset's structure: for a template, list every section/column; for a checklist, list every item.",
      "Include a 'Who this is for' section — first-person outcome-based language.",
      "Include the email-gate line: 'Enter your work email — we'll send the [asset] to your inbox.'",
      "Add a 'Follow-up' hint at the end noting what the nurture sequence should reinforce."
    ],
    briefAddon:
      "This is a **Lead Magnet** — the article is a landing page, the real asset is the download. Specify the asset's structure so a designer can produce it. Include email-gate copy + nurture sequence hint.",
    wordCountMin: 400,
    wordCountMax: 800,
    minShare: 0.1
  },

  refresh: {
    id: "refresh",
    label: "Refresh",
    sourceSkills: ["seo-audit", "copy-editing", "content-strategy"],
    description:
      "Update to an existing published article — kill stale claims, add fresh data, restructure for current SERP.",
    whenToUse:
      "The library already has a page on the topic but it's losing ground, is missing AEO-required structure, or contains dated benchmarks.",
    exampleTitles: [
      "Refresh: 'Month-end close checklist' — add 2026 timing + downloadable",
      "Refresh: 'ARR vs. MRR' — rewrite lead as direct answer, add calculator embed",
      "Refresh: 'Free cash flow explainer' — add comparison table, cite Perplexity queries"
    ],
    bannedPatterns: [
      "Refresh proposals without naming the specific existing URL"
    ],
    structureRules: [
      "Name the existing URL being refreshed",
      "List what's stale (specific claims to update)",
      "List what to ADD (missing AEO block, new benchmarks, comparison table)",
      "Preserve the URL — do not create a new page"
    ],
    contentRules: [
      "Do not write from scratch. Produce a DIFF: what to keep, what to remove, what to add.",
      "Add a 'What changed' block at the top of the piece for the writer.",
      "Preserve the existing URL — this is not a new page.",
      "Bring the opening paragraph up to AEO standard (direct answer + keyword + 40-80 words)."
    ],
    briefAddon:
      "This is a **Refresh** — the existing URL keeps its slot in Google. The brief names what's stale, what to add, and what structural upgrades bring it up to today's SERP + AEO bar.",
    wordCountMin: 400,
    wordCountMax: 900,
    minShare: 0.1
  },

  "community-answer": {
    id: "community-answer",
    label: "Community Answer",
    sourceSkills: ["community-marketing", "customer-research", "ai-seo"],
    description:
      "Answers a specific question the audience is asking on Reddit, forums, or via AI chat prompts. Positioned as the definitive source.",
    whenToUse:
      "A question keeps coming up in community channels (subreddits, Slack, Discord) and AI engines cite competitors. Own the answer.",
    exampleTitles: [
      "How founders actually handle a first-time audit — a Reddit-thread walkthrough",
      "The stripe-to-QuickBooks reconciliation problem no docs solve for",
      "What early-stage CFOs really monitor weekly (from 30 practitioner interviews)"
    ],
    bannedPatterns: [
      "Generic explainers not tied to a specific community question"
    ],
    structureRules: [
      "Cite the specific community source (subreddit thread, forum question, common ChatGPT prompt) in the brief",
      "Direct-answer opening tied to the community phrasing",
      "Include original quotes / paraphrases from actual practitioners (mark for a research pass)",
      "End with a natural share-back — the piece is written to be linked from the community"
    ],
    contentRules: [
      "Reference the exact community question in the introduction — 'Founders on r/startups keep asking …'.",
      "Include 2-3 quoted or paraphrased practitioner examples (mark [SOURCE-CITE] for the writer to fill).",
      "Speak in the vocabulary of the community — not the sanitized brand voice.",
      "End with a soft share hook — 'If this helped, forward it to the operator who asked' — not a hard CTA.",
      "Optimize the opening for AI-engine citation — this is where Perplexity looks."
    ],
    briefAddon:
      "This is a **Community Answer** — the community's question is the north star. Cite the source thread / prompt in the brief. Use community vocabulary in the content. Optimize the opening for AI-engine citation.",
    wordCountMin: 1000,
    wordCountMax: 1600,
    minShare: 0.1
  }
};

// ── Coverage / quotas ────────────────────────────────────────────────
//
// Given N requested items, distribute minimum counts across playbooks
// so the LLM produces a balanced mix. minShare sums to 0.9 across
// playbooks; the last 10% is flex — the LLM can double up on the best
// fit for the brand.

export function playbookQuotas(totalCount: number): Record<PlaybookId, number> {
  const out: Record<string, number> = {};
  let assigned = 0;
  const ids = Object.keys(PLAYBOOKS) as PlaybookId[];
  for (const id of ids) {
    const n = Math.max(1, Math.round(PLAYBOOKS[id].minShare * totalCount));
    out[id] = n;
    assigned += n;
  }
  // If we over-assigned, trim the smallest allocations first.
  while (assigned > totalCount) {
    let smallestId: PlaybookId = ids[0];
    for (const id of ids) {
      if (out[id] > 0 && out[id] < out[smallestId]) smallestId = id;
    }
    out[smallestId] -= 1;
    assigned -= 1;
  }
  return out as Record<PlaybookId, number>;
}

export interface CoverageCheck {
  ok: boolean;
  deficits: Array<{ playbook: PlaybookId; required: number; actual: number }>;
  summary: string;
}

export function checkCoverage(
  items: Array<{ playbook?: string }>,
  totalCount: number
): CoverageCheck {
  const quotas = playbookQuotas(totalCount);
  const counts: Record<string, number> = {};
  for (const item of items) {
    if (item.playbook) counts[item.playbook] = (counts[item.playbook] || 0) + 1;
  }
  const deficits: CoverageCheck["deficits"] = [];
  for (const id of Object.keys(quotas) as PlaybookId[]) {
    const required = quotas[id];
    const actual = counts[id] || 0;
    if (actual < required) {
      deficits.push({ playbook: id, required, actual });
    }
  }
  return {
    ok: deficits.length === 0,
    deficits,
    summary: deficits
      .map((d) => `${d.playbook}: ${d.actual}/${d.required}`)
      .join(", ")
  };
}

// ── Playbook detection ───────────────────────────────────────────────
//
// Infer the most likely playbook from an existing topic/opportunity's
// fields. Used when the topic/opportunity was generated BEFORE the
// playbook was recorded — brief + content gen call this to route to
// the right playbook.

export interface DetectInput {
  title?: string;
  targetKeyword?: string;
  intent?: string;
  contentType?: string;
  source?: string;
  hasCannibalizingPage?: boolean;
  isRefresh?: boolean;
  aiCitationGap?: boolean;
}

export function detectPlaybook(input: DetectInput): PlaybookId {
  const title = (input.title || "").toLowerCase();
  const kw = (input.targetKeyword || "").toLowerCase();

  // Refresh signal wins first — it's structural, not vibes.
  if (
    input.isRefresh ||
    input.source === "refresh" ||
    input.hasCannibalizingPage
  ) {
    return "refresh";
  }

  // Programmatic patterns: title includes "by [industry|city|use case]"
  // or "[X] for [Y]" template shapes.
  if (
    /\bby (industry|stage|team|city|country|region)\b/.test(title) ||
    /\bby size\b/.test(title) ||
    /\btemplate(s)? by\b/.test(title)
  ) {
    return "programmatic-seo";
  }

  // Free tool signals.
  if (
    /calculator|generator|grader|auditor|checker|estimator|dashboard/.test(
      title
    ) ||
    (input.contentType || "").toLowerCase() === "calculator"
  ) {
    return "free-tool";
  }

  // Lead magnet signals.
  if (
    /template|checklist|playbook|benchmark report|framework|worksheet|swipe file/.test(
      title
    ) ||
    ["template", "checklist"].includes(
      (input.contentType || "").toLowerCase()
    )
  ) {
    return "lead-magnet";
  }

  // Comparison signals.
  if (
    / vs\.? /.test(title) ||
    /alternatives? to /.test(title) ||
    /compare\b/.test(title) ||
    input.intent === "commercial"
  ) {
    return "comparison-vs";
  }

  // Community-answer signals.
  if (
    /reddit|forum|community|practitioner interview|actually handle|from \d+ /.test(
      title
    ) ||
    input.source === "ai-citations"
  ) {
    return "community-answer";
  }

  // AEO answer signals.
  if (
    /^what (is|are)|^how (to|do|does)|^why |^when |^which |^who /.test(
      title
    ) ||
    input.aiCitationGap
  ) {
    return "aeo-answer";
  }

  // Default to pillar for broad topics without a strong signal.
  return "pillar-guide";
}

// ── Playbook helpers for prompts ─────────────────────────────────────

// Renders the playbook definitions into a string block suitable for
// dropping into a system prompt. Used by both topic-gen and content-gen
// so the LLM knows the full menu.
export function renderPlaybookMenuForPrompt(
  totalCount: number
): string {
  const quotas = playbookQuotas(totalCount);
  const lines: string[] = [];
  lines.push("# PLAYBOOK MENU (you MUST return items across these types)");
  lines.push("");
  for (const id of Object.keys(PLAYBOOKS) as PlaybookId[]) {
    const p = PLAYBOOKS[id];
    lines.push(`## ${p.label} — id: \`${p.id}\` (min ${quotas[id]} items)`);
    lines.push(
      `_Source skills: ${p.sourceSkills.map((s) => `\`${s}\``).join(", ")}_`
    );
    lines.push("");
    lines.push(p.description);
    lines.push("");
    lines.push(`**When to use:** ${p.whenToUse}`);
    lines.push("");
    lines.push("**Good title examples:**");
    for (const t of p.exampleTitles) lines.push(`- ${t}`);
    lines.push("");
    lines.push("**Banned title patterns:**");
    for (const b of p.bannedPatterns) lines.push(`- ${b}`);
    lines.push("");
  }
  return lines.join("\n");
}

// Renders playbook-specific CONTENT rules for the article generator.
// Called when the topic's playbook is known so the AI generates the
// right shape of content (comparison table for vs pages, tool copy for
// tools, etc.).
export function renderPlaybookContentRules(playbookId: PlaybookId): string {
  const p = PLAYBOOKS[playbookId];
  if (!p) return "";
  const lines: string[] = [];
  lines.push(`# PLAYBOOK: ${p.label}`);
  lines.push("");
  lines.push(`_Source skills: ${p.sourceSkills.join(", ")}_`);
  lines.push("");
  lines.push("## STRUCTURE");
  for (const r of p.structureRules) lines.push(`- ${r}`);
  lines.push("");
  lines.push("## CONTENT RULES (override the generic article rules)");
  for (const r of p.contentRules) lines.push(`- ${r}`);
  lines.push("");
  lines.push(`## WORD COUNT: ${p.wordCountMin}-${p.wordCountMax} words`);
  return lines.join("\n");
}

// Playbook-specific brief section — inserted into buildBriefData
// output so the brief markdown carries the playbook's frame.
export function renderPlaybookBriefAddon(playbookId: PlaybookId): string {
  const p = PLAYBOOKS[playbookId];
  if (!p) return "";
  return `**Playbook: ${p.label}.** ${p.briefAddon}`;
}
