// ── Discovery content generation ──────────────────────────────────────
//
// Per-opportunity-type content generation. Each opportunity type
// (new / refresh / community) uses its own LLM provider + strategist
// instructions configured in the Integrations page.
//
// The prompt is the deterministic sum of:
//   1. Per-type strategist instructions (free-text from settings)
//   2. The brief's structured data (intent, H2s, gaps, AI angle,
//      cannibalization constraints)
//   3. A FIXED article-generation instruction block (defined here so
//      every opportunity type produces output with the same quality
//      checks: direct answer in p1, comparison table if commercial,
//      FAQ, no cannibalization, META: + TITLES: footers).
//
// Fallback: when no provider key is configured, return a template that
// fills the H2 structure with [WRITE: ...] placeholder blocks so the
// writer can finish manually. The full workflow stays usable.

import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";
import type { BriefData } from "@/lib/brief-generator";
import type { OpportunityType } from "@/lib/opportunity-classifier";

export type ProviderName = "openai" | "anthropic" | "gemini" | "mock";

export interface ContentGenInputs {
  query: string;
  brief: BriefData;
  opportunityType: OpportunityType;
  // Per-type provider config — pulled from settings before calling.
  providerByType: Record<OpportunityType, ProviderName>;
  instructionsByType: Record<OpportunityType, string>;
  // Brand context for voice + product positioning
  brand: {
    companyName?: string;
    brandNiche?: string;
    brandAudience?: string;
    brandVoice?: string;
    primaryCta?: string;
    productDescription?: string;
    valueProposition?: string;
  };
  // API keys + models — env vars override settings.
  keys: {
    openai?: string;
    anthropic?: string;
    gemini?: string;
    openaiModel?: string;
    anthropicModel?: string;
    geminiModel?: string;
  };
}

export interface ContentGenResult {
  markdown: string;
  metaDescription: string | null;
  titleVariants: string[];
  provider: ProviderName;
  isTemplate: boolean; // true = fallback template, false = real LLM output
  warnings: string[];
}

// ── Fixed article instruction block ──
// Identical for every opportunity type. The strategist instructions go
// BEFORE this block in the prompt; the brief data is interpolated INTO
// it. Defined once here so quality is consistent.
const FIXED_INSTRUCTIONS = `
You are writing a content marketing article. Follow these rules exactly:

1. **Open with a direct, factual answer to the question implied by the keyword.** Do NOT bury the answer. The first paragraph must contain the keyword and a clear quotable sentence that answers it. Aim for 40-80 words.

2. **Follow the H2 structure provided in the brief exactly.** Do not add or skip H2s. You may add H3 sub-sections under each H2.

3. **Include a structured markdown comparison table** if the intent is commercial. The table should compare at least 3 options with at least 4 columns (option, key feature, ideal user, starting price OR similar dimensions).

4. **Include a "## Frequently asked questions" section** with 3–5 Q&A pairs based on common queries around this keyword. Use **Q:** and **A:** prefixes for each pair.

5. **Avoid any phrasing that would compete with the cannibalizing pages** listed in the brief. Do not mention their URLs or restate their unique angle.

6. **End the article with:**
   - A single line starting with \`META:\` followed by a meta description (140-160 chars).
   - A single line starting with \`TITLES:\` followed by 3 title variants separated by \` | \` (vertical bar with surrounding spaces).

7. **Output clean markdown only.** No code fences wrapping the whole output, no frontmatter, no extra commentary. Start with \`# \` title heading.

8. **Use specific quantified claims** wherever possible — numbers, percentages, dates. Generic phrasing makes AI engines skip the source.
`.trim();

// Build the full prompt sent to whichever provider is selected.
function buildPrompt(inputs: ContentGenInputs): string {
  const { brief, brand, query } = inputs;
  const perTypeInstructions =
    inputs.instructionsByType[inputs.opportunityType]?.trim() || "";

  const lines: string[] = [];
  lines.push(`## TARGET KEYWORD\n${query}`);
  lines.push("");
  lines.push(`## INTENT\n${brief.intent} — ${brief.intentExplanation}`);
  lines.push("");
  lines.push(
    `## FORMAT\n${brief.recommendedFormat}, ${brief.wordCountMin}–${brief.wordCountMax} words.`
  );
  lines.push("");
  lines.push(
    `## REQUIRED H2 STRUCTURE\n${brief.h2Structure.map((h, i) => `${i + 1}. ${h}`).join("\n")}`
  );
  lines.push("");
  if (brief.topCompetitors.length > 0) {
    lines.push(
      `## COMPETITOR COVERAGE (what to differentiate from)\n${brief.topCompetitors.map((c) => `- ${c.domain}: ${c.coverage}`).join("\n")}`
    );
    lines.push("");
  }
  if (brief.competitorGaps.length > 0) {
    lines.push(
      `## COMPETITOR GAPS (= angles to own)\n${brief.competitorGaps.map((g) => `- ${g}`).join("\n")}`
    );
    lines.push("");
  }
  if (brief.aiCitationAngle) {
    lines.push(`## AI CITATION REQUIREMENT`);
    if (brief.aiCitationAngle.competitorsCited.length > 0) {
      lines.push(
        `AI engines currently cite: ${brief.aiCitationAngle.competitorsCited.join(", ")} for this query. Your domain is not in the answer. Use these structural patterns to win the citation:`
      );
    }
    for (const a of brief.aiCitationAngle.structuralAdvice) {
      lines.push(`- ${a}`);
    }
    lines.push("");
  }
  if (brief.cannibalization) {
    lines.push(`## CANNIBALIZATION CONSTRAINTS`);
    lines.push(
      `These existing pages target overlapping intent and MUST NOT be replicated or competed with:`
    );
    for (const p of brief.cannibalization.overlappingPages) {
      lines.push(`- ${p.url} — "${p.title}"`);
    }
    lines.push(
      `Resolution: ${brief.cannibalization.resolutionReason}`
    );
    lines.push("");
  }
  lines.push(`## CTA\n${brief.ctaRecommendation}`);
  lines.push("");
  if (
    brand.brandNiche ||
    brand.brandAudience ||
    brand.brandVoice ||
    brand.valueProposition
  ) {
    lines.push(`## BRAND CONTEXT`);
    if (brand.companyName) lines.push(`Company: ${brand.companyName}`);
    if (brand.brandNiche) lines.push(`Niche: ${brand.brandNiche}`);
    if (brand.brandAudience) lines.push(`Audience: ${brand.brandAudience}`);
    if (brand.brandVoice) lines.push(`Voice: ${brand.brandVoice}`);
    if (brand.valueProposition)
      lines.push(`Value proposition: ${brand.valueProposition}`);
    lines.push("");
  }

  let header = "";
  if (perTypeInstructions) {
    header = `## STRATEGIST INSTRUCTIONS (highest priority)\n${perTypeInstructions}\n\n`;
  }

  return `${header}${lines.join("\n")}\n\n## ARTICLE GENERATION RULES\n${FIXED_INSTRUCTIONS}`;
}

// ── Provider callouts ──
async function callOpenAI(
  prompt: string,
  apiKey: string,
  model: string
): Promise<string> {
  const client = new OpenAI({ apiKey });
  const res = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content:
          "You are an expert content marketing writer. Output the article only — no commentary."
      },
      { role: "user", content: prompt }
    ],
    temperature: 0.6
  });
  return res.choices[0]?.message?.content?.trim() || "";
}

async function callAnthropic(
  prompt: string,
  apiKey: string,
  model: string
): Promise<string> {
  const client = new Anthropic({ apiKey });
  const res = await client.messages.create({
    model,
    max_tokens: 4096,
    system:
      "You are an expert content marketing writer. Output the article only — no commentary.",
    messages: [{ role: "user", content: prompt }]
  });
  const part = res.content[0];
  if (part.type === "text") return part.text.trim();
  return "";
}

async function callGemini(
  prompt: string,
  apiKey: string,
  model: string
): Promise<string> {
  const client = new GoogleGenerativeAI(apiKey);
  const m = client.getGenerativeModel({ model });
  const r = await m.generateContent(prompt);
  return r.response.text().trim();
}

// ── Template fallback ──
function buildTemplate(query: string, brief: BriefData): string {
  const lines: string[] = [];
  lines.push(`# ${query.charAt(0).toUpperCase() + query.slice(1)}`);
  lines.push("");
  lines.push(
    `> ⚠️ **This is a template, not AI-generated.** All providers were unavailable or unconfigured. Fill in each [WRITE: ...] block to complete the article.`
  );
  lines.push("");
  lines.push(
    `[WRITE: Direct answer — 40–80 words, must contain the phrase "${query}", and answer the implied question of the keyword.]`
  );
  lines.push("");
  for (const h of brief.h2Structure) {
    lines.push(`## ${h}`);
    lines.push("");
    lines.push(`[WRITE: ${h} — 150–300 words.]`);
    lines.push("");
  }
  if (brief.intent === "commercial") {
    lines.push(`## Comparison`);
    lines.push("");
    lines.push(`| Option | Best for | Starting price | Key feature |`);
    lines.push(`|---|---|---|---|`);
    lines.push(`| Option 1 | [WRITE] | [WRITE] | [WRITE] |`);
    lines.push(`| Option 2 | [WRITE] | [WRITE] | [WRITE] |`);
    lines.push(`| Option 3 | [WRITE] | [WRITE] | [WRITE] |`);
    lines.push("");
  }
  lines.push(`## Frequently asked questions`);
  lines.push("");
  lines.push(`**Q:** [WRITE: common question 1]`);
  lines.push(`**A:** [WRITE: short, factual answer]`);
  lines.push("");
  lines.push(`**Q:** [WRITE: common question 2]`);
  lines.push(`**A:** [WRITE: short, factual answer]`);
  lines.push("");
  lines.push(`**Q:** [WRITE: common question 3]`);
  lines.push(`**A:** [WRITE: short, factual answer]`);
  lines.push("");
  lines.push(`**CTA:** ${brief.ctaRecommendation}`);
  lines.push("");
  lines.push(`META: [WRITE: 140–160 character meta description]`);
  lines.push(
    `TITLES: [WRITE: variant 1] | [WRITE: variant 2] | [WRITE: variant 3]`
  );
  return lines.join("\n");
}

// ── Public entrypoint ──
export async function generateDiscoveryContent(
  inputs: ContentGenInputs
): Promise<ContentGenResult> {
  const warnings: string[] = [];
  const provider = inputs.providerByType[inputs.opportunityType];
  const prompt = buildPrompt(inputs);

  // Provider chain — try the chosen one first, then fall back across
  // the others, then template as the last resort.
  const order: ProviderName[] = [];
  order.push(provider);
  for (const p of ["openai", "anthropic", "gemini"] as const) {
    if (!order.includes(p)) order.push(p);
  }

  for (const which of order) {
    try {
      if (which === "openai" && inputs.keys.openai) {
        const text = await callOpenAI(
          prompt,
          inputs.keys.openai,
          inputs.keys.openaiModel || "gpt-4o-mini"
        );
        if (text) {
          if (which !== provider) {
            warnings.push(
              `Selected provider "${provider}" was unavailable — used "${which}" instead.`
            );
          }
          const parsed = parseTrailers(text);
          return {
            markdown: parsed.body,
            metaDescription: parsed.meta,
            titleVariants: parsed.titles,
            provider: "openai",
            isTemplate: false,
            warnings
          };
        }
      }
      if (which === "anthropic" && inputs.keys.anthropic) {
        const text = await callAnthropic(
          prompt,
          inputs.keys.anthropic,
          inputs.keys.anthropicModel || "claude-haiku-4-5"
        );
        if (text) {
          if (which !== provider) {
            warnings.push(
              `Selected provider "${provider}" was unavailable — used "${which}" instead.`
            );
          }
          const parsed = parseTrailers(text);
          return {
            markdown: parsed.body,
            metaDescription: parsed.meta,
            titleVariants: parsed.titles,
            provider: "anthropic",
            isTemplate: false,
            warnings
          };
        }
      }
      if (which === "gemini" && inputs.keys.gemini) {
        const text = await callGemini(
          prompt,
          inputs.keys.gemini,
          inputs.keys.geminiModel || "gemini-2.0-flash"
        );
        if (text) {
          if (which !== provider) {
            warnings.push(
              `Selected provider "${provider}" was unavailable — used "${which}" instead.`
            );
          }
          const parsed = parseTrailers(text);
          return {
            markdown: parsed.body,
            metaDescription: parsed.meta,
            titleVariants: parsed.titles,
            provider: "gemini",
            isTemplate: false,
            warnings
          };
        }
      }
    } catch (err) {
      const msg = (err as Error).message;
      warnings.push(`${which}: ${msg}`);
    }
  }

  // No provider worked → template fallback.
  warnings.push(
    "No LLM provider configured or all providers failed. Generated a template instead."
  );
  return {
    markdown: buildTemplate(inputs.query, inputs.brief),
    metaDescription: null,
    titleVariants: [],
    provider: "mock",
    isTemplate: true,
    warnings
  };
}

// Parses META: and TITLES: trailers from an LLM response.
function parseTrailers(text: string): {
  body: string;
  meta: string | null;
  titles: string[];
} {
  const lines = text.split("\n");
  let meta: string | null = null;
  let titles: string[] = [];
  const bodyLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^META\s*:/i.test(trimmed)) {
      meta = trimmed.replace(/^META\s*:\s*/i, "").trim();
      continue;
    }
    if (/^TITLES?\s*:/i.test(trimmed)) {
      titles = trimmed
        .replace(/^TITLES?\s*:\s*/i, "")
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean);
      continue;
    }
    bodyLines.push(line);
  }
  // Strip trailing blank lines
  while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1].trim() === "") {
    bodyLines.pop();
  }
  return { body: bodyLines.join("\n"), meta, titles };
}
