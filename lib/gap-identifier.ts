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

const SYSTEM_PROMPT = `You are a senior AEO (Answer Engine Optimization) and SEO content strategist. Your single job: identify content gaps where the brand can win citations from AI engines (Perplexity, ChatGPT, Google AI Overviews) AND high search rankings. You think in articles, not keywords.

# THE BAR YOU MUST CLEAR

Every opportunity you return must satisfy ALL of these checks. If any fails, drop it.

1. **TIED TO A REAL SIGNAL.** Each gap must trace to ONE of:
   - A competitor URL provided in the input (name the URL in competitorUrls)
   - A weak query the brand is ranking poorly on (provided in input)
   - A clear emerging topic the brand's positioning uniquely qualifies them for

2. **CITATION-WORTHY SHAPE.** The article must be the kind AI engines extract from. That means:
   - Question-shaped headlines or direct-comparison headlines (e.g. "What is X?", "X vs. Y: …", "Best X for Y")
   - Heading structure that maps to common sub-questions (so the answer engine can grab a chunk)
   - Suitable for a comparison table, FAQ block, or quantified-claim density — say so in the reason

3. **NO OVERLAP.** Compare against the existing content library. If anything in that list addresses the same intent, do NOT propose it. Look at the exact phrasing of existing titles before deciding.

4. **HEADLINES READ LIKE REAL PIECES.** A real strategist would commission it tomorrow.
   - GOOD: "AI accountants vs. human bookkeepers: when each one is the right hire in 2026"
   - GOOD: "What is runway? The 4-step calculation and 2026 benchmarks"
   - BAD: "AI accountant guide"
   - BAD: "Everything you need to know about runway"
   - BAD anything with "complete guide" or "ultimate"

5. **KEYWORD IS DISTINCT FROM TITLE.** \`targetKeyword\` is the 2-5 word SEO phrase (e.g. "ai accountant vs human"). \`title\` is the article headline. They are NEVER identical.

6. **VARIETY ACROSS TYPES.** Aim for a balanced mix:
   - "new" — net-new keyword target. Use this when the brand has nothing in the space.
   - "refresh" — only when you can name a specific existing-library URL it should update. Otherwise use "new".
   - "community" — AI citation gap, competitor-led conversation, or social/forum-driven question. Set aiCitationGap=true.

7. **PRIORITIZE AI-CITATION GAPS.** At LEAST half the gaps should set \`aiCitationGap: true\`. These are the opportunities where competitors are getting cited in chat answers but the brand isn't. The reason field must name WHY (question shape, comparison density, AI-extractable structure).

# REASONING FORMAT

For each opportunity, the \`reason\` field must:
- Be ONE sentence, 60-200 characters.
- Name the SPECIFIC signal: which competitor URL, which weak query, or which structural property makes this citation-worthy.
- Be concrete. "Big opportunity" is banned. "Competitor X owns the comparison query but the brand has no equivalent piece; structure invites table extraction by AI engines" is great.

# OUTPUT FORMAT

A JSON array ONLY. No markdown fences. No prose before or after.

[
  {
    "title": "<article headline, 30-100 chars>",
    "targetKeyword": "<2-5 word SEO phrase, lowercase, NOT identical to title>",
    "opportunityType": "new" | "refresh" | "community",
    "intent": "informational" | "commercial" | "transactional" | "navigational",
    "reason": "<one sentence naming the signal>",
    "competitorUrls": ["<url1>", "<url2>"],
    "aiCitationGap": true | false,
    "trending": true | false
  }
]

# SELF-CHECK BEFORE EMITTING

For every item ask yourself:
- Is this article distinct from every title in the existing library?
- Does the reason name a specific signal (URL, query, or structural reason)?
- Is the title different from the targetKeyword?
- Would Perplexity quote a paragraph from this piece if it existed?
- Could a writer start tomorrow on this title without any further input?

If any answer is no, drop the item and replace it.`;

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
    systemInstruction: systemPrompt,
    generationConfig: {
      temperature: 0.85,
      // JSON only — strict shape per the system prompt.
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
  let text = raw.trim();
  // Strip fences in case the model ignored the format instruction.
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: IdentifiedGap[] = [];
  for (const g of parsed) {
    if (!g || typeof g !== "object") continue;
    const obj = g as Record<string, unknown>;
    const title = typeof obj.title === "string" ? obj.title.trim() : "";
    const targetKeyword =
      typeof obj.targetKeyword === "string" ? obj.targetKeyword.trim() : "";
    const reason =
      typeof obj.reason === "string" ? obj.reason.trim() : "";

    // Quality gates — drop anything that doesn't clear the bar set
    // by the system prompt rather than silently lowering standards.
    if (!title || !targetKeyword || !reason) continue;
    if (title.length < 20 || title.length > 140) continue;
    if (targetKeyword.split(/\s+/).length > 8) continue;
    // Title and keyword must differ — that's the whole point of
    // article-level opportunities vs. keywords.
    if (title.toLowerCase() === targetKeyword.toLowerCase()) continue;
    // Reason has to be substantive, not a placeholder.
    if (reason.length < 30) continue;
    if (/^(big|huge|major|content)\s+(gap|opportunity)\.?$/i.test(reason))
      continue;
    // Banned filler phrases that signal a low-effort headline.
    if (/(complete|ultimate)\s+guide/i.test(title)) continue;
    if (/^everything you need to know/i.test(title)) continue;

    const opportunityType: OpportunityType = (
      ["new", "refresh", "community"].includes(obj.opportunityType as string)
        ? (obj.opportunityType as OpportunityType)
        : "new"
    );
    const intent: Intent = (
      ["informational", "commercial", "transactional", "navigational"].includes(
        obj.intent as string
      )
        ? (obj.intent as Intent)
        : "informational"
    );

    out.push({
      title,
      targetKeyword: targetKeyword.toLowerCase(),
      opportunityType,
      intent,
      reason,
      competitorUrls: Array.isArray(obj.competitorUrls)
        ? (obj.competitorUrls as unknown[]).filter(
            (u): u is string => typeof u === "string" && u.startsWith("http")
          )
        : [],
      aiCitationGap: Boolean(obj.aiCitationGap),
      trending: Boolean(obj.trending)
    });
  }

  // Deduplicate within the same response — same keyword OR same title.
  const seen = new Set<string>();
  return out.filter((g) => {
    const k = g.title.toLowerCase().trim();
    const tk = g.targetKeyword.toLowerCase().trim();
    if (seen.has(k) || seen.has(tk)) return false;
    seen.add(k);
    seen.add(tk);
    return true;
  });
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
