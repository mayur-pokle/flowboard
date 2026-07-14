// ── Topic Analyzer — optional Gemini enrichment ──────────────────────
//
// Runs on demand from the Analyze tab's "Enrich with Gemini" action.
// The deterministic analyzer already produced the playbook, brief, and
// score. The enricher adds three things that benefit from an LLM:
//
//   1. Alternate headline variants (5-7 sharper alternatives)
//   2. Competitor coverage summary — what published competitor pages
//      actually cover for this keyword + what they miss
//   3. Community-signal read — what specific questions / phrasings
//      users ask AI engines around this topic
//
// Falls back through Gemini → OpenAI → Anthropic. Skips entirely if
// no key is set (the panel shows a "Configure an LLM key to enrich"
// hint instead of a broken button).

import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { AnalysisResult } from "@/lib/topic-analyzer";

export interface ArticleLink {
  title: string;
  url: string;
  publisher?: string; // e.g. "example-competitor.com"
}

export interface EnrichmentResult {
  provider: "gemini" | "openai" | "anthropic" | "unavailable";
  alternateHeadlines: string[];
  competitorSummary: string;
  competitorGaps: string[];
  // Up to 8 real article URLs the LLM knows cover this topic. Flagged
  // as "AI-suggested" in the UI so the strategist verifies before
  // taking action — LLMs can hallucinate URLs, so treat these as
  // starting-point references, not confirmed sources.
  articleLinks: ArticleLink[];
  communityAngles: string[];
  aiCitationInsights: string[];
  warnings: string[];
  generatedAt: string;
}

const SYSTEM_PROMPT = `You are a senior AEO + SEO + content strategist. A strategist has submitted a candidate topic for their brand and has ALREADY received a deterministic analysis (playbook, score, brief). Your job is to add enrichments an LLM can meaningfully improve on:

1. **Alternate headlines** — 5 sharper variants of the submitted title. Each variant should differ in angle (question shape, comparison shape, worked-example shape, benchmark shape, direct-answer shape). Avoid "complete/ultimate guide" and "everything you need to know".

2. **Competitor coverage read** — for the provided competitor domains, give a ONE-PARAGRAPH summary of what they likely cover for this keyword based on domain expertise, and a bulleted list of GAPS — angles they miss where the brand can win.

3. **Article links** — up to 8 REAL published articles from actual competitors, industry publications, or authoritative sources that cover this topic. Rules:
   - Only include URLs you are HIGHLY confident actually exist and match the topic. If you're uncertain, omit — do not fabricate.
   - Prefer the provided competitor domains when their coverage exists in your knowledge.
   - Use exact article titles (not descriptions).
   - Include the publisher domain (e.g. "example.com") for each entry.
   - If you don't know 8 real ones, return fewer. Empty array is acceptable — do not pad.

4. **Community + AI-engine signal** — 3-5 specific ways people ask this question in community channels (Reddit, subreddits, Slack groups) or as prompts to ChatGPT / Perplexity. Reflect actual language, not corporate phrasing.

5. **AI citation insights** — 3-5 concrete structural / factual choices that make this article likely to be cited by AI engines for this query.

Return a strict JSON object with exactly these fields (no prose, no markdown fences):

{
  "alternateHeadlines": string[],
  "competitorSummary": string,
  "competitorGaps": string[],
  "articleLinks": [
    { "title": string, "url": string, "publisher": string }
  ],
  "communityAngles": string[],
  "aiCitationInsights": string[]
}`;

function buildUserPrompt(
  analysis: AnalysisResult,
  brand: {
    companyName?: string;
    brandNiche?: string;
    brandAudience?: string;
  },
  competitors: Array<{ name: string; url: string }>,
  notes?: string
): string {
  const lines: string[] = [];
  lines.push("# The topic under analysis");
  lines.push(`Title: ${analysis.title}`);
  lines.push(`Target keyword: ${analysis.targetKeyword}`);
  lines.push(`Detected intent: ${analysis.intent}`);
  lines.push(
    `Detected playbook: ${analysis.playbookLabel} (${analysis.playbook})`
  );
  lines.push(
    `Priority tier: ${analysis.priorityTier.label} · score ${analysis.score.toFixed(1)}/100`
  );
  if (analysis.aiCitationGap) {
    lines.push(
      "The deterministic analyzer flagged this as citation-worthy for AI engines."
    );
  }
  if (notes) {
    lines.push("");
    lines.push(`Strategist notes: ${notes}`);
  }
  lines.push("");

  lines.push("# Brand context");
  if (brand.companyName) lines.push(`Company: ${brand.companyName}`);
  if (brand.brandNiche) lines.push(`Niche: ${brand.brandNiche}`);
  if (brand.brandAudience) lines.push(`Audience: ${brand.brandAudience}`);
  lines.push("");

  if (competitors.length > 0) {
    lines.push("# Competitors tracked");
    for (const c of competitors) lines.push(`- ${c.name || c.url} — ${c.url}`);
    lines.push("");
  }

  if (analysis.cannibalization.matches.length > 0) {
    lines.push("# Existing pages that may overlap");
    for (const m of analysis.cannibalization.matches) {
      lines.push(`- [${m.severity}] ${m.title} (${m.url}) — ${m.reason}`);
    }
    lines.push("");
  }

  lines.push(
    "Now produce the enrichment JSON object per the schema in the system prompt."
  );

  return lines.join("\n");
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
    max_tokens: 3000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }]
  });
  const part = res.content[0];
  return part.type === "text" ? part.text : "";
}

function parse(raw: string): Omit<EnrichmentResult, "provider" | "warnings" | "generatedAt"> | null {
  let text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    return {
      alternateHeadlines: Array.isArray(obj.alternateHeadlines)
        ? (obj.alternateHeadlines as unknown[])
            .filter((s): s is string => typeof s === "string")
            .slice(0, 7)
        : [],
      competitorSummary:
        typeof obj.competitorSummary === "string"
          ? obj.competitorSummary
          : "",
      competitorGaps: Array.isArray(obj.competitorGaps)
        ? (obj.competitorGaps as unknown[])
            .filter((s): s is string => typeof s === "string")
            .slice(0, 7)
        : [],
      articleLinks: Array.isArray(obj.articleLinks)
        ? (obj.articleLinks as unknown[])
            .map((item): ArticleLink | null => {
              if (!item || typeof item !== "object") return null;
              const rec = item as Record<string, unknown>;
              const title =
                typeof rec.title === "string" ? rec.title.trim() : "";
              const url =
                typeof rec.url === "string" ? rec.url.trim() : "";
              if (!title || !url) return null;
              // Cheap URL validation — drop anything that isn't http(s).
              try {
                const u = new URL(url);
                if (u.protocol !== "http:" && u.protocol !== "https:")
                  return null;
              } catch {
                return null;
              }
              const out: ArticleLink = { title, url };
              if (
                typeof rec.publisher === "string" &&
                rec.publisher.trim().length > 0
              ) {
                out.publisher = rec.publisher.trim();
              }
              return out;
            })
            .filter((x): x is ArticleLink => x !== null)
            .slice(0, 8)
        : [],
      communityAngles: Array.isArray(obj.communityAngles)
        ? (obj.communityAngles as unknown[])
            .filter((s): s is string => typeof s === "string")
            .slice(0, 7)
        : [],
      aiCitationInsights: Array.isArray(obj.aiCitationInsights)
        ? (obj.aiCitationInsights as unknown[])
            .filter((s): s is string => typeof s === "string")
            .slice(0, 7)
        : []
    };
  } catch {
    return null;
  }
}

// ── Public entrypoint ────────────────────────────────────────────────

export async function enrichTopic(
  input: {
    analysis: AnalysisResult;
    brand: {
      companyName?: string;
      brandNiche?: string;
      brandAudience?: string;
    };
    competitors: Array<{ name: string; url: string }>;
    notes?: string;
  },
  keys: {
    gemini?: string;
    openai?: string;
    anthropic?: string;
    geminiModel?: string;
    openaiModel?: string;
    anthropicModel?: string;
  }
): Promise<EnrichmentResult> {
  const user = buildUserPrompt(
    input.analysis,
    input.brand,
    input.competitors,
    input.notes
  );
  const warnings: string[] = [];

  // Prefer Gemini for consistency with the identifier + generateTopics
  // paths — the user set up their AEO story around Gemini.
  if (keys.gemini) {
    try {
      const raw = await callGemini(
        SYSTEM_PROMPT,
        user,
        keys.gemini,
        keys.geminiModel || "gemini-2.0-flash"
      );
      const parsed = parse(raw);
      if (parsed) {
        return {
          provider: "gemini",
          warnings,
          generatedAt: new Date().toISOString(),
          ...parsed
        };
      }
      warnings.push("Gemini returned no parseable enrichment; trying fallback.");
    } catch (err) {
      warnings.push(`Gemini failed: ${(err as Error).message}`);
    }
  }

  if (keys.openai) {
    try {
      const raw = await callOpenAI(
        SYSTEM_PROMPT,
        user,
        keys.openai,
        keys.openaiModel || "gpt-4o-mini"
      );
      const parsed = parse(raw);
      if (parsed) {
        return {
          provider: "openai",
          warnings,
          generatedAt: new Date().toISOString(),
          ...parsed
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
        user,
        keys.anthropic,
        keys.anthropicModel || "claude-haiku-4-5"
      );
      const parsed = parse(raw);
      if (parsed) {
        return {
          provider: "anthropic",
          warnings,
          generatedAt: new Date().toISOString(),
          ...parsed
        };
      }
    } catch (err) {
      warnings.push(`Anthropic failed: ${(err as Error).message}`);
    }
  }

  // No providers configured / all failed — return a graceful "unavailable"
  // so the UI can show a clear message instead of an empty section.
  warnings.push(
    "No LLM provider available. Set GEMINI_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY in env to enable enrichment."
  );
  return {
    provider: "unavailable",
    alternateHeadlines: [],
    competitorSummary: "",
    competitorGaps: [],
    articleLinks: [],
    communityAngles: [],
    aiCitationInsights: [],
    warnings,
    generatedAt: new Date().toISOString()
  };
}
