// ── AI Citations Tracker auto-fill ────────────────────────────────────
//
// Auto-fills the three configuration fields on the AI Citations
// Tracker source card:
//
//   1. Competitor domains — deterministic pull from workspace
//      settings.competitors (Primary + Secondary tiers only, Watch
//      skipped).
//   2. Brand terms — deterministic derivation from companyName +
//      websiteUrl + productDescription vocabulary.
//   3. Prompts to monitor — Gemini-generated realistic user questions
//      shaped by brand niche + audience + product + seed keywords.
//      Falls through Gemini → OpenAI → Anthropic → deterministic
//      pattern library so the flow works with zero LLM keys.

import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

export interface CitationsSuggesterInput {
  brand: {
    companyName?: string;
    websiteUrl?: string;
    brandNiche?: string;
    brandAudience?: string;
    productDescription?: string;
    valueProposition?: string;
    primaryCta?: string;
    seedKeywords?: string;
  };
  competitors: Array<{
    name: string;
    url: string;
    tier?: string;
  }>;
  desiredPromptCount?: number; // default 15
}

export interface CitationsSuggesterResult {
  provider: "gemini" | "openai" | "anthropic" | "deterministic";
  competitorDomains: string[];
  brandTerms: string[];
  prompts: string[];
  warnings: string[];
}

// ── Deterministic pieces ─────────────────────────────────────────────

// Normalize a URL to a bare hostname (no scheme, no www, no path).
function toDomain(input: string): string {
  const raw = input.trim();
  if (!raw) return "";
  try {
    // Add scheme if missing so URL() parses hostnames-only inputs too.
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const u = new URL(withScheme);
    return u.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    // Fallback: strip manually.
    return raw
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(/\/.*$/, "")
      .toLowerCase();
  }
}

function competitorDomainsFromInput(
  competitors: CitationsSuggesterInput["competitors"]
): string[] {
  // Primary + Secondary only — Watch competitors are tracked but not
  // fought against, so shouldn't set expectations for AI citations.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of competitors) {
    if (c.tier === "watch") continue;
    const d = toDomain(c.url);
    if (!d || seen.has(d)) continue;
    seen.add(d);
    out.push(d);
  }
  return out;
}

// Product / brand-name candidates extracted from the productDescription.
// Look for capitalized multi-word phrases that likely name a feature.
function extractCandidateBrandNames(text: string): string[] {
  const out = new Set<string>();
  // Match "Xxxx Yyyy" or "XxxxYyyy" style phrases up to 3 words.
  const re = /\b([A-Z][a-zA-Z]{1,}(?:\s+[A-Z][a-zA-Z]{1,}){0,2})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const cand = m[1].trim();
    // Skip common sentence starters.
    if (/^(This|That|The|Our|Your|My|We|You)$/i.test(cand)) continue;
    if (cand.length < 3) continue;
    if (cand.length > 40) continue;
    out.add(cand);
    if (out.size >= 10) break;
  }
  return Array.from(out);
}

function brandTermsFromInput(brand: CitationsSuggesterInput["brand"]): string[] {
  const terms: string[] = [];
  const seen = new Set<string>();
  const push = (v: string) => {
    const t = v.trim();
    if (!t) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    terms.push(t);
  };
  if (brand.companyName) push(brand.companyName);
  if (brand.websiteUrl) push(toDomain(brand.websiteUrl));
  // Root domain without TLD (e.g. "zeni" from "zeni.ai") — some AI
  // engines strip the TLD when naming a brand.
  const domain = brand.websiteUrl ? toDomain(brand.websiteUrl) : "";
  if (domain) {
    const root = domain.split(".")[0];
    if (root && root.length >= 3) push(root);
  }
  // Candidate product / feature names from productDescription.
  if (brand.productDescription) {
    for (const c of extractCandidateBrandNames(brand.productDescription).slice(
      0,
      4
    )) {
      push(c);
    }
  }
  return terms.slice(0, 10);
}

// ── Deterministic prompt patterns ──
// Used when no LLM is configured. Realistic enough that the strategist
// can start monitoring immediately; sharper prompts come from Gemini.
function deterministicPrompts(input: CitationsSuggesterInput): string[] {
  const niche = (input.brand.brandNiche || "").trim().toLowerCase();
  const audience = (input.brand.brandAudience || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  const seeds = input.brand.seedKeywords
    ? input.brand.seedKeywords
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const cats = niche || "this space";
  const shortAudience = audience || "operators";
  const primaryCompetitor = input.competitors[0]?.name || "";
  const secondCompetitor = input.competitors[1]?.name || "";

  const out: string[] = [];
  const push = (p: string) => {
    if (p.length < 8 || p.length > 140) return;
    if (!out.includes(p)) out.push(p);
  };

  // Definition + explainer prompts
  if (niche) {
    push(`What is ${cats}?`);
    push(`How does ${cats} actually work?`);
    push(`Why does ${cats} matter for ${shortAudience}?`);
  }
  // Buyer prompts
  if (niche) {
    push(`Best ${cats} software`);
    push(`Best ${cats} for ${shortAudience}`);
    push(`How to choose the right ${cats}`);
  }
  // Comparison prompts
  if (primaryCompetitor && secondCompetitor) {
    push(`${primaryCompetitor} vs ${secondCompetitor}`);
  }
  if (primaryCompetitor) {
    push(`Alternatives to ${primaryCompetitor}`);
  }
  // Seed-keyword prompts
  for (const s of seeds.slice(0, 4)) {
    push(`What is ${s}?`);
    push(`Best tools for ${s}`);
  }
  // Benchmark prompts
  if (niche) {
    push(`Benchmark: ${cats} by stage`);
    push(`Key metrics for ${cats} in 2026`);
  }
  return out.slice(0, input.desiredPromptCount || 15);
}

// ── LLM prompt for realistic monitoring prompts ──

const SYSTEM_PROMPT = `You are an AEO/GEO strategist. Your job: generate a short list of REALISTIC user questions that people ask AI engines (ChatGPT, Perplexity, Google AI Overviews) about a brand's category.

# WHAT THE STRATEGIST USES THIS FOR

The output list becomes the "monitored prompts" for an AI-citation tracker. For each prompt, the tracker checks whether the brand's name appears in the AI-generated answer or whether only competitors are cited. So the prompts must be:

1. **Real user phrasings** — how a founder / operator / practitioner would actually type into a chat interface. Casual, direct, sometimes messy.
2. **Where AI engines already answer** — questions where AI Overviews / Perplexity / ChatGPT return a synthesized answer with citations, not just a list of links.
3. **Where the brand SHOULD show up** — the topic is squarely in the brand's category or positioning; the brand losing the citation is real damage.

# COVERAGE — split roughly like this

- 4-5 definition / explainer prompts ("What is X?", "How does X work?")
- 3-4 comparison / buyer prompts ("Best X for Y", "X vs Y", "Alternatives to X")
- 3-4 how-to / benchmark prompts ("How do I X?", "Benchmark X by stage")
- 2-3 adjacent or community prompts (angles the brand's audience actually asks)

# RULES

- Each prompt is 6-140 characters.
- Lowercase-natural — no title case, no headline formatting.
- No brand mention (we're testing whether the AI mentions THEM unprompted).
- No duplicates.
- Return an array of strings only.

# OUTPUT

Return ONE JSON object with a single "prompts" array of strings. No prose, no fences.

{ "prompts": string[] }`;

function buildUserPrompt(input: CitationsSuggesterInput): string {
  const lines: string[] = [];
  lines.push(
    `Generate ${input.desiredPromptCount || 15} monitored prompts for this brand.`
  );
  lines.push("");
  lines.push("# BRAND CONTEXT");
  if (input.brand.companyName)
    lines.push(`Company: ${input.brand.companyName}`);
  if (input.brand.brandNiche) lines.push(`Niche: ${input.brand.brandNiche}`);
  if (input.brand.brandAudience)
    lines.push(`Audience: ${input.brand.brandAudience}`);
  if (input.brand.productDescription)
    lines.push(`Product: ${input.brand.productDescription}`);
  if (input.brand.valueProposition)
    lines.push(`Value prop: ${input.brand.valueProposition}`);
  if (input.brand.seedKeywords)
    lines.push(`Seed keywords: ${input.brand.seedKeywords}`);
  lines.push("");
  if (input.competitors.length > 0) {
    lines.push("# COMPETITORS (their names are useful in vs / alternative prompts)");
    for (const c of input.competitors.slice(0, 10)) {
      lines.push(`- ${c.name || c.url}`);
    }
    lines.push("");
  }
  lines.push("Now output the JSON object per the schema.");
  return lines.join("\n");
}

async function callGemini(
  system: string,
  user: string,
  apiKey: string,
  model: string
): Promise<string> {
  const client = new GoogleGenerativeAI(apiKey);
  const m = client.getGenerativeModel({
    model,
    systemInstruction: system,
    generationConfig: {
      temperature: 0.75,
      responseMimeType: "application/json"
    }
  });
  const r = await m.generateContent(user);
  return r.response.text();
}

async function callOpenAI(
  system: string,
  user: string,
  apiKey: string,
  model: string
): Promise<string> {
  const client = new OpenAI({ apiKey });
  const res = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    temperature: 0.7,
    response_format: { type: "json_object" }
  });
  return res.choices[0]?.message?.content || "";
}

async function callAnthropic(
  system: string,
  user: string,
  apiKey: string,
  model: string
): Promise<string> {
  const client = new Anthropic({ apiKey });
  const res = await client.messages.create({
    model,
    max_tokens: 2000,
    system,
    messages: [{ role: "user", content: user }]
  });
  const part = res.content[0];
  return part.type === "text" ? part.text : "";
}

function parsePrompts(raw: string, cap: number): string[] {
  let text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return [];
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as Record<
      string,
      unknown
    >;
    const arr = obj.prompts;
    if (!Array.isArray(arr)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of arr) {
      if (typeof item !== "string") continue;
      const p = item.trim();
      if (p.length < 8 || p.length > 140) continue;
      const key = p.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
      if (out.length >= cap) break;
    }
    return out;
  } catch {
    return [];
  }
}

// ── Public entrypoint ────────────────────────────────────────────────

export async function suggestCitationsConfig(
  input: CitationsSuggesterInput,
  keys: {
    gemini?: string;
    openai?: string;
    anthropic?: string;
    geminiModel?: string;
    openaiModel?: string;
    anthropicModel?: string;
  }
): Promise<CitationsSuggesterResult> {
  const warnings: string[] = [];
  const competitorDomains = competitorDomainsFromInput(input.competitors);
  const brandTerms = brandTermsFromInput(input.brand);
  const cap = input.desiredPromptCount || 15;

  const userPrompt = buildUserPrompt(input);

  if (keys.gemini) {
    try {
      const raw = await callGemini(
        SYSTEM_PROMPT,
        userPrompt,
        keys.gemini,
        keys.geminiModel || "gemini-2.0-flash"
      );
      const prompts = parsePrompts(raw, cap);
      if (prompts.length > 0) {
        return {
          provider: "gemini",
          competitorDomains,
          brandTerms,
          prompts,
          warnings
        };
      }
      warnings.push("Gemini returned no parseable prompts.");
    } catch (err) {
      warnings.push(`Gemini failed: ${(err as Error).message}`);
    }
  }

  if (keys.openai) {
    try {
      const raw = await callOpenAI(
        SYSTEM_PROMPT,
        userPrompt,
        keys.openai,
        keys.openaiModel || "gpt-4o-mini"
      );
      const prompts = parsePrompts(raw, cap);
      if (prompts.length > 0) {
        return {
          provider: "openai",
          competitorDomains,
          brandTerms,
          prompts,
          warnings
        };
      }
    } catch (err) {
      warnings.push(`OpenAI failed: ${(err as Error).message}`);
    }
  }

  if (keys.anthropic) {
    try {
      const raw = await callAnthropic(
        SYSTEM_PROMPT,
        userPrompt,
        keys.anthropic,
        keys.anthropicModel || "claude-haiku-4-5"
      );
      const prompts = parsePrompts(raw, cap);
      if (prompts.length > 0) {
        return {
          provider: "anthropic",
          competitorDomains,
          brandTerms,
          prompts,
          warnings
        };
      }
    } catch (err) {
      warnings.push(`Anthropic failed: ${(err as Error).message}`);
    }
  }

  warnings.push(
    "No LLM key available. Prompts fell back to a deterministic pattern set. Add GEMINI_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY for sharper suggestions."
  );
  return {
    provider: "deterministic",
    competitorDomains,
    brandTerms,
    prompts: deterministicPrompts(input),
    warnings
  };
}
