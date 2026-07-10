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
import {
  PLAYBOOKS,
  playbookQuotas,
  checkCoverage,
  renderPlaybookMenuForPrompt,
  type PlaybookId
} from "@/lib/growth-playbooks";

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
  // Which playbook produced this idea. Drives brief + content
  // generation downstream so we produce the right SHAPE, not just any
  // article. Optional at the type level for backwards-compat but the
  // parser enforces presence.
  playbook?: PlaybookId;
}

export interface IdentifyGapsResult {
  gaps: IdentifiedGap[];
  provider: "gemini" | "openai" | "anthropic" | "mock";
  rawText: string;
  warnings: string[];
}

// The system prompt is built per-call so the playbook menu can reflect
// the requested count's quotas. See buildSystemPrompt below.
function buildSystemPrompt(desiredCount: number, retryDeficit?: string): string {
  return `You are a senior growth-team strategist. You combine AEO/GEO (Answer Engine Optimization), traditional SEO, content strategy, engineering-as-marketing, competitor analysis, and community-driven content into a SINGLE mix of opportunities.

Your job: produce a DIVERSE portfolio of content opportunities — not just articles. A comparison page counts. A calculator counts. A lead magnet counts. A refresh of an existing page counts. The mix is the point.

${renderPlaybookMenuForPrompt(desiredCount)}

# THE BAR YOU MUST CLEAR

Every opportunity you return must satisfy ALL of these:

1. **TIED TO A REAL SIGNAL.** Each item must trace to one of:
   - A competitor URL provided in the input
   - A weak query the brand is ranking poorly on
   - An AI-citation gap (chat engines cite competitors, not the brand)
   - A specific missing shape (no calculator, no lead magnet, no vs page)
   - An emerging topic the brand's positioning uniquely qualifies them for

2. **PLAYBOOK-FITTING.** Every item MUST include a \`playbook\` field naming which playbook from the menu above it belongs to. The item's title, keyword, and structure must fit that playbook's shape.

3. **NO OVERLAP WITH EXISTING LIBRARY.** Compare against the existing content library. If anything already covers the same intent, either propose a REFRESH of that URL (playbook: refresh) or drop the item — don't produce near-duplicates.

4. **HEADLINES READ LIKE REAL PIECES.** A strategist would commission it tomorrow.
   - GOOD: "AI accountants vs. human bookkeepers: when each is the right hire in 2026"
   - GOOD: "What is runway? The 4-step calculation and 2026 benchmarks"
   - GOOD: "SaaS runway calculator — input revenue + burn → get months"
   - BAD: "AI accountant guide"
   - BAD anything with "complete guide", "ultimate", "everything you need to know"

5. **KEYWORD ≠ TITLE.** \`targetKeyword\` is the 2-5 word SEO phrase. \`title\` is the headline. They are NEVER identical.

6. **AI CITATION PRIORITY.** At least half of items should set \`aiCitationGap: true\`. Every aeo-answer + community-answer item must set it.

7. **REFRESH ITEMS ARE NOT OPTIONAL.** If the input's existing content library has ≥ 3 rows, at least one refresh item is expected. Name the specific URL being refreshed in the reason.

# QUOTAS (hard requirement)

Your output MUST hit the minimum item count for each playbook shown in the menu. The parser rejects responses that skew too far into one playbook — you'll be re-asked.

${
  retryDeficit
    ? `\n**⚠️ RETRY: the previous attempt was short on: ${retryDeficit}. Fix the mix.**\n`
    : ""
}

# REASONING FORMAT

The \`reason\` field must:
- Be ONE sentence, 60-200 characters.
- Name the SPECIFIC signal (URL, weak query, structural absence).
- Be concrete. "Big opportunity" is banned.

# OUTPUT FORMAT — JSON array only, no markdown fences, no prose:

[
  {
    "title": "<headline, 30-100 chars>",
    "targetKeyword": "<2-5 word SEO phrase, lowercase, ≠ title>",
    "playbook": "pillar-guide" | "aeo-answer" | "comparison-vs" | "programmatic-seo" | "free-tool" | "lead-magnet" | "refresh" | "community-answer",
    "opportunityType": "new" | "refresh" | "community",
    "intent": "informational" | "commercial" | "transactional" | "navigational",
    "reason": "<one sentence naming the signal>",
    "competitorUrls": ["<url1>", ...],
    "aiCitationGap": true | false,
    "trending": true | false
  }
]

# SELF-CHECK BEFORE EMITTING

For each item:
- Does the title + shape actually fit the declared \`playbook\`?
- Is the item distinct from every existing library title?
- Does the reason name a specific signal?
- Is the title different from the targetKeyword?

For the array as a whole:
- Do you hit every playbook's minimum quota?
- Is there variety? Not all pillar-guides, not all comparisons.

If any check fails, revise before emitting.`;
}

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

    // Playbook — retain if declared and valid, otherwise skip (the
    // downstream detectPlaybook helper can still infer at brief-gen
    // time for legacy responses).
    const declaredPlaybook =
      typeof obj.playbook === "string" ? (obj.playbook as string) : "";
    const playbook = (Object.keys(PLAYBOOKS) as string[]).includes(
      declaredPlaybook
    )
      ? (declaredPlaybook as PlaybookId)
      : undefined;

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
      trending: Boolean(obj.trending),
      playbook
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
  const shortAudience = audience.split(",")[0] || "operators";
  // Sample gaps span the playbook menu so the mock experience shows
  // the diversity the real generator would produce.
  return [
    {
      title: `${niche} in 2026: the operator's playbook`,
      targetKeyword: `${niche.toLowerCase()} playbook`,
      opportunityType: "new",
      intent: "informational",
      reason: `No pillar article exists in the library — this anchors the content cluster and hosts spoke links.`,
      competitorUrls: [],
      aiCitationGap: false,
      trending: false,
      playbook: "pillar-guide"
    },
    {
      title: `What is runway? The 4-step calculation and 2026 benchmarks`,
      targetKeyword: `what is runway`,
      opportunityType: "new",
      intent: "informational",
      reason: `Perplexity + ChatGPT cite competitors for this exact prompt — the brand is absent.`,
      competitorUrls: [],
      aiCitationGap: true,
      trending: true,
      playbook: "aeo-answer"
    },
    {
      title: `Top ${niche} tools compared for ${shortAudience} in 2026`,
      targetKeyword: `best ${niche.toLowerCase()} tools`,
      opportunityType: "new",
      intent: "commercial",
      reason: `Competitors own the comparison query — no equivalent buyer's guide in library.`,
      competitorUrls: [],
      aiCitationGap: true,
      trending: false,
      playbook: "comparison-vs"
    },
    {
      title: `Cash flow health check — paste your P&L, get a red/yellow/green score`,
      targetKeyword: `cash flow health check`,
      opportunityType: "new",
      intent: "transactional",
      reason: `Engineering-as-marketing angle — no free tool exists in this category on our site.`,
      competitorUrls: [],
      aiCitationGap: false,
      trending: false,
      playbook: "free-tool"
    },
    {
      title: `The 2026 SaaS finance close checklist (free Notion template)`,
      targetKeyword: `saas finance close checklist`,
      opportunityType: "new",
      intent: "informational",
      reason: `Practitioners want a portable checklist — high email-gate conversion opportunity.`,
      competitorUrls: [],
      aiCitationGap: false,
      trending: false,
      playbook: "lead-magnet"
    },
    {
      title: `How founders on r/startups actually handle a first-time audit`,
      targetKeyword: `first time audit founders`,
      opportunityType: "community",
      intent: "informational",
      reason: `Recurring community question — AI engines cite generic docs, not practitioner voice.`,
      competitorUrls: [],
      aiCitationGap: true,
      trending: false,
      playbook: "community-answer"
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
  const count = input.desiredCount || 10;

  // Attempts an LLM call, parses the response, checks playbook
  // coverage. If the mix is too skewed, retries ONCE with a targeted
  // "you were short on X" hint appended to the system prompt.
  async function attempt(
    call: (systemPrompt: string) => Promise<string>,
    provider: "gemini" | "openai" | "anthropic"
  ): Promise<{ gaps: IdentifiedGap[]; raw: string } | null> {
    // Pass 1
    let systemPrompt = buildSystemPrompt(count);
    let raw = await call(systemPrompt);
    let gaps = parseGaps(raw);
    if (gaps.length === 0) return null;

    // Coverage check — retry once if we're short on any playbook.
    const coverage = checkCoverage(gaps, count);
    if (!coverage.ok) {
      warnings.push(
        `${provider} pass 1 short on: ${coverage.summary}. Retrying.`
      );
      systemPrompt = buildSystemPrompt(count, coverage.summary);
      try {
        const raw2 = await call(systemPrompt);
        const gaps2 = parseGaps(raw2);
        // Merge: keep pass-1 items, ADD pass-2 items that fill deficits,
        // dedupe.
        if (gaps2.length > 0) {
          const seen = new Set(
            gaps.map((g) => g.title.toLowerCase().trim())
          );
          const deficitIds = new Set(coverage.deficits.map((d) => d.playbook));
          for (const g of gaps2) {
            if (seen.has(g.title.toLowerCase().trim())) continue;
            // Only merge items that hit a deficit playbook — don't
            // pile on additional items outside the shortfall.
            if (g.playbook && deficitIds.has(g.playbook)) {
              gaps.push(g);
              seen.add(g.title.toLowerCase().trim());
            }
          }
          raw = raw + "\n\n--- retry ---\n\n" + raw2;
        }
      } catch (err) {
        warnings.push(
          `${provider} retry pass failed: ${(err as Error).message}`
        );
      }
    }
    return { gaps, raw };
  }

  // 1. Gemini (preferred per the user's directive)
  if (keys.gemini) {
    try {
      const res = await attempt(
        (sys) =>
          callGemini(
            sys,
            user,
            keys.gemini!,
            keys.geminiModel || "gemini-2.0-flash"
          ),
        "gemini"
      );
      if (res && res.gaps.length > 0) {
        return {
          gaps: res.gaps,
          provider: "gemini",
          rawText: res.raw,
          warnings
        };
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
      const res = await attempt(
        (sys) =>
          callOpenAI(
            sys,
            user,
            keys.openai!,
            keys.openaiModel || "gpt-4o-mini"
          ),
        "openai"
      );
      if (res && res.gaps.length > 0) {
        return {
          gaps: res.gaps,
          provider: "openai",
          rawText: res.raw,
          warnings
        };
      }
    } catch (err) {
      warnings.push(`OpenAI failed: ${(err as Error).message}`);
    }
  }

  // 3. Anthropic fallback
  if (keys.anthropic) {
    try {
      const res = await attempt(
        (sys) =>
          callAnthropic(
            sys,
            user,
            keys.anthropic!,
            keys.anthropicModel || "claude-haiku-4-5"
          ),
        "anthropic"
      );
      if (res && res.gaps.length > 0) {
        return {
          gaps: res.gaps,
          provider: "anthropic",
          rawText: res.raw,
          warnings
        };
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
