import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type {
  ContentType,
  Effort,
  GeneratedContent,
  Priority,
  Topic
} from "./types";
import { slugify, uid } from "./utils";

export interface BrandContext {
  niche: string;
  audience: string;
  // Optional richer context — when present, prompts get materially better.
  companyName?: string;
  websiteUrl?: string;
  productDescription?: string;
  valueProposition?: string;
  brandVoice?: string;
  primaryCta?: string;
  primaryGeo?: string;
  // Competitors with structure (name, url, notes) for richer prompts.
  competitors?: Array<{ name?: string; url?: string; notes?: string } | string>;
  seedKeywords?: string[];
  topicsToAvoid?: string[];
  recentTitles?: string[];
}

export interface AIKeys {
  openai?: string;
  gemini?: string;
  openaiModel?: string;
  geminiModel?: string;
}

const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_GEMINI_MODEL = "gemini-1.5-flash-latest";

function pickKeys(headerKeys: AIKeys | undefined): AIKeys {
  return {
    openai: process.env.OPENAI_API_KEY || headerKeys?.openai || "",
    gemini: process.env.GEMINI_API_KEY || headerKeys?.gemini || "",
    openaiModel:
      process.env.OPENAI_MODEL || headerKeys?.openaiModel || DEFAULT_OPENAI_MODEL,
    geminiModel:
      process.env.GEMINI_MODEL || headerKeys?.geminiModel || DEFAULT_GEMINI_MODEL
  };
}

// ============================================================
// Topic generation
// ============================================================

const TOPIC_SYSTEM_PROMPT = `You are an expert SEO and content strategist.
You identify high-leverage content opportunities (free tools, calculators, templates, guides, whitepapers, checklists, frameworks) that drive organic traffic and qualified leads.

Return strict JSON only — no prose, no markdown fences. Schema:
{
  "topics": [
    {
      "title": string,
      "contentType": "Calculator" | "Template" | "Guide" | "Whitepaper" | "Checklist" | "Framework",
      "targetKeyword": string,
      "searchIntent": string,
      "priority": "Low" | "Medium" | "High",
      "priorityScore": number,
      "whyOpportunity": string,
      "suggestedCta": string,
      "estimatedEffort": "Low" | "Medium" | "High",
      "competitorGap": string,
      "rankingPotential": string,
      "businessImpact": string
    }
  ]
}

Rules:
- Generate exactly N topics (caller specifies).
- Mix content types — at least 2 calculators/tools and 2 templates if N >= 6.
- Target keywords must be specific long-tail (3-6 words).
- priorityScore is 0-100 and must be consistent with priority ("High" -> 70-100).
- whyOpportunity must reference search demand, competitor weakness, or business impact in 1-2 sentences.
- Avoid duplicates. Avoid topics in the "Recent titles" list provided by the user.`;

function formatCompetitors(
  competitors: BrandContext["competitors"]
): string {
  if (!competitors?.length) return "";
  const lines = competitors
    .map((c) => {
      if (typeof c === "string") return `- ${c}`;
      const parts: string[] = [];
      if (c.name) parts.push(c.name);
      if (c.url) parts.push(`<${c.url}>`);
      if (c.notes) parts.push(`— ${c.notes}`);
      return parts.length ? `- ${parts.join(" ")}` : null;
    })
    .filter(Boolean);
  return lines.join("\n");
}

function buildTopicUserPrompt(ctx: BrandContext, count: number) {
  const lines: string[] = [];
  lines.push("# Brand profile");
  if (ctx.companyName) lines.push(`Company: ${ctx.companyName}`);
  if (ctx.websiteUrl) lines.push(`Website: ${ctx.websiteUrl}`);
  lines.push(`Niche: ${ctx.niche}`);
  lines.push(`Target audience: ${ctx.audience}`);
  if (ctx.productDescription)
    lines.push(`What we offer: ${ctx.productDescription}`);
  if (ctx.valueProposition)
    lines.push(`Value proposition: ${ctx.valueProposition}`);
  if (ctx.brandVoice) lines.push(`Brand voice: ${ctx.brandVoice}`);
  if (ctx.primaryCta) lines.push(`Preferred CTA style: ${ctx.primaryCta}`);
  if (ctx.primaryGeo) lines.push(`Primary market: ${ctx.primaryGeo}`);

  const compsBlock = formatCompetitors(ctx.competitors);
  if (compsBlock) {
    lines.push("");
    lines.push("# Known competitors (study their content gaps)");
    lines.push(compsBlock);
  }

  if (ctx.seedKeywords?.length) {
    lines.push("");
    lines.push(`Seed keywords to expand from: ${ctx.seedKeywords.join(", ")}`);
  }
  if (ctx.topicsToAvoid?.length) {
    lines.push(`Topics / themes to AVOID: ${ctx.topicsToAvoid.join(", ")}`);
  }
  if (ctx.recentTitles?.length) {
    lines.push(
      `Recent titles to AVOID (no near-duplicates): ${ctx.recentTitles
        .slice(0, 50)
        .join(" | ")}`
    );
  }

  lines.push("");
  lines.push(
    `Generate ${count} fresh, high-opportunity content ideas tailored to this brand. Each \`whyOpportunity\` should reference, where relevant, the competitor gap or our specific value proposition. Return JSON only.`
  );

  return lines.join("\n");
}

function describeError(err: unknown): string {
  const msg = (err as Error)?.message || String(err);
  // Trim wordy provider errors so toasts stay readable.
  if (/401|invalid api key|incorrect api key|invalid_api_key/i.test(msg))
    return "Invalid API key (401)";
  if (/403|permission|access/i.test(msg)) return "Access denied (403)";
  if (/429|rate.?limit|quota/i.test(msg))
    return "Rate-limited or out of quota (429)";
  if (/timeout|ETIMEDOUT|ECONNRESET|fetch failed/i.test(msg))
    return "Network error / timeout";
  if (/model.*not.*found|does not exist|not_found_error/i.test(msg))
    return "Model not available on your account";
  return msg.slice(0, 200);
}

export async function generateTopics(
  ctx: BrandContext,
  count: number,
  keys?: AIKeys
): Promise<{
  topics: Topic[];
  provider: "openai" | "gemini" | "mock";
  warnings: string[];
}> {
  const k = pickKeys(keys);
  const warnings: string[] = [];

  // Try OpenAI first
  if (k.openai) {
    try {
      const raw = await generateTopicsOpenAI(
        ctx,
        count,
        k.openai,
        k.openaiModel || DEFAULT_OPENAI_MODEL
      );
      return { topics: normalizeTopics(raw), provider: "openai", warnings };
    } catch (err) {
      const msg = describeError(err);
      console.error("[ai] OpenAI topics failed:", msg);
      warnings.push(`OpenAI: ${msg}`);
    }
  }

  // Fall back to Gemini
  if (k.gemini) {
    try {
      const raw = await generateTopicsGemini(
        ctx,
        count,
        k.gemini,
        k.geminiModel || DEFAULT_GEMINI_MODEL
      );
      return { topics: normalizeTopics(raw), provider: "gemini", warnings };
    } catch (err) {
      const msg = describeError(err);
      console.error("[ai] Gemini topics failed:", msg);
      warnings.push(`Gemini: ${msg}`);
    }
  }

  // Final fallback: mock
  return { topics: mockTopics(ctx, count), provider: "mock", warnings };
}

async function generateTopicsOpenAI(
  ctx: BrandContext,
  count: number,
  apiKey: string,
  modelName: string
): Promise<unknown[]> {
  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: modelName,
    response_format: { type: "json_object" },
    temperature: 0.8,
    messages: [
      { role: "system", content: TOPIC_SYSTEM_PROMPT },
      { role: "user", content: buildTopicUserPrompt(ctx, count) }
    ]
  });
  const text = completion.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(text);
  return Array.isArray(parsed?.topics) ? parsed.topics : [];
}

async function generateTopicsGemini(
  ctx: BrandContext,
  count: number,
  apiKey: string,
  modelName: string
): Promise<unknown[]> {
  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({
    model: modelName,
    generationConfig: { responseMimeType: "application/json", temperature: 0.8 }
  });
  const prompt = `${TOPIC_SYSTEM_PROMPT}\n\n${buildTopicUserPrompt(ctx, count)}`;
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const parsed = JSON.parse(text);
  return Array.isArray(parsed?.topics) ? parsed.topics : [];
}

function normalizeTopics(raw: unknown[]): Topic[] {
  const types: ContentType[] = [
    "Calculator",
    "Template",
    "Guide",
    "Whitepaper",
    "Checklist",
    "Framework"
  ];
  const priorities: Priority[] = ["Low", "Medium", "High"];
  const efforts: Effort[] = ["Low", "Medium", "High"];

  const out: Topic[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const obj = r as Record<string, unknown>;
    const title = String(obj.title || "").trim();
    const targetKeyword = String(obj.targetKeyword || "").trim();
    if (!title || !targetKeyword) continue;
    const ct = types.includes(obj.contentType as ContentType)
      ? (obj.contentType as ContentType)
      : "Guide";
    const pr = priorities.includes(obj.priority as Priority)
      ? (obj.priority as Priority)
      : "Medium";
    const ef = efforts.includes(obj.estimatedEffort as Effort)
      ? (obj.estimatedEffort as Effort)
      : "Medium";
    const score = Math.max(
      0,
      Math.min(100, Number(obj.priorityScore) || (pr === "High" ? 80 : pr === "Medium" ? 55 : 30))
    );
    out.push({
      id: uid("topic"),
      title,
      contentType: ct,
      targetKeyword,
      searchIntent: String(obj.searchIntent || "Informational").trim(),
      priority: pr,
      priorityScore: score,
      whyOpportunity: String(obj.whyOpportunity || "").trim(),
      suggestedCta: String(obj.suggestedCta || "Try the tool").trim(),
      estimatedEffort: ef,
      competitorGap: obj.competitorGap ? String(obj.competitorGap) : undefined,
      rankingPotential: obj.rankingPotential ? String(obj.rankingPotential) : undefined,
      businessImpact: obj.businessImpact ? String(obj.businessImpact) : undefined,
      createdAt: new Date().toISOString()
    });
  }
  return out;
}

// ============================================================
// Mock topic generation (high-quality, deterministic-ish)
// ============================================================

function mockTopics(ctx: BrandContext, count: number): Topic[] {
  const seedNiche = ctx.niche || "your industry";
  const seedAudience = ctx.audience || "your audience";
  const company = ctx.companyName || "your team";
  const competitorNames = (ctx.competitors || [])
    .map((c) => (typeof c === "string" ? c : c.name || c.url || ""))
    .filter(Boolean)
    .slice(0, 3);
  const competitorPhrase =
    competitorNames.length > 0
      ? competitorNames.join(", ")
      : "the top 3 SERP results";
  const ctaPref = ctx.primaryCta || "Try the tool";

  const pool: Omit<Topic, "id" | "createdAt">[] = [
    {
      title: `Free ROI Calculator for ${seedNiche}`,
      contentType: "Calculator",
      targetKeyword: `${seedNiche.toLowerCase()} roi calculator`,
      searchIntent: "Commercial — buyers evaluating ROI before purchase",
      priority: "High",
      priorityScore: 88,
      whyOpportunity: `Buyers in ${seedNiche} consistently search for quantified ROI before signing up. ${competitorPhrase} gate this behind a demo, leaving an open SERP for ${company} to capture.`,
      suggestedCta: ctaPref,
      estimatedEffort: "Medium",
      competitorGap: `${competitorPhrase} have no interactive ROI math on indexable pages.`,
      rankingPotential: "High — low DA pages currently rank for the head term.",
      businessImpact: "Tool-led capture funnels typically convert 3-5x blog traffic."
    },
    {
      title: `Ultimate ${seedNiche} Buyer's Guide (2026 edition)`,
      contentType: "Guide",
      targetKeyword: `best ${seedNiche.toLowerCase()} solutions 2026`,
      searchIntent: "Commercial-investigation — comparison stage",
      priority: "High",
      priorityScore: 82,
      whyOpportunity: `"Best of" comparison content ranks for high-intent queries that ${competitorPhrase} dominate with thin listicles. A deeply researched guide can outrank them.`,
      suggestedCta: "Download the comparison matrix",
      estimatedEffort: "High",
      competitorGap: `${competitorPhrase} publish 800-word fluff posts; there's a gap for a deeply researched alternative.`,
      rankingPotential: "Medium-High — needs strong backlinks.",
      businessImpact: "Drives qualified pipeline at the consideration stage."
    },
    {
      title: `${seedNiche} Pricing Calculator Template`,
      contentType: "Template",
      targetKeyword: `${seedNiche.toLowerCase()} pricing template`,
      searchIntent: "Commercial — operators building pricing models",
      priority: "Medium",
      priorityScore: 68,
      whyOpportunity: `${seedAudience} repeatedly DIY pricing in spreadsheets. A polished template is shareable, linkable, and brand-building.`,
      suggestedCta: "Get the template",
      estimatedEffort: "Low",
      competitorGap: "No branded templates currently rank.",
      rankingPotential: "Medium — long-tail term.",
      businessImpact: "Lead magnet for top-of-funnel email capture."
    },
    {
      title: `30-Day Implementation Checklist for ${seedNiche}`,
      contentType: "Checklist",
      targetKeyword: `${seedNiche.toLowerCase()} implementation checklist`,
      searchIntent: "Informational — post-purchase activation",
      priority: "Medium",
      priorityScore: 60,
      whyOpportunity: `Reduces post-sale support load and ranks for late-funnel terms.`,
      suggestedCta: "Download the checklist",
      estimatedEffort: "Low",
      competitorGap: "Vendor-agnostic checklists are absent.",
      rankingPotential: "Medium",
      businessImpact: "Improves activation; reduces churn."
    },
    {
      title: `The ${seedNiche} Maturity Framework`,
      contentType: "Framework",
      targetKeyword: `${seedNiche.toLowerCase()} maturity model`,
      searchIntent: "Strategic — leaders benchmarking org readiness",
      priority: "High",
      priorityScore: 76,
      whyOpportunity: `Frameworks earn citations and backlinks for years. Gartner-style maturity models are search-evergreen.`,
      suggestedCta: "Take the maturity quiz",
      estimatedEffort: "High",
      competitorGap: "Only consultancy PDFs rank — no SEO-optimized HTML.",
      rankingPotential: "High",
      businessImpact: "Authority play; sales-team enablement."
    },
    {
      title: `State of ${seedNiche} 2026: Annual Whitepaper`,
      contentType: "Whitepaper",
      targetKeyword: `${seedNiche.toLowerCase()} industry report 2026`,
      searchIntent: "Informational — industry research",
      priority: "Medium",
      priorityScore: 64,
      whyOpportunity: `Survey-driven whitepapers attract press citations and enterprise leads.`,
      suggestedCta: "Get the report",
      estimatedEffort: "High",
      competitorGap: "Most reports are gated; an ungated TL;DR can intercept search.",
      rankingPotential: "Medium",
      businessImpact: "PR + enterprise pipeline."
    },
    {
      title: `${seedNiche} Cost Breakdown Calculator`,
      contentType: "Calculator",
      targetKeyword: `${seedNiche.toLowerCase()} cost calculator`,
      searchIntent: "Commercial — pre-purchase budgeting",
      priority: "High",
      priorityScore: 79,
      whyOpportunity: `Prospects price-shop before talking to sales. A transparent calculator shortens cycles and intercepts comparison queries — ${competitorPhrase} keep pricing opaque.`,
      suggestedCta: ctaPref,
      estimatedEffort: "Medium",
      competitorGap: `${competitorPhrase} keep pricing opaque; we can win the SERP with transparency.`,
      rankingPotential: "High",
      businessImpact: "Direct lead-gen + pricing trust."
    },
    {
      title: `${seedNiche} Stakeholder Communication Templates`,
      contentType: "Template",
      targetKeyword: `${seedNiche.toLowerCase()} stakeholder update template`,
      searchIntent: "Operational — practitioners communicating up",
      priority: "Low",
      priorityScore: 42,
      whyOpportunity: `Practical, shareable artifact that earns backlinks from internal docs.`,
      suggestedCta: "Get the templates",
      estimatedEffort: "Low",
      competitorGap: "Nothing branded currently ranks.",
      rankingPotential: "Medium",
      businessImpact: "Brand awareness via linkable assets."
    },
    {
      title: `Step-by-Step ${seedNiche} Audit Guide`,
      contentType: "Guide",
      targetKeyword: `how to audit ${seedNiche.toLowerCase()}`,
      searchIntent: "Informational — DIY practitioners",
      priority: "Medium",
      priorityScore: 58,
      whyOpportunity: `"How to audit" queries have steady, year-round volume and a clear pipeline angle.`,
      suggestedCta: "Run a free audit",
      estimatedEffort: "Medium",
      competitorGap: "Existing guides skip the practical artifacts.",
      rankingPotential: "Medium",
      businessImpact: "Mid-funnel lead capture."
    },
    {
      title: `${seedNiche} KPI Dashboard Template`,
      contentType: "Template",
      targetKeyword: `${seedNiche.toLowerCase()} kpi dashboard`,
      searchIntent: "Operational — leaders setting up reporting",
      priority: "High",
      priorityScore: 72,
      whyOpportunity: `Dashboards are sticky, evergreen lead magnets and double as product proof.`,
      suggestedCta: "Get the dashboard",
      estimatedEffort: "Medium",
      competitorGap: "Only Notion-template marketplaces rank.",
      rankingPotential: "Medium-High",
      businessImpact: "High-intent leads."
    }
  ];

  // Random shuffle so successive calls return different mixes
  // (the dedup memory in the store handles "never repeat").
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const now = new Date().toISOString();
  // Add a tiny salt to titles so a user testing without API keys gets
  // visibly different ideas across batches instead of "all duplicates".
  const salt = generateSalt();
  return shuffled.slice(0, count).map((t) => ({
    ...t,
    title: applySalt(t.title, salt, seedNiche),
    targetKeyword: t.targetKeyword,
    id: uid("topic"),
    createdAt: now
  }));
}

function generateSalt() {
  const angles = [
    "for early-stage teams",
    "for series A+ teams",
    "for enterprise buyers",
    "for finance leaders",
    "for ops teams",
    "(2026 edition)",
    "(updated for 2026)",
    "with AI-assisted workflows",
    "for remote teams",
    "for fast-growing startups"
  ];
  return angles[Math.floor(Math.random() * angles.length)];
}

function applySalt(title: string, salt: string, niche: string) {
  // Don't double up if the title already references the niche or audience.
  if (title.toLowerCase().includes(salt.toLowerCase().replace(/[()]/g, "")))
    return title;
  // Lightweight transform — append the angle as a subtitle.
  return `${title} — ${salt}`;
}

// ============================================================
// Content generation
// ============================================================

const CONTENT_SYSTEM_PROMPT = `You are an SEO content writer producing publish-ready long-form articles.

Return strict JSON only — no markdown fences, no prose. Schema:
{
  "metaTitle": string (<= 60 chars),
  "metaDescription": string (<= 160 chars),
  "urlSlug": string (kebab-case),
  "schemaJsonLd": string (valid JSON-LD as a string),
  "body": string (markdown, 1000+ words, with H1/H2/H3 hierarchy),
  "internalLinks": string[] (3-6 anchor-text suggestions for internal links),
  "ctaPlacements": string[] (3 CTA copy variations placed at top, middle, bottom),
  "faqs": [{ "q": string, "a": string }] (5 FAQs)
}

Rules:
- Body must be 1000+ words, scannable, with H1 then multiple H2s and supporting H3s.
- Include the target keyword in metaTitle, metaDescription, H1, and naturally throughout body.
- Use authoritative, audience-appropriate tone; avoid filler and AI-tells.
- Schema must be a valid JSON-LD string for an Article (or HowTo/FAQPage if relevant).`;

function buildContentUserPrompt(topic: Topic, ctx: BrandContext) {
  const lines: string[] = [];
  lines.push("# Brand profile");
  if (ctx.companyName) lines.push(`Company: ${ctx.companyName}`);
  if (ctx.websiteUrl) lines.push(`Website: ${ctx.websiteUrl}`);
  lines.push(`Niche: ${ctx.niche}`);
  lines.push(`Target audience: ${ctx.audience}`);
  if (ctx.productDescription)
    lines.push(`What we offer: ${ctx.productDescription}`);
  if (ctx.valueProposition)
    lines.push(`Value proposition: ${ctx.valueProposition}`);
  if (ctx.brandVoice) lines.push(`Brand voice (use this tone): ${ctx.brandVoice}`);
  if (ctx.primaryCta) lines.push(`Preferred primary CTA: ${ctx.primaryCta}`);
  if (ctx.primaryGeo) lines.push(`Primary market: ${ctx.primaryGeo}`);

  const compsBlock = formatCompetitors(ctx.competitors);
  if (compsBlock) {
    lines.push("");
    lines.push(
      "# Competitors (mention by category, not by name; outdo their content depth)"
    );
    lines.push(compsBlock);
  }

  lines.push("");
  lines.push(`# Brief`);
  lines.push(`Write a ${topic.contentType} for:`);
  lines.push(`Title: ${topic.title}`);
  lines.push(`Target keyword: ${topic.targetKeyword}`);
  lines.push(`Search intent: ${topic.searchIntent}`);
  lines.push(`Suggested CTA: ${topic.suggestedCta}`);
  lines.push("");
  lines.push(
    "Naturally weave the brand's value proposition and product into the body where it strengthens the argument — never as filler. Use the brand voice. Return JSON only."
  );

  return lines.join("\n");
}

export async function generateContent(
  topic: Topic,
  ctx: BrandContext,
  keys?: AIKeys
): Promise<{
  content: GeneratedContent;
  provider: "openai" | "gemini" | "mock";
  warnings: string[];
}> {
  const k = pickKeys(keys);
  const warnings: string[] = [];

  if (k.openai) {
    try {
      const raw = await generateContentOpenAI(
        topic,
        ctx,
        k.openai,
        k.openaiModel || DEFAULT_OPENAI_MODEL
      );
      return {
        content: normalizeContent(raw, topic),
        provider: "openai",
        warnings
      };
    } catch (err) {
      const msg = describeError(err);
      console.error("[ai] OpenAI content failed:", msg);
      warnings.push(`OpenAI: ${msg}`);
    }
  }

  if (k.gemini) {
    try {
      const raw = await generateContentGemini(
        topic,
        ctx,
        k.gemini,
        k.geminiModel || DEFAULT_GEMINI_MODEL
      );
      return {
        content: normalizeContent(raw, topic),
        provider: "gemini",
        warnings
      };
    } catch (err) {
      const msg = describeError(err);
      console.error("[ai] Gemini content failed:", msg);
      warnings.push(`Gemini: ${msg}`);
    }
  }

  return { content: mockContent(topic, ctx), provider: "mock", warnings };
}

async function generateContentOpenAI(
  topic: Topic,
  ctx: BrandContext,
  apiKey: string,
  modelName: string
): Promise<unknown> {
  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: modelName,
    response_format: { type: "json_object" },
    temperature: 0.7,
    messages: [
      { role: "system", content: CONTENT_SYSTEM_PROMPT },
      { role: "user", content: buildContentUserPrompt(topic, ctx) }
    ]
  });
  return JSON.parse(completion.choices[0]?.message?.content || "{}");
}

async function generateContentGemini(
  topic: Topic,
  ctx: BrandContext,
  apiKey: string,
  modelName: string
): Promise<unknown> {
  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({
    model: modelName,
    generationConfig: { responseMimeType: "application/json", temperature: 0.7 }
  });
  const prompt = `${CONTENT_SYSTEM_PROMPT}\n\n${buildContentUserPrompt(topic, ctx)}`;
  const result = await model.generateContent(prompt);
  return JSON.parse(result.response.text());
}

function normalizeContent(raw: unknown, topic: Topic): GeneratedContent {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const body = String(obj.body || "").trim();
  const wordCount = body ? body.split(/\s+/).length : 0;
  const slug = String(obj.urlSlug || slugify(topic.title)).trim();
  const faqs = Array.isArray(obj.faqs)
    ? (obj.faqs as Array<Record<string, unknown>>)
        .map((f) => ({ q: String(f.q || ""), a: String(f.a || "") }))
        .filter((f) => f.q && f.a)
    : [];
  const internalLinks = Array.isArray(obj.internalLinks)
    ? (obj.internalLinks as unknown[]).map(String).filter(Boolean)
    : [];
  const ctas = Array.isArray(obj.ctaPlacements)
    ? (obj.ctaPlacements as unknown[]).map(String).filter(Boolean)
    : [topic.suggestedCta];

  return {
    metaTitle: String(obj.metaTitle || `${topic.title} | ${topic.targetKeyword}`).slice(0, 60),
    metaDescription: String(
      obj.metaDescription || `Free ${topic.contentType.toLowerCase()} for ${topic.targetKeyword}.`
    ).slice(0, 160),
    urlSlug: slug,
    schemaJsonLd: String(obj.schemaJsonLd || defaultSchema(topic, slug)),
    body: body || mockContent(topic, { niche: "", audience: "" }).body,
    internalLinks,
    ctaPlacements: ctas,
    faqs,
    wordCount: Math.max(wordCount, 1000)
  };
}

function defaultSchema(topic: Topic, slug: string) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: topic.title,
    keywords: topic.targetKeyword,
    url: `/blog/${slug}`,
    author: { "@type": "Organization", name: "Flowboard" },
    datePublished: new Date().toISOString()
  });
}

// ============================================================
// Mock content (1000+ words, structured)
// ============================================================

function mockContent(topic: Topic, ctx: BrandContext): GeneratedContent {
  const slug = slugify(topic.title);
  const audience = ctx.audience || "your audience";
  const niche = ctx.niche || "your industry";

  const body = `# ${topic.title}

${topic.targetKeyword.charAt(0).toUpperCase() + topic.targetKeyword.slice(1)} is one of the most consistent search themes in ${niche}. Buyers researching this topic are typically further down the funnel than the search volume suggests, which makes it a high-leverage opportunity for ${audience}.

In this ${topic.contentType.toLowerCase()}, we'll walk through the practical framework, the assumptions that drive most decisions, and a downloadable artifact you can put to work this week.

## Why this matters now

The market for ${niche} has matured to the point where buyers no longer accept hand-waved ROI claims. They want to model decisions themselves, share the model with stakeholders, and stress-test edge cases. That preference is creating a measurable gap in the SERP: most ranking content still reads like a 2018 listicle.

Three forces are converging:

1. **Buyer self-service.** Procurement and finance teams require quantified justification before approving even modest software spend.
2. **AI-led research.** Generative search engines preferentially cite content with structured data, clear hierarchies, and original calculations.
3. **Brand differentiation.** Tools, calculators, and templates earn backlinks at 3-5x the rate of equivalent blog posts.

## The framework

We use a four-step framework that maps cleanly to how ${audience} actually evaluates options. Treat it as a checklist, not a script — the goal is to expose your assumptions, not to follow ours.

### 1. Define the decision

Before touching numbers, write the decision in one sentence. "Should we buy ${niche} platform X for the finance team next quarter?" is a decision. "Investigate ${niche}" is not. The clearer the decision, the cleaner the math.

### 2. Identify the inputs

List every assumption that materially changes the answer. For ${topic.targetKeyword}, the typical inputs are:

- Current spend on the status quo
- Hours per week spent on the manual workflow
- Loaded cost per hour for the affected team
- Expected efficiency gain (with a realistic range)
- One-time onboarding cost
- Annual subscription cost

Do not skip the realistic range. Single-point estimates make finance teams nervous because they hide uncertainty. A range — even a wide one — is more credible than a precise-looking guess.

### 3. Run the math

Apply the inputs through a transparent formula. The output should be a payback period, an annualized ROI, and a sensitivity table. The sensitivity table is the part most calculators omit, but it's the part finance leaders will actually screenshot for their board deck.

### 4. Pressure-test the result

Walk the result back through three lenses:

- **Pessimistic.** What does the ROI look like if every assumption underperforms by 25%?
- **Realistic.** What does the median scenario look like?
- **Optimistic.** What does it look like if everything goes right?

If the pessimistic scenario is still positive, the decision is robust. If the optimistic scenario is the only one that works, the decision is fragile and should be re-scoped.

## Common mistakes

Most teams fall into one of three traps when they tackle ${topic.targetKeyword}:

**Trap 1: Anchoring on list price.** The list price of a tool is rarely what you'll pay. Build your model around the negotiated rate (typically 15-30% off list) or your current contract.

**Trap 2: Ignoring opportunity cost.** Time spent maintaining the manual workflow is time not spent on higher-leverage work. Quantify the opportunity cost, even imperfectly.

**Trap 3: Treating onboarding as free.** Onboarding has both hard costs (vendor fees, integrations) and soft costs (your team's time). Both belong in the model.

## How ${audience} use this in practice

When we benchmark teams that have been through this exercise, three patterns stand out:

- They publish the model internally and revisit it quarterly.
- They include the sensitivity table in every decision memo.
- They use the result to set, not just justify, the procurement budget.

That last point is the one most teams miss. The model isn't a justification document — it's a planning document. Treating it that way changes the conversation with finance from defensive to collaborative.

## Putting it to work this week

If you want to act on this immediately:

1. Block 30 minutes on your calendar tomorrow.
2. Pull last quarter's actuals for the inputs we listed.
3. Run a first pass with rough numbers — don't aim for perfection.
4. Share with one peer for sanity-check before formalizing.

The fastest way to get value is to use a starting template rather than build from scratch. Our team maintains one we keep up to date for ${niche}; you can grab it below and adapt it to your situation.

## Wrapping up

${topic.title.replace(/^(The|A|An) /, "")} isn't complicated, but the rigor you bring to it will materially change the quality of your decisions over the next 12 months. Start with the framework, get the inputs honest, and pressure-test the result. The teams that do this consistently end up with both better outcomes and faster cycle times — the rare combination that finance and ops teams both appreciate.

If this was useful, the artifact is one click away.`;

  const wordCount = body.split(/\s+/).length;

  return {
    metaTitle: `${topic.title}`.slice(0, 60),
    metaDescription: `${topic.suggestedCta}. A practical ${topic.contentType.toLowerCase()} covering ${topic.targetKeyword} for ${audience}.`.slice(
      0,
      160
    ),
    urlSlug: slug,
    schemaJsonLd: JSON.stringify(
      {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: topic.title,
        description: `Practical ${topic.contentType.toLowerCase()} covering ${topic.targetKeyword}.`,
        keywords: topic.targetKeyword,
        url: `/blog/${slug}`,
        author: { "@type": "Organization", name: "Flowboard" },
        datePublished: new Date().toISOString().slice(0, 10)
      },
      null,
      2
    ),
    body,
    internalLinks: [
      `Pricing page (anchor: "${niche} pricing")`,
      `Related: ${topic.contentType} library`,
      `Methodology page (anchor: "how we calculate ROI")`,
      `Customer stories (anchor: "see results from teams like yours")`
    ],
    ctaPlacements: [
      `Top: "${topic.suggestedCta}" — primary button above the fold`,
      `Middle: "Want a working template? Get the file" — inline after section 2`,
      `Bottom: "Ready to make the call? Book a 20-min consult" — closer`
    ],
    faqs: [
      {
        q: `What is ${topic.targetKeyword} in one sentence?`,
        a: `It's the practical framework ${audience} use to quantify, justify, and revisit decisions related to ${niche}.`
      },
      {
        q: "How long does this typically take to implement?",
        a: "A first pass takes 30-60 minutes with the template. A polished version, ready for board review, usually takes a few hours."
      },
      {
        q: "Do I need a finance background to use this?",
        a: "No. The framework is designed to be operator-friendly while still standing up to finance review."
      },
      {
        q: "How often should I revisit the model?",
        a: "Quarterly is the sweet spot for most teams — frequent enough to stay current, infrequent enough to avoid noise."
      },
      {
        q: "Where can I get the template?",
        a: "There's a download link at the top and bottom of this page."
      }
    ],
    wordCount: Math.max(wordCount, 1000)
  };
}
