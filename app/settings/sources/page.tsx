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
  Unplug
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/components/Toast";

interface SourceRow {
  name: string;
  status: "connected" | "disconnected" | "error";
  metadata: { email?: string; siteUrl?: string } | null;
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
          </>
        )}
      </div>
    </div>
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
