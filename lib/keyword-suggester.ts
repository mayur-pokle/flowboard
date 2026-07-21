// ── Keyword suggester ─────────────────────────────────────────────────
//
// Given the workspace context — brand profile, competitors, published
// content library, existing keyword bank, and the brand's own website
// homepage — produce a prioritized list of P0 / P1 / P2 keywords the
// strategist should target.
//
// Uses Gemini as the primary provider (matches the AEO/GEO Agent's
// setup). Falls back to OpenAI → Anthropic → a deterministic set built
// from brand context tokens if no LLM key is available.

import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

export interface SuggesterInput {
  brand: {
    companyName?: string;
    websiteUrl?: string;
    brandNiche?: string;
    brandAudience?: string;
    productDescription?: string;
    valueProposition?: string;
    primaryCta?: string;
    seedKeywords?: string;
    topicsToAvoid?: string;
  };
  competitors: Array<{ name: string; url: string; tier?: string }>;
  contentLibrary: Array<{ title: string; targetKeyword?: string }>;
  // Existing keywords in the bank — pass so the LLM doesn't re-suggest.
  existingKeywords: string[];
  // Optional home-page HTML text (pre-scraped) that the endpoint
  // fetches. When present, gives the LLM real signals about products,
  // features, and positioning language.
  homepageText?: string;
  desiredCount?: number; // default 25
}

export type KeywordIntent =
  | "informational"
  | "commercial"
  | "transactional"
  | "navigational";

export interface SuggestedKeyword {
  keyword: string;
  priority: "P0" | "P1" | "P2";
  intent: KeywordIntent;
  reason: string;
}

export interface SuggesterResult {
  provider: "gemini" | "openai" | "anthropic" | "deterministic";
  keywords: SuggestedKeyword[];
  warnings: string[];
  usedHomepage: boolean;
}

const SYSTEM_PROMPT = `You are a senior AEO + SEO strategist. A brand has asked you to identify the most important keywords they should target based on their positioning, existing content, competitors, and homepage copy.

# YOUR JOB

Produce a PRIORITIZED keyword list split across P0 / P1 / P2:

- **P0 (must-target)** — 4-8 keywords. Core positioning + head terms + revenue-critical keywords. Every generated topic should try to address these. Include the ICP-defining phrase, the primary product category, and the transactional buying keyword.
- **P1 (nice-to-have)** — 8-14 keywords. Adjacent topics, feature-level terms, refresh candidates, comparison queries the brand should own.
- **P2 (watchlist)** — 4-10 keywords. Emerging terms, community-driven phrasings, competitor-brand terms, and speculative angles.

# RULES

1. **Grounded in the inputs.** Every keyword must trace to the brand context, homepage copy, competitor list, or existing content. Don't invent categories the brand isn't in.
2. **No duplicates against existing keywords.** The strategist already has some entries — do not repeat them (case-insensitive match).
3. **2-6 words per keyword.** Long-tail beats head. Keep phrases specific.
4. **Intent must fit the phrase.**
   - Informational — how-to, what is, best practices, benchmarks.
   - Commercial — comparison, best, vs, alternative.
   - Transactional — pricing, buy, demo, signup, trial.
   - Navigational — brand + product name, category name searches.
5. **Reason ties to a specific signal.** ONE sentence, 40-140 chars, naming: which section of homepage / which competitor / which library title made this the suggestion.
6. **Avoid the "topicsToAvoid" list** if provided.
7. **Balance the mix.** Roughly 25% commercial, 15% transactional, 50% informational, 10% navigational.

# OUTPUT

Return ONE JSON object, no prose, no fences:

{
  "keywords": [
    {
      "keyword": "<2-6 word phrase, lowercase>",
      "priority": "P0" | "P1" | "P2",
      "intent": "informational" | "commercial" | "transactional" | "navigational",
      "reason": "<one sentence naming the source signal>"
    }
  ]
}`;

function buildUserPrompt(input: SuggesterInput): string {
  const count = input.desiredCount || 25;
  const lines: string[] = [];
  lines.push(`Suggest ${count} keywords for this brand.`);
  lines.push("");
  lines.push("# BRAND CONTEXT");
  if (input.brand.companyName) lines.push(`Company: ${input.brand.companyName}`);
  if (input.brand.websiteUrl) lines.push(`Website: ${input.brand.websiteUrl}`);
  if (input.brand.brandNiche) lines.push(`Niche: ${input.brand.brandNiche}`);
  if (input.brand.brandAudience)
    lines.push(`Audience: ${input.brand.brandAudience}`);
  if (input.brand.productDescription)
    lines.push(`Product: ${input.brand.productDescription}`);
  if (input.brand.valueProposition)
    lines.push(`Value prop: ${input.brand.valueProposition}`);
  if (input.brand.primaryCta) lines.push(`Primary CTA: ${input.brand.primaryCta}`);
  if (input.brand.seedKeywords)
    lines.push(`Seed keywords (expand around these): ${input.brand.seedKeywords}`);
  if (input.brand.topicsToAvoid)
    lines.push(`Topics to AVOID: ${input.brand.topicsToAvoid}`);
  lines.push("");

  if (input.homepageText) {
    lines.push("# HOMEPAGE COPY (real signal — extract vocabulary from here)");
    // Trim to keep prompt bounded — 6KB is plenty.
    lines.push(input.homepageText.slice(0, 6000));
    lines.push("");
  }

  if (input.competitors.length > 0) {
    lines.push("# COMPETITORS");
    for (const c of input.competitors.slice(0, 12)) {
      lines.push(`- ${c.name || c.url} — ${c.url}`);
    }
    lines.push("");
  }

  if (input.contentLibrary.length > 0) {
    lines.push("# EXISTING CONTENT LIBRARY (topics already covered)");
    for (const c of input.contentLibrary.slice(0, 40)) {
      const kw = c.targetKeyword ? ` [kw: ${c.targetKeyword}]` : "";
      lines.push(`- ${c.title}${kw}`);
    }
    lines.push("");
  }

  if (input.existingKeywords.length > 0) {
    lines.push("# ALREADY IN THE KEYWORD BANK (do NOT re-suggest)");
    for (const k of input.existingKeywords) lines.push(`- ${k}`);
    lines.push("");
  }

  lines.push("Now output the JSON object per the schema.");
  return lines.join("\n");
}

// ── Homepage fetch + text extraction ──
// Cheap client-side scrape: fetch HTML, strip tags, keep title + meta
// + headings + paragraph text. Bounded so the prompt stays sane.
export async function fetchHomepageText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Flowboard/1.0 KeywordSuggester",
        Accept: "text/html,application/xhtml+xml"
      },
      // Reasonable ceiling so a slow page doesn't hang the endpoint.
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("html")) return null;
    const html = await res.text();
    return extractTextFromHtml(html).slice(0, 12000);
  } catch {
    return null;
  }
}

function extractTextFromHtml(html: string): string {
  // Rough but effective — pull title, meta description, h1-h3, and
  // paragraphs. Keeps the top-of-page text that most represents the
  // brand's positioning.
  const parts: string[] = [];

  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (title) parts.push(`TITLE: ${title.trim()}`);

  const metaDesc = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i
  )?.[1];
  if (metaDesc) parts.push(`META: ${metaDesc.trim()}`);

  const headingRegex = /<(h[1-3])[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = headingRegex.exec(html)) !== null) {
    const text = stripTags(m[2]);
    if (text.length > 4 && text.length < 300) parts.push(`H: ${text}`);
    if (parts.length > 30) break;
  }

  const paraRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let count = 0;
  while ((m = paraRegex.exec(html)) !== null) {
    const text = stripTags(m[1]);
    if (text.length > 30 && text.length < 500) {
      parts.push(`P: ${text}`);
      count += 1;
    }
    if (count > 25) break;
  }

  return parts.join("\n");
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Provider callouts ──

async function callGemini(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  model: string
): Promise<string> {
  const client = new GoogleGenerativeAI(apiKey);
  const m = client.getGenerativeModel({
    model,
    systemInstruction: systemPrompt,
    generationConfig: {
      temperature: 0.75,
      responseMimeType: "application/json"
    }
  });
  const r = await m.generateContent(userPrompt);
  return r.response.text();
}

async function callOpenAI(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  model: string
): Promise<string> {
  const client = new OpenAI({ apiKey });
  const res = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.7,
    response_format: { type: "json_object" }
  });
  return res.choices[0]?.message?.content || "";
}

async function callAnthropic(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  model: string
): Promise<string> {
  const client = new Anthropic({ apiKey });
  const res = await client.messages.create({
    model,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }]
  });
  const part = res.content[0];
  return part.type === "text" ? part.text : "";
}

function parse(
  raw: string,
  existingKeywords: string[]
): SuggestedKeyword[] {
  let text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return [];
  let obj: unknown;
  try {
    obj = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  const arr = (obj as { keywords?: unknown }).keywords;
  if (!Array.isArray(arr)) return [];

  const existingLower = new Set(existingKeywords.map((k) => k.toLowerCase().trim()));
  const seen = new Set<string>();
  const out: SuggestedKeyword[] = [];

  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const kw =
      typeof rec.keyword === "string" ? rec.keyword.trim().toLowerCase() : "";
    if (!kw || kw.length < 3 || kw.length > 80) continue;
    if (kw.split(/\s+/).length > 7) continue;
    if (existingLower.has(kw)) continue;
    if (seen.has(kw)) continue;
    const priority: SuggestedKeyword["priority"] = ["P0", "P1", "P2"].includes(
      rec.priority as string
    )
      ? (rec.priority as SuggestedKeyword["priority"])
      : "P1";
    const intent: KeywordIntent = [
      "informational",
      "commercial",
      "transactional",
      "navigational"
    ].includes(rec.intent as string)
      ? (rec.intent as KeywordIntent)
      : "informational";
    const reason =
      typeof rec.reason === "string" ? rec.reason.trim().slice(0, 200) : "";
    seen.add(kw);
    out.push({ keyword: kw, priority, intent, reason });
  }
  return out;
}

// ── Deterministic fallback ────────────────────────────────────────────
// Runs when no LLM provider is configured. Uses seed keywords + niche
// + audience tokens to produce a small starter set the strategist can
// build from. Not as rich as an LLM-driven pass but honest and free.

function deterministicSuggest(input: SuggesterInput): SuggestedKeyword[] {
  const out: SuggestedKeyword[] = [];
  const existingLower = new Set(
    input.existingKeywords.map((k) => k.toLowerCase().trim())
  );
  const push = (k: SuggestedKeyword) => {
    const kw = k.keyword.toLowerCase().trim();
    if (kw.length < 3) return;
    if (existingLower.has(kw)) return;
    if (out.some((o) => o.keyword === kw)) return;
    out.push({ ...k, keyword: kw });
  };

  const niche = input.brand.brandNiche?.toLowerCase().trim();
  const audience = input.brand.brandAudience?.toLowerCase().trim();
  const seeds = input.brand.seedKeywords
    ? input.brand.seedKeywords.split(/[,;\n]/).map((s) => s.trim().toLowerCase()).filter(Boolean)
    : [];

  // P0 — core positioning
  if (niche) {
    push({
      keyword: niche,
      priority: "P0",
      intent: "commercial",
      reason: `Category head term from brand niche.`
    });
    push({
      keyword: `best ${niche}`,
      priority: "P0",
      intent: "commercial",
      reason: `Comparison head term for the category.`
    });
    push({
      keyword: `${niche} software`,
      priority: "P0",
      intent: "commercial",
      reason: `Tools-oriented variant of the category term.`
    });
  }
  for (const s of seeds.slice(0, 4)) {
    push({
      keyword: s,
      priority: "P0",
      intent: "informational",
      reason: `Explicit seed keyword from Settings.`
    });
  }

  // P1 — audience + adjacent
  if (audience && niche) {
    push({
      keyword: `${niche} for ${audience.split(",")[0].trim()}`,
      priority: "P1",
      intent: "commercial",
      reason: `Category × audience combo.`
    });
    push({
      keyword: `how to choose ${niche}`,
      priority: "P1",
      intent: "informational",
      reason: `Buyer-guide angle for the category.`
    });
  }
  if (niche) {
    push({
      keyword: `${niche} pricing`,
      priority: "P1",
      intent: "transactional",
      reason: `Transactional query for the category.`
    });
    push({
      keyword: `${niche} vs`,
      priority: "P1",
      intent: "commercial",
      reason: `Comparison stub — pair with specific competitor names.`
    });
  }

  // P2 — competitor-brand terms
  for (const c of input.competitors.slice(0, 4)) {
    if (!c.name) continue;
    push({
      keyword: `${c.name.toLowerCase()} alternatives`,
      priority: "P2",
      intent: "commercial",
      reason: `Alternatives page for tracked competitor.`
    });
  }

  return out.slice(0, 20);
}

// ── Public entrypoint ─────────────────────────────────────────────────

export async function suggestKeywords(
  input: SuggesterInput,
  keys: {
    gemini?: string;
    openai?: string;
    anthropic?: string;
    geminiModel?: string;
    openaiModel?: string;
    anthropicModel?: string;
  }
): Promise<SuggesterResult> {
  const warnings: string[] = [];
  const userPrompt = buildUserPrompt(input);
  const usedHomepage = Boolean(input.homepageText && input.homepageText.length > 100);

  if (keys.gemini) {
    try {
      const raw = await callGemini(
        SYSTEM_PROMPT,
        userPrompt,
        keys.gemini,
        keys.geminiModel || "gemini-2.0-flash"
      );
      const kws = parse(raw, input.existingKeywords);
      if (kws.length > 0) {
        return {
          provider: "gemini",
          keywords: kws,
          warnings,
          usedHomepage
        };
      }
      warnings.push("Gemini returned no parseable keywords.");
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
      const kws = parse(raw, input.existingKeywords);
      if (kws.length > 0) {
        return {
          provider: "openai",
          keywords: kws,
          warnings,
          usedHomepage
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
      const kws = parse(raw, input.existingKeywords);
      if (kws.length > 0) {
        return {
          provider: "anthropic",
          keywords: kws,
          warnings,
          usedHomepage
        };
      }
    } catch (err) {
      warnings.push(`Anthropic failed: ${(err as Error).message}`);
    }
  }

  warnings.push(
    "No LLM key configured or all providers failed. Falling back to a deterministic starter set. Add GEMINI_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY for a richer suggestion."
  );
  return {
    provider: "deterministic",
    keywords: deterministicSuggest(input),
    warnings,
    usedHomepage
  };
}
