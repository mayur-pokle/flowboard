"use client";

import { useEffect, useState } from "react";
import {
  Save,
  CheckCircle2,
  XCircle,
  Send,
  Trash2,
  KeyRound,
  Building2,
  Globe,
  Users,
  Megaphone,
  Search,
  Plus,
  ExternalLink,
  AlertTriangle,
  Sparkles,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { useStore, useHasHydrated } from "@/lib/store";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/components/Toast";
import type { PrimaryProvider } from "@/lib/types";

// Curated model lists shown in dropdowns. Users can still type a custom
// model name via the "Custom…" option if their account supports a model
// that isn't in this list. Listed newest-first inside each family.
//
// As of May 2026: OpenAI's $5-trial free credits are gone, but new accounts
// get a small free tier on GPT-4o-mini / GPT-3.5 / GPT-5.x-nano. Gemini's
// free tier (May 2026) covers 2.5 Flash, 2.5 Flash-Lite, 3 Flash, and
// 3.1 Flash-Lite — those are flagged "free-tier" below.
const OPENAI_MODELS = [
  // ── GPT-5.4 family (newest, May 2026) ──
  { value: "gpt-5.4", label: "GPT-5.4 — newest flagship (paid)" },
  { value: "gpt-5.4-mini", label: "GPT-5.4 mini — balanced, cheap" },
  { value: "gpt-5.4-nano", label: "GPT-5.4 nano — smallest, lowest cost (recommended for cost)" },

  // ── GPT-5 family ──
  { value: "gpt-5", label: "GPT-5 — flagship" },
  { value: "gpt-5-mini", label: "GPT-5 mini — balanced" },
  { value: "gpt-5-nano", label: "GPT-5 nano — cheapest GPT-5" },

  // ── GPT-4.1 family ──
  { value: "gpt-4.1", label: "GPT-4.1 — high quality" },
  { value: "gpt-4.1-mini", label: "GPT-4.1 mini — balanced" },
  { value: "gpt-4.1-nano", label: "GPT-4.1 nano — very cheap" },

  // ── GPT-4o family ──
  { value: "gpt-4o", label: "GPT-4o — high quality" },
  { value: "gpt-4o-mini", label: "GPT-4o mini — free-tier friendly (recommended)" },

  // ── Reasoning (o-series) ──
  { value: "o3", label: "o3 — reasoning, full" },
  { value: "o4-mini", label: "o4 mini — reasoning" },
  { value: "o3-mini", label: "o3 mini — reasoning, smaller" },
  { value: "o1-mini", label: "o1 mini — reasoning, legacy" },

  // ── GPT-3.5 (budget / legacy free-tier) ──
  { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo — free-tier (3 RPM limit)" },
  { value: "gpt-3.5-turbo-0125", label: "GPT-3.5 Turbo 0125 — pinned" },
  { value: "gpt-3.5-turbo-1106", label: "GPT-3.5 Turbo 1106 — pinned" },
  { value: "gpt-3.5-turbo-instruct", label: "GPT-3.5 Turbo Instruct — legacy completion" }
];

// Listed newest-first by generation. Availability varies by API key region
// and Google account — if the picked model returns "Model not available," try
// another variant. As of May 2026, free tier covers 2.5 Flash, 2.5 Flash-Lite,
// 3 Flash, and 3.1 Flash-Lite (Pro tiers are paid-only since April 2026).
// Anthropic Claude models — newest first.
const ANTHROPIC_MODELS = [
  // ── Claude 4.x (current as of May 2026) ──
  { value: "claude-opus-4-6", label: "Claude Opus 4.6 — flagship reasoning (premium)" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 — balanced (recommended for content)" },
  { value: "claude-haiku-4-5", label: "Claude Haiku 4.5 — fast + cheap (recommended)" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (pinned 2025-10-01)" },

  // ── Claude 3.5 (legacy but widely available) ──
  { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet (legacy, balanced)" },
  { value: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku (legacy, cheap)" },

  // ── Claude 3 (oldest still supported) ──
  { value: "claude-3-opus-20240229", label: "Claude 3 Opus (legacy, premium)" },
  { value: "claude-3-haiku-20240307", label: "Claude 3 Haiku (legacy, cheapest)" }
];

const GEMINI_MODELS = [
  // ── Gemini 3.5 (newest — launched at Google I/O May 2026) ──
  { value: "gemini-3.5-flash", label: "Gemini 3.5 Flash — newest, 1M context (recommended)" },

  // ── Gemini 3.1 (preview models) ──
  { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview — flagship reasoning (paid)" },
  { value: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite — free-tier, cheapest 3.x" },

  // ── Gemini 3 ──
  { value: "gemini-3-flash", label: "Gemini 3 Flash — free-tier, balanced" },

  // ── Gemini 2.5 ──
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro — high quality (paid since Apr 2026)" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash — free-tier, fast" },
  { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite — free-tier, fastest" },
  { value: "gemini-2.5-flash-lite-preview", label: "Gemini 2.5 Flash Lite (preview)" },

  // ── Gemini 2.0 ──
  { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash — free-tier friendly" },
  { value: "gemini-2.0-flash-exp", label: "Gemini 2.0 Flash (experimental)" },
  { value: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite — budget" },
  { value: "gemini-2.0-flash-lite-001", label: "Gemini 2.0 Flash Lite 001 — pinned" },
  { value: "gemini-2.0-flash-thinking-exp", label: "Gemini 2.0 Flash Thinking (experimental)" },

  // ── Floating aliases ──
  { value: "gemini-flash-latest", label: "Gemini Flash (latest alias)" },
  { value: "gemini-flash-lite-latest", label: "Gemini Flash Lite (latest alias)" },
  { value: "gemini-pro-latest", label: "Gemini Pro (latest alias)" },

  // ── Gemini 1.5 (legacy — being deprecated) ──
  { value: "gemini-1.5-pro-latest", label: "Gemini 1.5 Pro (latest, legacy)" },
  { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro (legacy)" },
  { value: "gemini-1.5-pro-002", label: "Gemini 1.5 Pro 002 (legacy)" },
  { value: "gemini-1.5-pro-001", label: "Gemini 1.5 Pro 001 (legacy)" },
  { value: "gemini-1.5-flash-latest", label: "Gemini 1.5 Flash (latest, legacy)" },
  { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash (legacy)" },
  { value: "gemini-1.5-flash-002", label: "Gemini 1.5 Flash 002 (legacy)" },
  { value: "gemini-1.5-flash-001", label: "Gemini 1.5 Flash 001 (legacy)" },
  { value: "gemini-1.5-flash-8b", label: "Gemini 1.5 Flash 8B — smallest legacy" },
  { value: "gemini-1.5-flash-8b-latest", label: "Gemini 1.5 Flash 8B (latest, legacy)" },
  { value: "gemini-1.5-flash-8b-001", label: "Gemini 1.5 Flash 8B 001 (legacy, pinned)" }
];

export default function SettingsApiPage() {
  const hydrated = useHasHydrated();
  const settings = useStore((s) => s.settings);
  const serverConfigured = useStore((s) => s.serverConfigured);
  const updateSettings = useStore((s) => s.updateSettings);
  const addCompetitor = useStore((s) => s.addCompetitor);
  const updateCompetitor = useStore((s) => s.updateCompetitor);
  const removeCompetitor = useStore((s) => s.removeCompetitor);

  // Local form state, hydrated from the store once.
  const [openaiModel, setOpenaiModel] = useState("");
  const [geminiModel, setGeminiModel] = useState("");
  const [anthropicModel, setAnthropicModel] = useState("");
  const [primaryProvider, setPrimaryProvider] = useState<PrimaryProvider>("auto");
  const [companyName, setCompanyName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [niche, setNiche] = useState("");
  const [audience, setAudience] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [valueProposition, setValueProposition] = useState("");
  const [brandVoice, setBrandVoice] = useState("");
  const [primaryCta, setPrimaryCta] = useState("");
  const [primaryGeo, setPrimaryGeo] = useState("");
  const [seedKeywords, setSeedKeywords] = useState("");
  const [topicsToAvoid, setTopicsToAvoid] = useState("");

  const [testingSlack, setTestingSlack] = useState(false);

  // Competitor "add new" form
  const [newCompetitorName, setNewCompetitorName] = useState("");
  const [newCompetitorUrl, setNewCompetitorUrl] = useState("");
  const [newCompetitorNotes, setNewCompetitorNotes] = useState("");
  const [newCompetitorTier, setNewCompetitorTier] = useState<
    "primary" | "secondary" | "watch"
  >("secondary");

  useEffect(() => {
    if (!hydrated) return;
    setOpenaiModel(settings.openaiModel);
    setGeminiModel(settings.geminiModel);
    setAnthropicModel(settings.anthropicModel || "claude-haiku-4-5");
    setPrimaryProvider(settings.primaryProvider);
    setCompanyName(settings.companyName);
    setWebsiteUrl(settings.websiteUrl);
    setNiche(settings.brandNiche);
    setAudience(settings.brandAudience);
    setProductDescription(settings.productDescription);
    setValueProposition(settings.valueProposition);
    setBrandVoice(settings.brandVoice);
    setPrimaryCta(settings.primaryCta);
    setPrimaryGeo(settings.primaryGeo);
    setSeedKeywords(settings.seedKeywords);
    setTopicsToAvoid(settings.topicsToAvoid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // ── Per-section save handlers ───────────────────────────────────
  // Each section that has multiple text inputs gets its own Save button so
  // users can commit one block at a time. Competitors and AI providers
  // already autosave per change, so no Save button there.

  const brandProfileDirty =
    companyName.trim() !== settings.companyName ||
    websiteUrl.trim() !== settings.websiteUrl ||
    niche.trim() !== settings.brandNiche ||
    audience.trim() !== settings.brandAudience ||
    productDescription.trim() !== settings.productDescription ||
    valueProposition.trim() !== settings.valueProposition ||
    brandVoice.trim() !== settings.brandVoice ||
    primaryCta.trim() !== settings.primaryCta ||
    primaryGeo.trim() !== settings.primaryGeo;

  const seoSeedDirty =
    seedKeywords.trim() !== settings.seedKeywords ||
    topicsToAvoid.trim() !== settings.topicsToAvoid;

  const [savingBrandProfile, setSavingBrandProfile] = useState(false);
  const [savingSeoSeed, setSavingSeoSeed] = useState(false);

  async function saveBrandProfile() {
    setSavingBrandProfile(true);
    try {
      await updateSettings({
        companyName: companyName.trim(),
        websiteUrl: websiteUrl.trim(),
        brandNiche: niche.trim(),
        brandAudience: audience.trim(),
        productDescription: productDescription.trim(),
        valueProposition: valueProposition.trim(),
        brandVoice: brandVoice.trim(),
        primaryCta: primaryCta.trim(),
        primaryGeo: primaryGeo.trim()
      });
      toast("Brand profile saved", "success");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSavingBrandProfile(false);
    }
  }

  async function saveSeoSeed() {
    setSavingSeoSeed(true);
    try {
      await updateSettings({
        seedKeywords: seedKeywords.trim(),
        topicsToAvoid: topicsToAvoid.trim()
      });
      toast("SEO seed saved", "success");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSavingSeoSeed(false);
    }
  }

  async function handleAddCompetitor() {
    const name = newCompetitorName.trim();
    const url = newCompetitorUrl.trim();
    const notes = newCompetitorNotes.trim();
    if (!name && !url) {
      toast("Add a competitor name or URL", "error");
      return;
    }
    try {
      await addCompetitor({ name, url, notes, tier: newCompetitorTier });
      setNewCompetitorName("");
      setNewCompetitorUrl("");
      setNewCompetitorNotes("");
      setNewCompetitorTier("secondary");
      toast("Competitor added", "success");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function testSlack() {
    if (!serverConfigured.slackWebhook) {
      toast("Set SLACK_WEBHOOK_URL in Vercel env vars first", "error");
      return;
    }
    setTestingSlack(true);
    try {
      const res = await fetch("/api/slack/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topics: [],
          text: ":wave: Flowboard test message — your Slack webhook is wired up correctly."
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Slack test failed");
      toast("Test message posted to Slack", "success");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setTestingSlack(false);
    }
  }

  if (!hydrated) {
    return <PageHeader title="Settings" subtitle="Loading…" />;
  }

  const profileCompleteness = computeCompleteness({
    companyName,
    websiteUrl,
    niche,
    audience,
    productDescription,
    valueProposition,
    competitorCount: settings.competitors.length
  });

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col">
      <PageHeader
        title="API & Integrations"
        subtitle="Brand context, competitors, AI keys, and Slack — all stored in your browser."
        right={
          <Badge tone={profileCompleteness >= 70 ? "success" : "warn"}>
            Profile {profileCompleteness}% complete
          </Badge>
        }
      />

      <div className="flex-1 overflow-auto scrollbar-thin px-8 py-6 max-w-5xl w-full">
        {profileCompleteness < 50 ? (
          <div className="card p-4 mb-5 border-amber-200 bg-amber-50/60 flex gap-3">
            <AlertTriangle className="size-5 text-amber-600 shrink-0 mt-1" />
            <div>
              <div className="text-base font-semibold text-ink-900">
                Add brand context for better topics
              </div>
              <p className="text-xs text-ink-700 mt-1 max-w-xl">
                The more we know about your offering, audience, and competitors, the more relevant the generated topics and content. Fill in the sections below — every field is optional, but each one materially improves the output.
              </p>
            </div>
          </div>
        ) : null}

        {/* ───────────── Brand profile ───────────── */}
        <Card
          icon={Building2}
          title="Brand profile"
          description="Who you are, what you sell, and who you sell to. Fed into every AI generation."
          right={
            <Button
              variant="primary"
              onClick={saveBrandProfile}
              loading={savingBrandProfile}
              disabled={!brandProfileDirty}
            >
              <Save className="size-4" />
              Save
            </Button>
          }
        >
          <Row>
            <Field label="Company name">
              <input
                className="input"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Acme Finance"
              />
            </Field>
            <Field label="Website">
              <div className="relative">
                <Globe className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  className="input pl-9"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://acme.com"
                />
              </div>
            </Field>
          </Row>

          <Field label="Niche / industry">
            <input
              className="input"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              placeholder="B2B SaaS for finance teams"
            />
          </Field>

          <Field label="Target audience">
            <input
              className="input"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="CFOs, controllers, finance ops at startups"
            />
            <Hint>Describe role + seniority + company stage.</Hint>
          </Field>

          <Field label="What we offer">
            <textarea
              className="input min-h-[80px]"
              value={productDescription}
              onChange={(e) => setProductDescription(e.target.value)}
              placeholder="A close-the-books platform that automates accruals, reconciliations, and reporting."
            />
            <Hint>One or two sentences. The clearer the product description, the better the calculator/template ideas.</Hint>
          </Field>

          <Field label="Value proposition / differentiator">
            <textarea
              className="input min-h-[80px]"
              value={valueProposition}
              onChange={(e) => setValueProposition(e.target.value)}
              placeholder="Cut your monthly close from 10 days to 2 with built-in audit trails and AI-assisted journal entries."
            />
            <Hint>Why pick you over the alternatives? Stated as a benefit, not a feature.</Hint>
          </Field>

          <Row>
            <Field label="Brand voice">
              <input
                className="input"
                value={brandVoice}
                onChange={(e) => setBrandVoice(e.target.value)}
                placeholder="Professional, direct, no fluff"
              />
            </Field>
            <Field label="Primary market">
              <input
                className="input"
                value={primaryGeo}
                onChange={(e) => setPrimaryGeo(e.target.value)}
                placeholder="United States"
              />
            </Field>
          </Row>

          <Field label="Preferred CTA">
            <div className="relative">
              <Megaphone className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                className="input pl-9"
                value={primaryCta}
                onChange={(e) => setPrimaryCta(e.target.value)}
                placeholder="Book a 20-min demo"
              />
            </div>
            <Hint>Used as the default suggested CTA for new topics.</Hint>
          </Field>
        </Card>

        {/* ───────────── Competitors ───────────── */}
        <Card
          icon={Users}
          title="Competitors"
          description="The AI uses these to find content gaps and avoid territory where you'll be outranked."
          right={
            <Badge tone="neutral">
              {settings.competitors.length} listed
            </Badge>
          }
        >
          {settings.competitors.length === 0 ? (
            <div className="text-xs text-ink-500 mb-3">
              No competitors yet. Add the 3-5 brands you most often lose deals to or compete with on SERP.
            </div>
          ) : (
            <ul className="divide-y divide-ink-100 mb-3 -mx-1">
              {settings.competitors.map((c) => (
                <li
                  key={c.id}
                  className="px-1 py-2 grid grid-cols-[1fr_auto] gap-2 items-start"
                >
                  <div className="grid sm:grid-cols-[1fr_1fr_2fr_140px] gap-2">
                    <input
                      className="input !py-2 text-base"
                      value={c.name}
                      onChange={(e) =>
                        updateCompetitor(c.id, { name: e.target.value })
                      }
                      placeholder="Name"
                    />
                    <input
                      className="input !py-2 text-base font-mono"
                      value={c.url}
                      onChange={(e) =>
                        updateCompetitor(c.id, { url: e.target.value })
                      }
                      placeholder="https://…"
                    />
                    <input
                      className="input !py-2 text-base"
                      value={c.notes}
                      onChange={(e) =>
                        updateCompetitor(c.id, { notes: e.target.value })
                      }
                      placeholder="Why we win/lose against them"
                    />
                    <select
                      className="input !py-2 text-base"
                      value={c.tier}
                      onChange={(e) =>
                        updateCompetitor(c.id, {
                          tier: e.target.value as
                            | "primary"
                            | "secondary"
                            | "watch"
                        })
                      }
                      aria-label="Tier"
                      title="Tier — controls how heavily the AI weights this competitor"
                    >
                      <option value="primary">Primary (beat them)</option>
                      <option value="secondary">Secondary</option>
                      <option value="watch">Watch only</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-1">
                    {c.url ? (
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-ink-400 hover:text-ink-700 rounded"
                        aria-label="Visit website"
                      >
                        <ExternalLink className="size-4" />
                      </a>
                    ) : null}
                    <button
                      onClick={() => removeCompetitor(c.id)}
                      className="p-2 text-ink-400 hover:text-rose-600 rounded"
                      aria-label="Remove competitor"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Add new competitor */}
          <div className="rounded-md border border-dashed border-ink-300 p-3 bg-ink-50/40">
            <div className="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-2">
              Add competitor
            </div>
            <div className="grid sm:grid-cols-[1fr_1fr_2fr_140px_auto] gap-2">
              <input
                className="input !py-2 text-base"
                value={newCompetitorName}
                onChange={(e) => setNewCompetitorName(e.target.value)}
                placeholder="Numeric"
              />
              <input
                className="input !py-2 text-base font-mono"
                value={newCompetitorUrl}
                onChange={(e) => setNewCompetitorUrl(e.target.value)}
                placeholder="https://numeric.io"
              />
              <input
                className="input !py-2 text-base"
                value={newCompetitorNotes}
                onChange={(e) => setNewCompetitorNotes(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddCompetitor();
                }}
                placeholder="Strong on close automation; weak on FP&A."
              />
              <select
                className="input !py-2 text-base"
                value={newCompetitorTier}
                onChange={(e) =>
                  setNewCompetitorTier(
                    e.target.value as "primary" | "secondary" | "watch"
                  )
                }
              >
                <option value="primary">Primary</option>
                <option value="secondary">Secondary</option>
                <option value="watch">Watch only</option>
              </select>
              <Button variant="primary" onClick={handleAddCompetitor}>
                <Plus className="size-4" />
                Add
              </Button>
            </div>
            <Hint>
              <strong>Primary</strong> competitors are weighted heavily in
              every topic generation. <strong>Watch</strong> competitors are
              tracked but don&apos;t bias prompts.
            </Hint>
          </div>
        </Card>

        {/* ───────────── SEO seed ───────────── */}
        <Card
          icon={Search}
          title="SEO seed"
          description="Optional starter keywords and topics to avoid. Comma- or newline-separated."
          right={
            <Button
              variant="primary"
              onClick={saveSeoSeed}
              loading={savingSeoSeed}
              disabled={!seoSeedDirty}
            >
              <Save className="size-4" />
              Save
            </Button>
          }
        >
          <Row>
            <Field label="Seed keywords">
              <textarea
                className="input min-h-[100px] font-mono text-xs"
                value={seedKeywords}
                onChange={(e) => setSeedKeywords(e.target.value)}
                placeholder="month-end close, accrual automation, finance close software"
              />
              <Hint>The AI expands and combines these. Aim for 3-10 head terms.</Hint>
            </Field>
            <Field label="Topics / themes to avoid">
              <textarea
                className="input min-h-[100px] font-mono text-xs"
                value={topicsToAvoid}
                onChange={(e) => setTopicsToAvoid(e.target.value)}
                placeholder="cryptocurrency, personal finance, payroll"
              />
              <Hint>Anything off-strategy or misaligned with your audience.</Hint>
            </Field>
          </Row>
        </Card>

        {/* ───────────── AI providers ───────────── */}
        <Card
          icon={KeyRound}
          title="AI providers"
          description="Choose which AI generates your topics and content, and which model to use."
        >
          {/* Provider selector */}
          <Field label="Primary provider">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <ProviderOption
                value="auto"
                current={primaryProvider}
                onSelect={async () => {
                  setPrimaryProvider("auto");
                  try {
                    await updateSettings({ primaryProvider: "auto" });
                    toast("Provider set to Auto", "success");
                  } catch (err) {
                    toast((err as Error).message, "error");
                  }
                }}
                title="Auto"
                subtitle="OpenAI → Gemini → Anthropic"
                configured={
                  serverConfigured.openaiKey ||
                  serverConfigured.geminiKey ||
                  serverConfigured.anthropicKey
                }
              />
              <ProviderOption
                value="openai"
                current={primaryProvider}
                onSelect={async () => {
                  setPrimaryProvider("openai");
                  try {
                    await updateSettings({ primaryProvider: "openai" });
                    toast("Provider set to OpenAI only", "success");
                  } catch (err) {
                    toast((err as Error).message, "error");
                  }
                }}
                title="OpenAI only"
                subtitle="No fallback"
                configured={serverConfigured.openaiKey}
              />
              <ProviderOption
                value="gemini"
                current={primaryProvider}
                onSelect={async () => {
                  setPrimaryProvider("gemini");
                  try {
                    await updateSettings({ primaryProvider: "gemini" });
                    toast("Provider set to Gemini only", "success");
                  } catch (err) {
                    toast((err as Error).message, "error");
                  }
                }}
                title="Gemini only"
                subtitle="No fallback"
                configured={serverConfigured.geminiKey}
              />
              <ProviderOption
                value="anthropic"
                current={primaryProvider}
                onSelect={async () => {
                  setPrimaryProvider("anthropic");
                  try {
                    await updateSettings({ primaryProvider: "anthropic" });
                    toast("Provider set to Anthropic only", "success");
                  } catch (err) {
                    toast((err as Error).message, "error");
                  }
                }}
                title="Anthropic only"
                subtitle="Claude — no fallback"
                configured={serverConfigured.anthropicKey}
              />
            </div>
            <Hint>
              If the selected provider fails (rate limit, bad model, etc.), the
              app falls back to high-quality mock data. &quot;Auto&quot; tries
              OpenAI → Gemini → Anthropic in order, which is the right pick when
              you&apos;re hitting 429s on one provider.
            </Hint>
          </Field>

          {/* OpenAI + Gemini + Anthropic — three cards side-by-side on wide screens */}
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 mt-4">
            {/* OpenAI card */}
            <div className="rounded-md border border-ink-200 bg-ink-50/60 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-medium text-ink-700">OpenAI</div>
                {serverConfigured.openaiKey ? (
                  <Badge tone="success">
                    <CheckCircle2 className="size-3" />
                    Key set
                  </Badge>
                ) : (
                  <Badge tone="neutral">
                    <XCircle className="size-3" />
                    Key not set
                  </Badge>
                )}
              </div>
              <label className="text-xs font-medium text-ink-700 mb-2 block">
                Model
              </label>
              <ModelSelect
                value={openaiModel}
                options={OPENAI_MODELS}
                onChange={async (v) => {
                  setOpenaiModel(v);
                  if (v !== settings.openaiModel) {
                    try {
                      await updateSettings({ openaiModel: v });
                      toast(`OpenAI model set to ${v}`, "success");
                    } catch (err) {
                      toast((err as Error).message, "error");
                    }
                  }
                }}
                fallback="gpt-4o-mini"
                discoverEndpoint="/api/list-models/openai"
                providerLabel="OpenAI"
              />
              <Hint>
                Set <code>OPENAI_API_KEY</code> in Vercel env. Use{" "}
                <strong>Discover</strong> to list what your key supports.
              </Hint>
            </div>

            {/* Gemini card */}
            <div className="rounded-md border border-ink-200 bg-ink-50/60 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-medium text-ink-700">Gemini</div>
                {serverConfigured.geminiKey ? (
                  <Badge tone="success">
                    <CheckCircle2 className="size-3" />
                    Key set
                  </Badge>
                ) : (
                  <Badge tone="neutral">
                    <XCircle className="size-3" />
                    Key not set
                  </Badge>
                )}
              </div>
              <label className="text-xs font-medium text-ink-700 mb-2 block">
                Model
              </label>
              <ModelSelect
                value={geminiModel}
                options={GEMINI_MODELS}
                onChange={async (v) => {
                  setGeminiModel(v);
                  if (v !== settings.geminiModel) {
                    try {
                      await updateSettings({ geminiModel: v });
                      toast(`Gemini model set to ${v}`, "success");
                    } catch (err) {
                      toast((err as Error).message, "error");
                    }
                  }
                }}
                fallback="gemini-2.0-flash"
                discoverEndpoint="/api/list-models/gemini"
                providerLabel="Gemini"
              />
              <Hint>
                Set <code>GEMINI_API_KEY</code> in Vercel. On &quot;Model not
                available,&quot; click <strong>Discover</strong>.
              </Hint>
            </div>

            {/* Anthropic card */}
            <div className="rounded-md border border-ink-200 bg-ink-50/60 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-medium text-ink-700">
                  Anthropic
                </div>
                {serverConfigured.anthropicKey ? (
                  <Badge tone="success">
                    <CheckCircle2 className="size-3" />
                    Key set
                  </Badge>
                ) : (
                  <Badge tone="neutral">
                    <XCircle className="size-3" />
                    Key not set
                  </Badge>
                )}
              </div>
              <label className="text-xs font-medium text-ink-700 mb-2 block">
                Model
              </label>
              <ModelSelect
                value={anthropicModel}
                options={ANTHROPIC_MODELS}
                onChange={async (v) => {
                  setAnthropicModel(v);
                  if (v !== settings.anthropicModel) {
                    try {
                      await updateSettings({ anthropicModel: v });
                      toast(`Anthropic model set to ${v}`, "success");
                    } catch (err) {
                      toast((err as Error).message, "error");
                    }
                  }
                }}
                fallback="claude-haiku-4-5"
                discoverEndpoint="/api/list-models/anthropic"
                providerLabel="Anthropic"
              />
              <Hint>
                Set <code>ANTHROPIC_API_KEY</code> in Vercel env. Get one at{" "}
                console.anthropic.com → API Keys.
              </Hint>
            </div>
          </div>
        </Card>

        {/* ───────────── Slack + Server defaults side-by-side ───────────── */}
        <div className="grid lg:grid-cols-2 gap-4 mb-4">
          <Card
            icon={Send}
            title="Slack integration"
            description="Weekly Slack post via Incoming Webhook."
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-ink-700 mb-1">
                  Webhook
                </div>
                <Hint>
                  Set <code>SLACK_WEBHOOK_URL</code> in Vercel env. Create at{" "}
                  api.slack.com/messaging/webhooks.
                </Hint>
              </div>
              {serverConfigured.slackWebhook ? (
                <Badge tone="success">
                  <CheckCircle2 className="size-3" />
                  Configured
                </Badge>
              ) : (
                <Badge tone="neutral">
                  <XCircle className="size-3" />
                  Not set
                </Badge>
              )}
            </div>
            {serverConfigured.slackWebhook ? (
              <div className="flex items-center gap-2 mt-3">
                <Button
                  variant="secondary"
                  loading={testingSlack}
                  onClick={testSlack}
                >
                  <Send className="size-4" />
                  Send test message
                </Button>
              </div>
            ) : null}
          </Card>

          <Card
            title="Server-side env vars"
            description="Set in Vercel → Project → Environment Variables."
          >
            <ul className="text-base text-ink-700 grid grid-cols-2 gap-x-3 gap-y-1">
              {[
                "OPENAI_API_KEY",
                "OPENAI_MODEL",
                "GEMINI_API_KEY",
                "GEMINI_MODEL",
                "ANTHROPIC_API_KEY",
                "ANTHROPIC_MODEL",
                "SLACK_WEBHOOK_URL",
                "BRAND_COMPANY_NAME",
                "BRAND_WEBSITE_URL",
                "BRAND_NICHE",
                "BRAND_AUDIENCE",
                "BRAND_PRODUCT_DESCRIPTION",
                "BRAND_VALUE_PROPOSITION",
                "BRAND_VOICE",
                "BRAND_PRIMARY_CTA",
                "BRAND_PRIMARY_GEO",
                "BRAND_COMPETITORS",
                "BRAND_SEED_KEYWORDS",
                "BRAND_TOPICS_TO_AVOID",
                "CRON_SECRET"
              ].map((k) => (
                <li key={k}>
                  <code className="bg-ink-100 px-2 py-1 rounded text-xs truncate block">
                    {k}
                  </code>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* Shared workspace — bulk clear isn't exposed in the UI. */}
        {/* If you need to reset state, use `npm run db:push` after dropping tables. */}

        {/* Bottom padding so the last section isn't flush against the scroll edge. */}
        <div className="pb-12" />
      </div>
    </div>
  );
}

function PageHeader({
  title,
  subtitle,
  right
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="px-8 h-16 flex items-center justify-between border-b border-ink-200 bg-white shrink-0">
      <div>
        <h1 className="text-base font-semibold text-ink-900 leading-tight flex items-center gap-2">
          <KeyRound className="size-4 text-ink-500" />
          {title}
        </h1>
        {subtitle ? (
          <p className="text-xs text-ink-500 leading-tight">{subtitle}</p>
        ) : null}
      </div>
      {right}
    </div>
  );
}

function Card({
  title,
  description,
  children,
  right,
  icon: Icon
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <section className="card p-4 mb-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3">
          {Icon ? (
            <div className="size-7 rounded-md bg-ink-100 text-ink-700 grid place-items-center shrink-0 mt-1">
              <Icon className="size-4" />
            </div>
          ) : null}
          <div>
            <h2 className="text-base font-semibold text-ink-900">{title}</h2>
            {description ? (
              <p className="text-xs text-ink-500 mt-1 max-w-xl">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {right}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid sm:grid-cols-2 gap-4">{children}</div>;
}

function Field({
  label,
  badge,
  children
}: {
  label: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-medium text-ink-700">{label}</label>
        {badge}
      </div>
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-ink-500 mt-2">{children}</p>;
}

function ProviderOption({
  value,
  current,
  onSelect,
  title,
  subtitle,
  configured
}: {
  value: PrimaryProvider;
  current: PrimaryProvider;
  onSelect: () => void;
  title: string;
  subtitle: string;
  configured: boolean;
}) {
  const selected = value === current;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`text-left rounded-md border p-3 transition focus-ring ${
        selected
          ? "border-brand-500 bg-brand-50/60 ring-1 ring-brand-300"
          : "border-ink-200 bg-white hover:border-ink-300"
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-base font-medium text-ink-900">{title}</span>
        {selected ? (
          <span className="size-2 rounded-full bg-brand-600" />
        ) : (
          <span className="size-2 rounded-full border border-ink-300" />
        )}
      </div>
      <div className="text-xs text-ink-500">{subtitle}</div>
      {!configured ? (
        <div className="text-xs text-amber-700 mt-2">
          Key not configured server-side
        </div>
      ) : null}
    </button>
  );
}

interface DiscoveredModel {
  id: string;
  displayName?: string;
  description?: string;
}

function ModelSelect({
  value,
  options,
  onChange,
  fallback,
  discoverEndpoint,
  providerLabel
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (next: string) => void;
  fallback: string;
  // If provided, shows a "Discover" button that fetches the live list of
  // available models for the configured server-side API key.
  discoverEndpoint?: string;
  providerLabel?: string;
}) {
  const isKnown = options.some((o) => o.value === value);
  const showCustom = !isKnown && value !== "";
  const [customMode, setCustomMode] = useState(showCustom);

  // ── Discover panel state ──
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredModel[] | null>(null);
  const [discoverError, setDiscoverError] = useState<string | null>(null);

  async function runDiscover() {
    if (!discoverEndpoint) return;
    setDiscovering(true);
    setDiscoverError(null);
    setDiscoverOpen(true);
    try {
      const res = await fetch(discoverEndpoint);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setDiscovered(Array.isArray(data?.models) ? data.models : []);
    } catch (err) {
      setDiscoverError((err as Error).message);
      setDiscovered(null);
    } finally {
      setDiscovering(false);
    }
  }

  return (
    <div>
      <div className="flex items-stretch gap-2">
        {!customMode ? (
          <select
            className="input flex-1"
            value={isKnown ? value : ""}
            onChange={(e) => {
              const next = e.target.value;
              if (next === "__custom__") {
                setCustomMode(true);
                return;
              }
              onChange(next || fallback);
            }}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
            <option value="__custom__">Custom…</option>
          </select>
        ) : (
          <div className="flex gap-2 flex-1">
            <input
              className="input font-mono text-base flex-1"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={fallback}
              autoFocus
            />
            <button
              type="button"
              onClick={() => {
                onChange(fallback);
                setCustomMode(false);
              }}
              className="text-xs text-ink-500 hover:text-ink-800 px-2"
            >
              ← list
            </button>
          </div>
        )}
        {discoverEndpoint ? (
          <button
            type="button"
            onClick={() => {
              if (discoverOpen && discovered) {
                setDiscoverOpen(false);
              } else {
                runDiscover();
              }
            }}
            className="btn btn-secondary shrink-0"
            title={`Fetch the live list of models your ${providerLabel || "provider"} key can access`}
          >
            <Sparkles className="size-4" />
            {discoverOpen && discovered ? (
              <>
                Hide list <ChevronUp className="size-4" />
              </>
            ) : (
              <>
                Discover <ChevronDown className="size-4" />
              </>
            )}
          </button>
        ) : null}
      </div>

      {/* Discover results panel */}
      {discoverOpen ? (
        <div className="mt-2 rounded-md border border-ink-200 bg-ink-50/60 p-3 max-h-72 overflow-y-auto scrollbar-thin">
          {discovering ? (
            <div className="text-xs text-ink-500">
              Fetching available models from {providerLabel}…
            </div>
          ) : discoverError ? (
            <div className="text-xs text-rose-700">
              <div className="font-medium mb-1">Could not fetch models</div>
              <div className="text-rose-600">{discoverError}</div>
              <p className="text-ink-600 mt-2">
                Check that your{" "}
                <code>
                  {providerLabel === "OpenAI"
                    ? "OPENAI_API_KEY"
                    : providerLabel === "Anthropic"
                    ? "ANTHROPIC_API_KEY"
                    : "GEMINI_API_KEY"}
                </code>{" "}
                is set in Vercel and valid.
              </p>
            </div>
          ) : discovered && discovered.length > 0 ? (
            <>
              <div className="text-xs text-ink-500 mb-2">
                {discovered.length} model{discovered.length === 1 ? "" : "s"}{" "}
                available for your key. Click one to use it.
              </div>
              <ul className="space-y-1">
                {discovered.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-2 py-1 px-2 rounded hover:bg-white"
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-xs text-ink-900 truncate">
                        {m.id}
                      </div>
                      {m.displayName && m.displayName !== m.id ? (
                        <div className="text-xs text-ink-500 truncate">
                          {m.displayName}
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(m.id);
                        setCustomMode(true);
                        setDiscoverOpen(false);
                      }}
                      className="text-xs font-medium text-brand-700 hover:text-brand-800 px-2 py-1 rounded hover:bg-brand-50 shrink-0"
                    >
                      Use this
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="text-xs text-ink-500">
              No models returned. Your key may not be authorized for any
              generation models.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function computeCompleteness(p: {
  companyName: string;
  websiteUrl: string;
  niche: string;
  audience: string;
  productDescription: string;
  valueProposition: string;
  competitorCount: number;
}) {
  const checks = [
    Boolean(p.companyName.trim()),
    Boolean(p.websiteUrl.trim()),
    Boolean(p.niche.trim()),
    Boolean(p.audience.trim()),
    Boolean(p.productDescription.trim()),
    Boolean(p.valueProposition.trim()),
    p.competitorCount >= 1,
    p.competitorCount >= 3
  ];
  const score = checks.filter(Boolean).length / checks.length;
  return Math.round(score * 100);
}
