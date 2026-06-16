"use client";

import { useEffect, useState } from "react";
import {
  Plug,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Globe,
  Unplug,
  ArrowUpCircle,
  Sparkles,
  Map as MapIcon,
  Save
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/components/Toast";

interface SourceRow {
  name: string;
  status: "connected" | "disconnected" | "error";
  metadata: {
    email?: string;
    siteUrl?: string;
    // AI citations
    prompts?: string[];
    competitorDomains?: string[];
    brandTerms?: string[];
    mode?: "live" | "mock";
    // Sitemaps
    sitemapUrls?: string[];
    schedule?: string;
  } | null;
  lastError: string | null;
  lastSyncedAt: string | null;
  connectedAt: string | null;
}

interface SourcesResponse {
  sources: SourceRow[];
  serverConfigured: { gsc: boolean; encryption: boolean };
}

export default function SourcesSettingsPage() {
  const params = useSearchParams();
  const [data, setData] = useState<SourcesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [sites, setSites] = useState<
    { siteUrl: string; permissionLevel: string }[] | null
  >(null);
  const [loadingSites, setLoadingSites] = useState(false);

  // Pull state from URL after OAuth redirect.
  useEffect(() => {
    const connected = params?.get("gsc_connected");
    const error = params?.get("gsc_error");
    if (connected) toast("Google Search Console connected", "success");
    if (error) toast(`GSC connection failed: ${error}`, "error");
  }, [params]);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/sources");
      const json = (await res.json()) as SourcesResponse;
      setData(json);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const gsc = data?.sources.find((s) => s.name === "gsc");
  const gscConnected = gsc?.status === "connected";

  async function loadSites() {
    setLoadingSites(true);
    try {
      const res = await fetch("/api/sources/gsc/sites");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load sites");
      setSites(json.sites);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setLoadingSites(false);
    }
  }

  async function selectSiteAndSync(siteUrl: string) {
    setSyncing(true);
    try {
      const res = await fetch("/api/sources/gsc/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteUrl })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Sync failed");
      toast(
        `Sync complete — ${json.opportunities} opportunities (sampled ${json.sampled} rows)`,
        "success"
      );
      await refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSyncing(false);
    }
  }

  async function disconnectGsc() {
    if (
      !confirm(
        "Disconnect Google Search Console? Stored credentials will be deleted. Discovered opportunities will remain."
      )
    )
      return;
    try {
      const res = await fetch("/api/sources/gsc", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to disconnect");
      toast("GSC disconnected", "info");
      setSites(null);
      await refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col">
      <div className="px-8 h-16 flex items-center justify-between border-b border-ink-200 bg-white shrink-0">
        <div>
          <h1 className="text-base font-semibold text-ink-900 leading-tight flex items-center gap-2">
            <Plug className="size-4 text-ink-500" />
            Data sources
          </h1>
          <p className="text-xs text-ink-500 leading-tight">
            Connect external data sources to power the Discovery feed.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-auto scrollbar-thin px-8 py-6 max-w-4xl w-full">
        {loading ? (
          <div className="text-sm text-ink-500">Loading…</div>
        ) : (
          <>
            {/* Server config warnings */}
            {!data?.serverConfigured.gsc ? (
              <div className="card p-4 mb-4 border-amber-200 bg-amber-50/60 flex gap-3">
                <AlertTriangle className="size-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <div className="font-semibold text-ink-900 mb-1">
                    GSC OAuth not configured
                  </div>
                  <p className="text-ink-700">
                    Set <code>GSC_CLIENT_ID</code> and{" "}
                    <code>GSC_CLIENT_SECRET</code> in Vercel env vars. Create
                    them at console.cloud.google.com → Credentials → OAuth
                    2.0 Client ID (Web). Authorized redirect URI:{" "}
                    <code>
                      {typeof window !== "undefined"
                        ? `${window.location.origin}/api/sources/gsc/oauth/callback`
                        : "/api/sources/gsc/oauth/callback"}
                    </code>
                  </p>
                </div>
              </div>
            ) : null}
            {!data?.serverConfigured.encryption ? (
              <div className="card p-4 mb-4 border-amber-200 bg-amber-50/60 flex gap-3">
                <AlertTriangle className="size-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <div className="font-semibold text-ink-900 mb-1">
                    Encryption key not set
                  </div>
                  <p className="text-ink-700">
                    Set <code>SOURCES_ENCRYPTION_KEY</code> in Vercel env
                    vars. Generate one with:{" "}
                    <code className="font-mono text-xs">
                      node -e
                      &quot;console.log(require(&apos;crypto&apos;).randomBytes(32).toString(&apos;hex&apos;))&quot;
                    </code>
                  </p>
                </div>
              </div>
            ) : null}

            {/* GSC card */}
            <SourceCard
              icon={<Globe className="size-5 text-brand-600" />}
              title="Google Search Console"
              description="Pulls real query performance — impressions, clicks, position, CTR — and surfaces high-leverage opportunities."
              status={gsc?.status || "disconnected"}
              lastError={gsc?.lastError}
              lastSyncedAt={gsc?.lastSyncedAt}
            >
              {gscConnected ? (
                <>
                  <div className="text-xs text-ink-600 mb-3">
                    Connected as{" "}
                    <span className="font-medium text-ink-900">
                      {gsc?.metadata?.email || "unknown"}
                    </span>
                    {gsc?.metadata?.siteUrl ? (
                      <>
                        {" "}· Active property:{" "}
                        <span className="font-mono text-xs">
                          {gsc.metadata.siteUrl}
                        </span>
                      </>
                    ) : null}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant="secondary"
                      onClick={loadSites}
                      loading={loadingSites}
                    >
                      <RefreshCw className="size-4" />
                      {gsc?.metadata?.siteUrl ? "Change property" : "Pick property"}
                    </Button>
                    {gsc?.metadata?.siteUrl ? (
                      <Button
                        variant="primary"
                        onClick={() =>
                          selectSiteAndSync(gsc.metadata!.siteUrl!)
                        }
                        loading={syncing}
                      >
                        <RefreshCw className="size-4" />
                        Sync now
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      onClick={disconnectGsc}
                      className="!text-rose-600 hover:!bg-rose-50"
                    >
                      <Unplug className="size-4" />
                      Disconnect
                    </Button>
                  </div>

                  {/* Sites picker */}
                  {sites ? (
                    <div className="mt-4 border-t border-ink-100 pt-4">
                      <div className="text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
                        Your Search Console properties
                      </div>
                      <ul className="space-y-1">
                        {sites.length === 0 ? (
                          <li className="text-xs text-ink-500 italic">
                            No properties found. Make sure this account has
                            verified at least one site in Search Console.
                          </li>
                        ) : (
                          sites.map((s) => (
                            <li
                              key={s.siteUrl}
                              className="flex items-center justify-between gap-2 px-3 py-2 rounded border border-ink-200 hover:bg-ink-50"
                            >
                              <div className="min-w-0">
                                <div className="font-mono text-xs text-ink-900 truncate">
                                  {s.siteUrl}
                                </div>
                                <div className="text-[11px] text-ink-500">
                                  {s.permissionLevel}
                                </div>
                              </div>
                              <Button
                                variant="primary"
                                onClick={() => selectSiteAndSync(s.siteUrl)}
                                loading={syncing}
                                className="!py-1 !px-3"
                              >
                                Sync this
                              </Button>
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                  ) : null}
                </>
              ) : (
                <a
                  href="/api/sources/gsc/oauth/start"
                  className="btn btn-primary inline-flex"
                >
                  <ExternalLink className="size-4" />
                  Connect Google Search Console
                </a>
              )}
            </SourceCard>

            {/* SEMrush */}
            <KeyAuthSourceCard
              icon={<Globe className="size-5 text-amber-600" />}
              title="SEMrush"
              description="Pulls top organic keywords for your competitors (uses Settings → Brand → Competitors). Scored by volume × achievability."
              source="semrush"
              row={data?.sources.find((s) => s.name === "semrush")}
              regionField={{
                label: "Database",
                placeholder: "us",
                options: [
                  { value: "us", label: "United States (us)" },
                  { value: "uk", label: "United Kingdom (uk)" },
                  { value: "in", label: "India (in)" },
                  { value: "ca", label: "Canada (ca)" },
                  { value: "au", label: "Australia (au)" },
                  { value: "de", label: "Germany (de)" },
                  { value: "fr", label: "France (fr)" }
                ]
              }}
              onRefresh={refresh}
            />

            {/* Refresh detector */}
            <RefreshDetectorCard
              row={data?.sources.find((s) => s.name === "refresh")}
              gscConnected={gscConnected}
              gscHasSite={Boolean(gsc?.metadata?.siteUrl)}
              onRefresh={refresh}
            />

            {/* Ahrefs */}
            <KeyAuthSourceCard
              icon={<Globe className="size-5 text-emerald-600" />}
              title="Ahrefs"
              description="Pulls organic keyword rankings for your competitors via Ahrefs Site Explorer (v3 API). Requires a paid Ahrefs API plan."
              source="ahrefs"
              row={data?.sources.find((s) => s.name === "ahrefs")}
              regionField={{
                label: "Country",
                placeholder: "us",
                options: [
                  { value: "us", label: "United States (us)" },
                  { value: "uk", label: "United Kingdom (uk)" },
                  { value: "in", label: "India (in)" },
                  { value: "ca", label: "Canada (ca)" },
                  { value: "au", label: "Australia (au)" },
                  { value: "de", label: "Germany (de)" },
                  { value: "fr", label: "France (fr)" }
                ]
              }}
              onRefresh={refresh}
            />

            {/* AI Citations Tracker */}
            <AiCitationsCard
              row={data?.sources.find((s) => s.name === "ai-citations")}
              onRefresh={refresh}
            />

            {/* Competitor Sitemaps */}
            <CompetitorSitemapsCard
              row={data?.sources.find((s) => s.name === "competitor-sitemap")}
              onRefresh={refresh}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ── RefreshDetectorCard ───────────────────────────────────────────────
// No external credentials — uses the already-connected GSC + the
// Content Library. Disabled until both prerequisites are in place.

function RefreshDetectorCard({
  row,
  gscConnected,
  gscHasSite,
  onRefresh
}: {
  row?: SourceRow;
  gscConnected: boolean;
  gscHasSite: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [syncing, setSyncing] = useState(false);
  const ready = gscConnected && gscHasSite;

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/sources/refresh/sync", {
        method: "POST"
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Refresh sync failed");
      }
      toast(
        `Refresh scan complete — ${json.candidates} candidate${
          json.candidates === 1 ? "" : "s"
        } (checked ${json.pagesChecked} pages)`,
        json.candidates > 0 ? "success" : "info"
      );
      await onRefresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <SourceCard
      icon={<ArrowUpCircle className="size-5 text-rose-600" />}
      title="Refresh detector"
      description="Joins Content Library with GSC page-level data to flag pages whose rank dropped, lost top-5, are stale, or under-perform CTR for their position. No external credentials needed."
      status={row?.status || "disconnected"}
      lastError={row?.lastError}
      lastSyncedAt={row?.lastSyncedAt}
    >
      {!ready ? (
        <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-900">
          <AlertTriangle className="size-4 text-amber-600 inline mr-1 mb-1" />
          {!gscConnected
            ? "Connect Google Search Console first."
            : "Pick a GSC property in the GSC card above."}{" "}
          Also make sure your Content Library has pages in it (Settings →
          Content library).
        </div>
      ) : (
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="primary"
            onClick={handleSync}
            loading={syncing}
          >
            <RefreshCw className="size-4" />
            Run refresh scan
          </Button>
          <div className="text-xs text-ink-500 self-center">
            Compares last 28d vs previous 28d for every page in your
            Content Library.
          </div>
        </div>
      )}
    </SourceCard>
  );
}

// ── KeyAuthSourceCard ─────────────────────────────────────────────────
// Card for API-key-auth sources (SEMrush, Ahrefs). When disconnected:
// shows API key paste field + region/database picker + Test + Connect
// buttons. When connected: shows current config + Sync + Disconnect.

function KeyAuthSourceCard({
  icon,
  title,
  description,
  source,
  row,
  regionField,
  onRefresh
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  source: "semrush" | "ahrefs";
  row?: SourceRow;
  regionField: {
    label: string;
    placeholder: string;
    options: { value: string; label: string }[];
  };
  onRefresh: () => Promise<void>;
}) {
  const connected = row?.status === "connected";
  const [apiKey, setApiKey] = useState("");
  const [region, setRegion] = useState(regionField.placeholder);
  const [testing, setTesting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Body key matches the lib client interface — region maps to
  // `database` for SEMrush and `country` for Ahrefs.
  const regionKey = source === "semrush" ? "database" : "country";

  async function handleTest() {
    if (!apiKey.trim()) {
      toast("Paste an API key first", "error");
      return;
    }
    setTesting(true);
    try {
      const res = await fetch(`/api/sources/${source}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, [regionKey]: region })
      });
      const json = await res.json();
      if (json.ok) {
        toast(`${title} key is valid`, "success");
      } else {
        toast(json.message || "Connection test failed", "error");
      }
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setTesting(false);
    }
  }

  async function handleConnect() {
    if (!apiKey.trim()) {
      toast("Paste an API key first", "error");
      return;
    }
    setConnecting(true);
    try {
      const res = await fetch(`/api/sources/${source}/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, [regionKey]: region })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Connect failed");
      toast(`${title} connected`, "success");
      setApiKey("");
      await onRefresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setConnecting(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch(`/api/sources/${source}/sync`, {
        method: "POST"
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Sync failed");
      const errs = (json.errors as string[]) || [];
      toast(
        `Sync complete — ${json.opportunities} opportunities (sampled ${
          json.sampled
        } across ${json.competitorsProcessed} competitors)${
          errs.length ? `, ${errs.length} errors` : ""
        }`,
        errs.length ? "info" : "success"
      );
      await onRefresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    if (
      !confirm(
        `Disconnect ${title}? Stored API key will be deleted. Discovered opportunities will remain.`
      )
    )
      return;
    try {
      const res = await fetch(`/api/sources/${source}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error("Failed to disconnect");
      toast(`${title} disconnected`, "info");
      await onRefresh();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  const meta = (row?.metadata as { database?: string; country?: string } | null) || null;
  const activeRegion = meta?.database || meta?.country || "—";

  return (
    <SourceCard
      icon={icon}
      title={title}
      description={description}
      status={row?.status || "disconnected"}
      lastError={row?.lastError}
      lastSyncedAt={row?.lastSyncedAt}
    >
      {connected ? (
        <>
          <div className="text-xs text-ink-600 mb-3">
            Active {regionField.label.toLowerCase()}:{" "}
            <span className="font-mono text-xs">{activeRegion}</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="primary"
              onClick={handleSync}
              loading={syncing}
            >
              <RefreshCw className="size-4" />
              Sync now
            </Button>
            <Button
              variant="ghost"
              onClick={handleDisconnect}
              className="!text-rose-600 hover:!bg-rose-50"
            >
              <Unplug className="size-4" />
              Disconnect
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="grid sm:grid-cols-[1fr_160px] gap-2 mb-3">
            <input
              type="password"
              className="input text-sm font-mono"
              placeholder="Paste API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <select
              className="input text-sm"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            >
              {regionField.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="secondary"
              onClick={handleTest}
              loading={testing}
              disabled={!apiKey.trim()}
            >
              Test
            </Button>
            <Button
              variant="primary"
              onClick={handleConnect}
              loading={connecting}
              disabled={!apiKey.trim()}
            >
              Connect
            </Button>
          </div>
          <div className="text-[11px] text-ink-500 mt-3">
            Test verifies the key without storing it. Connect encrypts and
            saves it. SEMrush charges per API row; Ahrefs charges per
            request — syncs are capped at 50 keywords per competitor.
          </div>
        </>
      )}
    </SourceCard>
  );
}

// ── AI Citations Tracker ──────────────────────────────────────────────
// Mock-first by default. Captures prompts to monitor, competitor
// domains to watch, brand terms to look for, and an optional API key.
// Without a key, runs in mock mode against synthetic citation data.

function AiCitationsCard({
  row,
  onRefresh
}: {
  row?: SourceRow;
  onRefresh: () => void;
}) {
  const status = row?.status || "disconnected";
  const meta = row?.metadata || {};
  const [prompts, setPrompts] = useState(
    (meta.prompts || []).join("\n")
  );
  const [competitorDomains, setCompetitorDomains] = useState(
    (meta.competitorDomains || []).join(", ")
  );
  const [brandTerms, setBrandTerms] = useState(
    (meta.brandTerms || []).join(", ")
  );
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setPrompts((row?.metadata?.prompts || []).join("\n"));
    setCompetitorDomains(
      (row?.metadata?.competitorDomains || []).join(", ")
    );
    setBrandTerms((row?.metadata?.brandTerms || []).join(", "));
  }, [row?.metadata]);

  async function save() {
    setSaving(true);
    try {
      const body = {
        prompts: prompts.split("\n").map((s) => s.trim()).filter(Boolean),
        competitorDomains: competitorDomains
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        brandTerms: brandTerms
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        apiKey: apiKey || undefined
      };
      const res = await fetch("/api/sources/ai-citations/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      toast(
        json.mode === "live"
          ? "Connected (live mode)"
          : "Saved (mock mode — add an API key for live citation checks)",
        "success"
      );
      setApiKey("");
      onRefresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function sync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/sources/ai-citations/sync", {
        method: "POST"
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Sync failed");
      toast(
        `Sync complete · ${json.opportunities} opportunities · mode: ${json.mode}`,
        "success"
      );
      onRefresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <SourceCard
      icon={<Sparkles className="size-5 text-[#4A4DC9]" />}
      title="AI Citations Tracker"
      description="Tracks whether AI engines (Perplexity, ChatGPT, Google AI Overviews) cite competitors but not your brand for prompts you care about. Defaults to mock mode — add an API key for live checks."
      status={status}
      lastError={row?.lastError}
      lastSyncedAt={row?.lastSyncedAt}
    >
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-ink-700 mb-1 block">
            Prompts to monitor (one per line)
          </label>
          <textarea
            value={prompts}
            onChange={(e) => setPrompts(e.target.value)}
            placeholder={"What is runway in startups?\nBest cash flow forecasting software\nStripe vs Chargebee for SaaS"}
            rows={4}
            className="input !text-xs leading-relaxed font-mono min-h-[96px]"
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-ink-700 mb-1 block">
              Competitor domains (comma-separated)
            </label>
            <input
              type="text"
              value={competitorDomains}
              onChange={(e) => setCompetitorDomains(e.target.value)}
              placeholder="competitor-a.com, competitor-b.com"
              className="input !text-xs"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-700 mb-1 block">
              Brand terms (comma-separated)
            </label>
            <input
              type="text"
              value={brandTerms}
              onChange={(e) => setBrandTerms(e.target.value)}
              placeholder="My Company, mycompany.com, MyProduct"
              className="input !text-xs"
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-ink-700 mb-1 block">
            Provider API key{" "}
            <span className="text-ink-400 font-normal">
              (optional — leave blank for mock mode)
            </span>
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-…"
            className="input !text-xs font-mono"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={save} loading={saving}>
            <Save className="size-4" />
            Save
          </Button>
          <Button
            variant="secondary"
            onClick={sync}
            loading={syncing}
            disabled={status !== "connected"}
          >
            <RefreshCw className="size-4" />
            Sync now
          </Button>
          <span className="text-[11px] text-ink-500 ml-2">
            Mode:{" "}
            <strong>
              {meta.mode === "live" ? "Live" : "Mock"}
            </strong>
          </span>
        </div>
      </div>
    </SourceCard>
  );
}

// ── Competitor Sitemaps ──────────────────────────────────────────────
// One textarea of sitemap URLs. Weekly cron will fetch + parse.

function CompetitorSitemapsCard({
  row,
  onRefresh
}: {
  row?: SourceRow;
  onRefresh: () => void;
}) {
  const status = row?.status || "disconnected";
  const meta = row?.metadata || {};
  const [sitemapUrls, setSitemapUrls] = useState(
    (meta.sitemapUrls || []).join("\n")
  );
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setSitemapUrls((row?.metadata?.sitemapUrls || []).join("\n"));
  }, [row?.metadata]);

  async function save() {
    setSaving(true);
    try {
      const body = {
        sitemapUrls: sitemapUrls
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)
      };
      const res = await fetch("/api/sources/competitor-sitemaps/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      toast(`Saved · ${json.count} sitemap${json.count === 1 ? "" : "s"}`, "success");
      onRefresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function sync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/sources/competitor-sitemaps/sync", {
        method: "POST"
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Sync failed");
      toast(
        `Sync complete · ${json.opportunities} opportunities from ${json.sampled} URLs`,
        "success"
      );
      onRefresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <SourceCard
      icon={<MapIcon className="size-5 text-ink-700" />}
      title="Competitor Sitemaps"
      description="Polls competitor sitemaps weekly to surface new content as Community opportunities. Standard XML sitemap format, one URL per line."
      status={status}
      lastError={row?.lastError}
      lastSyncedAt={row?.lastSyncedAt}
    >
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-ink-700 mb-1 block">
            Sitemap URLs (one per line)
          </label>
          <textarea
            value={sitemapUrls}
            onChange={(e) => setSitemapUrls(e.target.value)}
            placeholder={"https://competitor-a.com/sitemap.xml\nhttps://competitor-b.com/sitemap_index.xml"}
            rows={4}
            className="input !text-xs leading-relaxed font-mono min-h-[96px]"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={save} loading={saving}>
            <Save className="size-4" />
            Save
          </Button>
          <Button
            variant="secondary"
            onClick={sync}
            loading={syncing}
            disabled={status !== "connected"}
          >
            <RefreshCw className="size-4" />
            Sync now
          </Button>
        </div>
      </div>
    </SourceCard>
  );
}

function SourceCard({
  icon,
  title,
  description,
  status,
  lastError,
  lastSyncedAt,
  comingSoon,
  children
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  status: string;
  lastError?: string | null;
  lastSyncedAt?: string | null;
  comingSoon?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section className="card p-5 mb-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3">
          <div className="size-9 rounded-md bg-ink-100 grid place-items-center shrink-0">
            {icon}
          </div>
          <div>
            <h2 className="text-base font-semibold text-ink-900">{title}</h2>
            <p className="text-xs text-ink-500 mt-0.5 max-w-xl">
              {description}
            </p>
          </div>
        </div>
        {comingSoon ? (
          <Badge tone="neutral">Coming soon</Badge>
        ) : status === "connected" ? (
          <Badge tone="success">
            <CheckCircle2 className="size-3" />
            Connected
          </Badge>
        ) : status === "error" ? (
          <Badge tone="danger">
            <AlertTriangle className="size-3" />
            Error
          </Badge>
        ) : (
          <Badge tone="neutral">
            <XCircle className="size-3" />
            Not connected
          </Badge>
        )}
      </div>
      {lastError ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 mb-3">
          <span className="font-semibold">Last error: </span>
          {lastError}
        </div>
      ) : null}
      {lastSyncedAt ? (
        <div className="text-[11px] text-ink-500 mb-3">
          Last synced {new Date(lastSyncedAt).toLocaleString()}
        </div>
      ) : null}
      {children}
    </section>
  );
}
