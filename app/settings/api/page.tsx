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
  AlertTriangle
} from "lucide-react";
import { useStore, useHasHydrated } from "@/lib/store";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/components/Toast";
import type { PrimaryProvider } from "@/lib/types";

// Curated model lists shown in dropdowns. Users can still type a custom
// model name via the "Custom…" option if their account supports a model
// that isn't in this list.
const OPENAI_MODELS = [
  { value: "gpt-4o-mini", label: "GPT-4o mini — fast, cheap (recommended)" },
  { value: "gpt-4o", label: "GPT-4o — best quality, higher cost" },
  { value: "gpt-4.1-mini", label: "GPT-4.1 mini" },
  { value: "gpt-4.1", label: "GPT-4.1 — high quality" },
  { value: "o4-mini", label: "o4 mini — reasoning model" },
  { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo — legacy" }
];

const GEMINI_MODELS = [
  { value: "gemini-1.5-flash-latest", label: "Gemini 1.5 Flash (latest) — fast, free tier" },
  { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
  { value: "gemini-1.5-flash-002", label: "Gemini 1.5 Flash 002" },
  { value: "gemini-1.5-pro-latest", label: "Gemini 1.5 Pro (latest) — higher quality" },
  { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
  { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  { value: "gemini-2.0-flash-exp", label: "Gemini 2.0 Flash (experimental)" },
  { value: "gemini-flash-latest", label: "Gemini Flash (latest alias)" }
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

  useEffect(() => {
    if (!hydrated) return;
    setOpenaiModel(settings.openaiModel);
    setGeminiModel(settings.geminiModel);
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

  async function save() {
    try {
      await updateSettings({
        openaiModel: openaiModel.trim() || "gpt-4o-mini",
        geminiModel: geminiModel.trim() || "gemini-1.5-flash-latest",
        primaryProvider,
        companyName: companyName.trim(),
        websiteUrl: websiteUrl.trim(),
        brandNiche: niche.trim(),
        brandAudience: audience.trim(),
        productDescription: productDescription.trim(),
        valueProposition: valueProposition.trim(),
        brandVoice: brandVoice.trim(),
        primaryCta: primaryCta.trim(),
        primaryGeo: primaryGeo.trim(),
        seedKeywords: seedKeywords.trim(),
        topicsToAvoid: topicsToAvoid.trim()
      });
      toast("Settings saved", "success");
    } catch (err) {
      toast((err as Error).message, "error");
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
      await addCompetitor({ name, url, notes });
      setNewCompetitorName("");
      setNewCompetitorUrl("");
      setNewCompetitorNotes("");
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
    <div className="flex-1 min-w-0 flex flex-col">
      <PageHeader
        title="API & Integrations"
        subtitle="Brand context, competitors, AI keys, and Slack — all stored in your browser."
        right={
          <Badge tone={profileCompleteness >= 70 ? "success" : "warn"}>
            Profile {profileCompleteness}% complete
          </Badge>
        }
      />

      <div className="flex-1 overflow-auto scrollbar-thin px-8 py-6 max-w-3xl">
        {profileCompleteness < 50 ? (
          <div className="card p-4 mb-5 border-amber-200 bg-amber-50/60 flex gap-3">
            <AlertTriangle className="size-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-ink-900">
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
                  <div className="grid sm:grid-cols-[1fr_1fr_2fr] gap-2">
                    <input
                      className="input !py-1.5 text-sm"
                      value={c.name}
                      onChange={(e) =>
                        updateCompetitor(c.id, { name: e.target.value })
                      }
                      placeholder="Name"
                    />
                    <input
                      className="input !py-1.5 text-sm font-mono"
                      value={c.url}
                      onChange={(e) =>
                        updateCompetitor(c.id, { url: e.target.value })
                      }
                      placeholder="https://…"
                    />
                    <input
                      className="input !py-1.5 text-sm"
                      value={c.notes}
                      onChange={(e) =>
                        updateCompetitor(c.id, { notes: e.target.value })
                      }
                      placeholder="Why we win/lose against them"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    {c.url ? (
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-ink-400 hover:text-ink-700 rounded"
                        aria-label="Visit website"
                      >
                        <ExternalLink className="size-4" />
                      </a>
                    ) : null}
                    <button
                      onClick={() => removeCompetitor(c.id)}
                      className="p-1.5 text-ink-400 hover:text-rose-600 rounded"
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
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-2">
              Add competitor
            </div>
            <div className="grid sm:grid-cols-[1fr_1fr_2fr_auto] gap-2">
              <input
                className="input !py-1.5 text-sm"
                value={newCompetitorName}
                onChange={(e) => setNewCompetitorName(e.target.value)}
                placeholder="Numeric"
              />
              <input
                className="input !py-1.5 text-sm font-mono"
                value={newCompetitorUrl}
                onChange={(e) => setNewCompetitorUrl(e.target.value)}
                placeholder="https://numeric.io"
              />
              <input
                className="input !py-1.5 text-sm"
                value={newCompetitorNotes}
                onChange={(e) => setNewCompetitorNotes(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddCompetitor();
                }}
                placeholder="Strong on close automation; weak on FP&A."
              />
              <Button variant="primary" onClick={handleAddCompetitor}>
                <Plus className="size-4" />
                Add
              </Button>
            </div>
          </div>
        </Card>

        {/* ───────────── SEO seed ───────────── */}
        <Card
          icon={Search}
          title="SEO seed"
          description="Optional starter keywords and topics to avoid. Comma- or newline-separated."
        >
          <Field label="Seed keywords">
            <textarea
              className="input min-h-[64px] font-mono text-xs"
              value={seedKeywords}
              onChange={(e) => setSeedKeywords(e.target.value)}
              placeholder="month-end close, accrual automation, finance close software"
            />
            <Hint>The AI expands and combines these. Aim for 3-10 head terms.</Hint>
          </Field>
          <Field label="Topics / themes to avoid">
            <textarea
              className="input min-h-[64px] font-mono text-xs"
              value={topicsToAvoid}
              onChange={(e) => setTopicsToAvoid(e.target.value)}
              placeholder="cryptocurrency, personal finance, payroll"
            />
            <Hint>Anything off-strategy or misaligned with your audience.</Hint>
          </Field>
        </Card>

        {/* ───────────── AI providers ───────────── */}
        <Card
          icon={KeyRound}
          title="AI providers"
          description="Choose which AI generates your topics and content, and which model to use."
        >
          {/* Provider selector */}
          <Field label="Primary provider">
            <div className="grid sm:grid-cols-3 gap-2">
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
                subtitle="OpenAI, fall back to Gemini"
                configured={
                  serverConfigured.openaiKey || serverConfigured.geminiKey
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
            </div>
            <Hint>
              If the selected provider fails (rate limit, bad model, etc.), the
              app falls back to high-quality mock data. "Auto" tries OpenAI first
              then Gemini.
            </Hint>
          </Field>

          {/* OpenAI card */}
          <div className="rounded-md border border-ink-200 bg-ink-50/60 p-3 mt-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium text-ink-700">OpenAI</div>
              {serverConfigured.openaiKey ? (
                <Badge tone="success">
                  <CheckCircle2 className="size-3" />
                  Key configured
                </Badge>
              ) : (
                <Badge tone="neutral">
                  <XCircle className="size-3" />
                  Key not set
                </Badge>
              )}
            </div>
            <label className="text-xs font-medium text-ink-700 mb-1.5 block">
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
            />
            <Hint>
              Set <code>OPENAI_API_KEY</code> in Vercel → Project → Environment
              Variables to enable.
            </Hint>
          </div>

          {/* Gemini card */}
          <div className="rounded-md border border-ink-200 bg-ink-50/60 p-3 mt-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium text-ink-700">Gemini</div>
              {serverConfigured.geminiKey ? (
                <Badge tone="success">
                  <CheckCircle2 className="size-3" />
                  Key configured
                </Badge>
              ) : (
                <Badge tone="neutral">
                  <XCircle className="size-3" />
                  Key not set
                </Badge>
              )}
            </div>
            <label className="text-xs font-medium text-ink-700 mb-1.5 block">
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
              fallback="gemini-1.5-flash-latest"
            />
            <Hint>
              Set <code>GEMINI_API_KEY</code> in Vercel. If you see "Model not
              available," try a different model — availability varies by
              account region.
            </Hint>
          </div>
        </Card>

        {/* ───────────── Slack ───────────── */}
        <Card
          icon={Send}
          title="Slack integration"
          description="The weekly Slack post is sent server-side using your workspace's Incoming Webhook."
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-medium text-ink-700 mb-0.5">
                Webhook
              </div>
              <Hint>
                Set <code>SLACK_WEBHOOK_URL</code> in Vercel → Project →
                Environment Variables. Create the webhook at{" "}
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
                Not configured
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

        {/* ───────────── Server defaults ───────────── */}
        <Card
          title="Server-side defaults"
          description="These take priority over keys saved here. Set them in your hosting provider for production."
        >
          <ul className="text-sm text-ink-700 grid sm:grid-cols-2 gap-x-4 gap-y-1.5">
            {[
              "OPENAI_API_KEY",
              "OPENAI_MODEL",
              "GEMINI_API_KEY",
              "GEMINI_MODEL",
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
                <code className="bg-ink-100 px-1.5 py-0.5 rounded text-[11px]">
                  {k}
                </code>
              </li>
            ))}
          </ul>
        </Card>

        {/* Shared workspace — bulk clear isn't exposed in the UI. */}
        {/* If you need to reset state, use `npm run db:push` after dropping tables. */}

        <div className="sticky bottom-4 flex justify-end pt-2 pb-12">
          <Button
            variant="primary"
            onClick={save}
            className="shadow-cardHover"
          >
            <Save className="size-4" />
            Save changes
          </Button>
        </div>
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
    <div className="px-8 h-16 flex items-center justify-between border-b border-ink-200 bg-white">
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
    <section className="card p-5 mb-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3">
          {Icon ? (
            <div className="size-8 rounded-md bg-ink-100 text-ink-700 grid place-items-center shrink-0 mt-0.5">
              <Icon className="size-4" />
            </div>
          ) : null}
          <div>
            <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
            {description ? (
              <p className="text-xs text-ink-500 mt-0.5 max-w-xl">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {right}
      </div>
      <div className="space-y-4">{children}</div>
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
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-medium text-ink-700">{label}</label>
        {badge}
      </div>
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-ink-500 mt-1.5">{children}</p>;
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
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-sm font-medium text-ink-900">{title}</span>
        {selected ? (
          <span className="size-2 rounded-full bg-brand-600" />
        ) : (
          <span className="size-2 rounded-full border border-ink-300" />
        )}
      </div>
      <div className="text-[11px] text-ink-500">{subtitle}</div>
      {!configured ? (
        <div className="text-[10px] text-amber-700 mt-1.5">
          Key not configured server-side
        </div>
      ) : null}
    </button>
  );
}

function ModelSelect({
  value,
  options,
  onChange,
  fallback
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (next: string) => void;
  fallback: string;
}) {
  const isKnown = options.some((o) => o.value === value);
  const showCustom = !isKnown && value !== "";
  const [customMode, setCustomMode] = useState(showCustom);

  return (
    <div>
      {!customMode ? (
        <select
          className="input"
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
        <div className="flex gap-2">
          <input
            className="input font-mono text-sm"
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
