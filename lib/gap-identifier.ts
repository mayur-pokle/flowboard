// ── Gemini-powered content gap identifier ─────────────────────────────
//
// Calls Gemini with the brand's context + competitors + existing
// content library + any recent low-CTR GSC queries and asks for
// article-level content opportunities — NOT raw search keywords. The
// output is a list of pieces the strategist should consider writing,
// each with a title, target keyword, type, intent, and a one-line
// rationale tied to a real gap.
//
// Uses Gemini specifically (not the auto chain) because the user wants
// Gemini's gap reasoning. If Gemini is unavailable, we fall back to
// the OpenAI / Anthropic chain, then a sample list of opportunities so
// the workflow keeps moving in zero-config mode.

import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { Intent, OpportunityType } from "@/lib/opportunity-classifier";

export interface GapInput {
  brand: {
    companyName?: string;
    brandNiche?: string;
    brandAudience?: string;
    brandVoice?: string;
    valueProposition?: string;
    productDescription?: string;
    primaryCta?: string;
    seedKeywords?: string;
  };
  competitors: Array<{ name: string; url: string; notes?: string }>;
  // Titles + URLs of pieces we've already published. Used to (a) avoid
  // suggesting near-duplicates and (b) help the model spot what
  // adjacent topics we *don't* have.
  existingContent: Array<{ title: string; url: string }>;
  // Low-performing GSC queries — the model can use these as cues for
  // refresh / community opportunities.
  weakQueries?: Array<{ query: string; impressions?: number; position?: number }>;
  desiredCount?: number; // default 10
}

export interface IdentifiedGap {
  title: string; // Article title (this becomes the card headline)
  targetKeyword: string;
  opportunityType: OpportunityType;
  intent: Intent;
  reason: string;
  competitorUrls: string[];
  aiCitationGap: boolean;
  trending: boolean;
}

export interface IdentifyGapsResult {
  gaps: IdentifiedGap[];
  provider: "gemini" | "openai" | "anthropic" | "mock";
  rawText: string;
  warnings: string[];
}

const SYSTEM_PROMPT = `You are a senior content strategist. Your job is to identify the BIGGEST content opportunities for a brand right now — gaps where competitors are already publishing but the brand isn't, or emerging topics the brand should own.

CRITICAL RULES:
1. Output article-level OPPORTUNITIES, not search keywords. Each item is a content piece to commission, with a real headline.
2. Never propose anything that overlaps with what's already in the brand's existing content library.
3. Every gap must tie to a specific signal: a competitor URL, a known weak query, an AI-citation gap, or a topic the brand's positioning uniquely qualifies them to own.
4. Aim for variety across the three opportunity TYPES:
   - "new" — fresh keyword target the brand isn't ranking on
   - "refresh" — an existing piece that needs updating (only if you can name the cannibalizing page)
   - "community" — AI-citation gap or competitor-led conversation
5. Be specific. A title like "AI accountants vs. human bookkeepers: when each one is the right hire in 2026" is good. "AI accountant guide" is bad.

OUTPUT FORMAT — JSON array only, no commentary, no markdown fences:
[
  {
    "title": "<article title, 30-90 chars, sounds like a real piece>",
    "targetKeyword": "<2-5 word primary keyword>",
    "opportunityType": "new" | "refresh" | "community",
    "intent": "informational" | "commercial" | "transactional" | "navigational",
    "reason": "<one sentence, 60-180 chars, naming the specific gap>",
    "competitorUrls": ["<url1>", "<url2>"],
    "aiCitationGap": true | false,
    "trending": true | false
  }
]`;

function buildUserPrompt(input: GapInput): string {
  const count = input.desiredCount || 10;
  const lines: string[] = [];
  lines.push(`Identify ${count} content opportunities for this brand.\n`);
  lines.push("## BRAND CONTEXT");
  if (input.brand.companyName) lines.push(`Company: ${input.brand.companyName}`);
  if (input.brand.brandNiche) lines.push(`Niche: ${input.brand.brandNiche}`);
  if (input.brand.brandAudience)
    lines.push(`Audience: ${input.brand.brandAudience}`);
  if (input.brand.valueProposition)
    lines.push(`Value proposition: ${input.brand.valueProposition}`);
  if (input.brand.productDescription)
    lines.push(`Product: ${input.brand.productDescription}`);
  if (input.brand.brandVoice) lines.push(`Voice: ${input.brand.brandVoice}`);
  if (input.brand.primaryCta) lines.push(`Primary CTA: ${input.brand.primaryCta}`);
  if (input.brand.seedKeywords)
    lines.push(`Seed keywords we care about: ${input.brand.seedKeywords}`);
  lines.push("");

  if (input.competitors.length > 0) {
    lines.push("## COMPETITORS (publishing in this space)");
    for (const c of input.competitors.slice(0, 12)) {
      lines.push(
        `- ${c.name || c.url} — ${c.url}${c.notes ? ` — ${c.notes}` : ""}`
      );
    }
    lines.push("");
  }

  if (input.existingContent.length > 0) {
    lines.push("## EXISTING CONTENT (do NOT re-propose these)");
    for (const c of input.existingContent.slice(0, 40)) {
      lines.push(`- ${c.title} — ${c.url}`);
    }
    lines.push("");
  }

  if (input.weakQueries && input.weakQueries.length > 0) {
    lines.push("## WEAK QUERIES (where we're losing to competitors)");
    for (const q of input.weakQueries.slice(0, 20)) {
      const meta: string[] = [];
      if (q.impressions) meta.push(`${q.impressions.toLocaleString()} imp`);
      if (q.position) meta.push(`pos ${q.position.toFixed(1)}`);
      lines.push(`- "${q.query}"${meta.length ? ` (${meta.join(", ")})` : ""}`);
    }
    lines.push("");
  }

  lines.push(
    "Now output the JSON array. Make every opportunity feel like a real article a strategist could commission today."
  );
  return lines.join("\n");
}

// ── Provider calls ──
async function callGemini(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  model: string
): Promise<string> {
  const client = new GoogleGenerativeAI(apiKey);
  const m = client.getGenerativeModel({
    model,
    systemInstruction: systemPrompt
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
    temperature: 0.7
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

// ── Output parsing ──
function parseGaps(raw: string): IdentifiedGap[] {
  // Strip code fences if the model wrapped output in them
  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  // Find the first [ ... ] block
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1) return [];
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(parsed)) return [];
    const out: IdentifiedGap[] = [];
    for (const g of parsed) {
      if (!g || typeof g !== "object") continue;
      const title = typeof g.title === "string" ? g.title.trim() : "";
      const targetKeyword =
        typeof g.targetKeyword === "string" ? g.targetKeyword.trim() : "";
      if (!title || !targetKeyword) continue;
      const opportunityType = (
        ["new", "refresh", "community"].includes(g.opportunityType)
          ? g.opportunityType
          : "new"
      ) as OpportunityType;
      const intent = (
        ["informational", "commercial", "transactional", "navigational"].includes(
          g.intent
        )
          ? g.intent
          : "informational"
      ) as Intent;
      out.push({
        title,
        targetKeyword,
        opportunityType,
        intent,
        reason:
          typeof g.reason === "string" ? g.reason.trim() : "Content gap.",
        competitorUrls: Array.isArray(g.competitorUrls)
          ? g.competitorUrls.filter((u: unknown) => typeof u === "string")
          : [],
        aiCitationGap: Boolean(g.aiCitationGap),
        trending: Boolean(g.trending)
      });
    }
    return out;
  } catch {
    return [];
  }
}

// ── Mock fallback ──
// Used when every provider is unavailable. Returns a small set of
// believable gap-shaped opportunities tied to the brand context so
// the workflow stays demoable.
function mockGaps(input: GapInput): IdentifiedGap[] {
  const niche = input.brand.brandNiche || "B2B SaaS";
  const audience = input.brand.brandAudience || "founders and operators";
  return [
    {
      title: `The 2026 buyer's guide: ${niche} platforms compared`,
      targetKeyword: `best ${niche.toLowerCase()} platforms`,
      opportunityType: "new",
      intent: "commercial",
      reason: `Competitors own the comparison query — we have no equivalent buyer's guide live yet.`,
      competitorUrls: [],
      aiCitationGap: true,
      trending: false
    },
    {
      title: `What ${audience} ask AI engines about ${niche} — and how to answer first`,
      targetKeyword: `${niche.toLowerCase()} ai answers`,
      opportunityType: "community",
      intent: "informational",
      reason: `Perplexity + ChatGPT are surfacing competitor content for this category. We're absent from the citation set.`,
      competitorUrls: [],
      aiCitationGap: true,
      trending: true
    },
    {
      title: `5 metrics every ${audience.split(",")[0] || "operator"} should track weekly`,
      targetKeyword: `key metrics for ${audience.split(",")[0] || "operators"}`,
      opportunityType: "new",
      intent: "informational",
      reason: `Searchers want a starter framework — we have product context but no aggregated metric guide.`,
      competitorUrls: [],
      aiCitationGap: false,
      trending: false
    }
  ];
}

// ── Public entrypoint ──
export async function identifyGaps(
  input: GapInput,
  keys: {
    gemini?: string;
    openai?: string;
    anthropic?: string;
    geminiModel?: string;
    openaiModel?: string;
    anthropicModel?: string;
  }
): Promise<IdentifyGapsResult> {
  const user = buildUserPrompt(input);
  const warnings: string[] = [];

  // 1. Gemini (preferred per the user's directive)
  if (keys.gemini) {
    try {
      const text = await callGemini(
        SYSTEM_PROMPT,
        user,
        keys.gemini,
        keys.geminiModel || "gemini-2.0-flash"
      );
      const gaps = parseGaps(text);
      if (gaps.length > 0) {
        return { gaps, provider: "gemini", rawText: text, warnings };
      }
      warnings.push("Gemini returned no parseable gaps; trying fallback.");
    } catch (err) {
      warnings.push(`Gemini failed: ${(err as Error).message}`);
    }
  } else {
    warnings.push(
      "Gemini key not set — falling back to other providers. Configure GEMINI_API_KEY in env for the intended experience."
    );
  }

  // 2. OpenAI fallback
  if (keys.openai) {
    try {
      const text = await callOpenAI(
        SYSTEM_PROMPT,
        user,
        keys.openai,
        keys.openaiModel || "gpt-4o-mini"
      );
      const gaps = parseGaps(text);
      if (gaps.length > 0) {
        return { gaps, provider: "openai", rawText: text, warnings };
      }
    } catch (err) {
      warnings.push(`OpenAI failed: ${(err as Error).message}`);
    }
  }

  // 3. Anthropic fallback
  if (keys.anthropic) {
    try {
      const text = await callAnthropic(
        SYSTEM_PROMPT,
        user,
        keys.anthropic,
        keys.anthropicModel || "claude-haiku-4-5"
      );
      const gaps = parseGaps(text);
      if (gaps.length > 0) {
        return { gaps, provider: "anthropic", rawText: text, warnings };
      }
    } catch (err) {
      warnings.push(`Anthropic failed: ${(err as Error).message}`);
    }
  }

  // 4. Mock fallback — always returns something so UX works
  warnings.push(
    "No provider produced gaps. Returning a small mock set so the workflow stays demoable. Set GEMINI_API_KEY (or OpenAI / Anthropic) for real gap identification."
  );
  return {
    gaps: mockGaps(input),
    provider: "mock",
    rawText: "",
    warnings
  };
}
