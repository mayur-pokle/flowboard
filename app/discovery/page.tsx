"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Telescope,
  Plus,
  ExternalLink,
  Search as SearchIcon,
  ChevronDown,
  Trash2
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/components/Toast";

interface Discovery {
  id: string;
  source: string;
  query: string;
  url: string | null;
  metrics: {
    impressions?: number;
    clicks?: number;
    ctr?: number;
    position?: number;
  } | null;
  score: number;
  status: "new" | "moved" | "dismissed";
  reason: string | null;
  movedToTaskId: string | null;
  createdAt: string;
  updatedAt: string;
}

const SOURCE_LABEL: Record<string, string> = {
  gsc: "GSC",
  semrush: "SEMrush",
  ahrefs: "Ahrefs"
};
const SOURCE_TONE: Record<
  string,
  "info" | "success" | "warn" | "neutral"
> = {
  gsc: "info",
  semrush: "warn",
  ahrefs: "success"
};

function scoreTone(score: number): "success" | "info" | "warn" | "danger" {
  if (score >= 80) return "success";
  if (score >= 60) return "info";
  if (score >= 40) return "warn";
  return "danger";
}

export default function DiscoveryPage() {
  const [items, setItems] = useState<Discovery[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [showMoved, setShowMoved] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/discoveries");
      const json = await res.json();
      setItems(json.opportunities || []);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    return items.filter((d) => {
      if (filterSource !== "all" && d.source !== filterSource) return false;
      if (!showMoved && d.status === "moved") return false;
      if (query.trim()) {
        const q = query.toLowerCase().trim();
        if (
          !(
            d.query.toLowerCase().includes(q) ||
            (d.url || "").toLowerCase().includes(q)
          )
        )
          return false;
      }
      return true;
    });
  }, [items, query, filterSource, showMoved]);

  // Group filtered rows by normalized query so the same keyword from
  // GSC + SEMrush + Ahrefs collapses into one card. Aggregate score is
  // the max of source scores plus a multi-source bonus (5 per extra
  // source, capped at 15) — multiple sources pointing to the same query
  // is a strong signal.
  const grouped = useMemo(() => {
    type Group = {
      key: string;
      query: string;
      items: Discovery[];
      score: number;
      anyMoved: boolean;
    };
    const map = new Map<string, Group>();
    for (const d of filtered) {
      const key = d.query.toLowerCase().trim();
      const existing = map.get(key);
      if (existing) {
        existing.items.push(d);
        if (d.status === "moved") existing.anyMoved = true;
      } else {
        map.set(key, {
          key,
          query: d.query,
          items: [d],
          score: 0,
          anyMoved: d.status === "moved"
        });
      }
    }
    const out = Array.from(map.values());
    for (const g of out) {
      const maxScore = Math.max(...g.items.map((i) => i.score));
      const bonus = Math.min(15, Math.max(0, g.items.length - 1) * 5);
      g.score = Math.min(100, maxScore + bonus);
    }
    out.sort((a, b) => b.score - a.score);
    return out;
  }, [filtered]);

  async function handleMove(id: string) {
    try {
      const res = await fetch(`/api/discoveries/${id}/move-to-board`, {
        method: "POST"
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      toast(
        json.alreadyMoved ? "Already on Kanban" : "Moved to Kanban",
        "success"
      );
      await load();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function handleDismiss(id: string) {
    try {
      const res = await fetch(`/api/discoveries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "dismissed" })
      });
      if (!res.ok) throw new Error("Failed");
      toast("Dismissed", "info");
      setItems((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col">
      <div className="px-8 h-16 flex items-center justify-between border-b border-ink-200 bg-white shrink-0">
        <div>
          <h1 className="text-base font-semibold text-ink-900 leading-tight flex items-center gap-2">
            <Telescope className="size-4 text-ink-500" />
            Discovery
          </h1>
          <p className="text-xs text-ink-500 leading-tight">
            Opportunities pulled from your data sources — high-impression
            low-CTR queries, page-2 rankings, competitor gaps.
          </p>
        </div>
        <Link href="/settings/sources">
          <Button variant="secondary">Manage sources</Button>
        </Link>
      </div>

      <div className="px-8 py-4 border-b border-ink-200 bg-white shrink-0 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <SearchIcon className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search query or URL"
            className="input pl-9"
          />
        </div>
        <select
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value)}
          className="input !w-auto !py-2"
        >
          <option value="all">All sources</option>
          <option value="gsc">GSC</option>
          <option value="semrush">SEMrush</option>
          <option value="ahrefs">Ahrefs</option>
        </select>
        <label className="flex items-center gap-2 text-xs text-ink-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showMoved}
            onChange={(e) => setShowMoved(e.target.checked)}
            className="size-4 accent-brand-600"
          />
          Show already-moved
        </label>
        <Badge tone="neutral">
          {grouped.length} {grouped.length === 1 ? "keyword" : "keywords"}
          {filtered.length !== grouped.length
            ? ` (${filtered.length} source rows)`
            : ""}
        </Badge>
      </div>

      <div className="flex-1 min-h-0 overflow-auto scrollbar-thin px-8 py-6">
        {loading ? (
          <div className="text-sm text-ink-500">Loading…</div>
        ) : grouped.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col gap-3 max-w-5xl">
            {grouped.map((g) => (
              <GroupedRow
                key={g.key}
                items={g.items}
                aggregateScore={g.score}
                anyMoved={g.anyMoved}
                onMove={() => {
                  // Move the highest-scored row in the group.
                  const best = [...g.items].sort(
                    (a, b) => b.score - a.score
                  )[0];
                  if (best) handleMove(best.id);
                }}
                onDismiss={async () => {
                  // Dismiss every row in the group.
                  for (const it of g.items) await handleDismiss(it.id);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Renders a grouped opportunity — the same query coming from one or more
// sources. Shows a source pill for each contributor and lists every
// source's reason line so the user can see all signals at once.
function GroupedRow({
  items,
  aggregateScore,
  anyMoved,
  onMove,
  onDismiss
}: {
  items: Discovery[];
  aggregateScore: number;
  anyMoved: boolean;
  onMove: () => void;
  onDismiss: () => void;
}) {
  const best = items.reduce((a, b) => (a.score >= b.score ? a : b));
  const sources = Array.from(new Set(items.map((i) => i.source)));

  // For metrics, use the source-specific metrics from whichever row had
  // each field. GSC has impressions/CTR/position; SEMrush + Ahrefs have
  // volume/position.
  const gscRow = items.find((i) => i.source === "gsc");
  const compRow =
    items.find((i) => i.source === "semrush") ||
    items.find((i) => i.source === "ahrefs");

  return (
    <div className="card p-4 hover:shadow-cardHover transition">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          {sources.map((s) => (
            <Badge
              key={s}
              tone={SOURCE_TONE[s] || "neutral"}
              className="uppercase tracking-wider"
            >
              {SOURCE_LABEL[s] || s}
            </Badge>
          ))}
          <Badge tone={scoreTone(aggregateScore)}>
            Score {aggregateScore}
            {items.length > 1 ? (
              <span className="ml-1 opacity-70">
                ({items.length} sources)
              </span>
            ) : null}
          </Badge>
          {anyMoved ? <Badge tone="success">Moved to Kanban</Badge> : null}
        </div>
      </div>

      <div className="font-mono text-base font-semibold text-ink-900 mb-1.5">
        {best.query}
      </div>

      {best.url ? (
        <a
          href={best.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-brand-700 hover:underline font-mono mb-2"
        >
          <ExternalLink className="size-3" />
          {best.url}
        </a>
      ) : null}

      {/* Per-source reasons */}
      <ul className="space-y-1 mb-3">
        {items.map((it) => (
          <li
            key={it.id}
            className="text-xs text-ink-600 flex items-start gap-2"
          >
            <span
              className="text-[10px] font-semibold uppercase tracking-wider text-ink-500 mt-0.5 w-16 shrink-0"
            >
              {SOURCE_LABEL[it.source] || it.source}
            </span>
            <span className="flex-1">{it.reason || "—"}</span>
          </li>
        ))}
      </ul>

      {/* Metrics grid — varies by which sources contributed */}
      {gscRow ? (
        <div className="grid grid-cols-4 gap-3 mt-3 mb-4 text-xs">
          <Metric
            label="Impressions"
            value={(gscRow.metrics as { impressions?: number } | null)?.impressions?.toLocaleString()}
          />
          <Metric
            label="Clicks"
            value={(gscRow.metrics as { clicks?: number } | null)?.clicks?.toLocaleString()}
          />
          <Metric
            label="CTR"
            value={
              (gscRow.metrics as { ctr?: number } | null)?.ctr != null
                ? `${(((gscRow.metrics as { ctr?: number } | null)?.ctr ?? 0) * 100).toFixed(1)}%`
                : "—"
            }
          />
          <Metric
            label="Position"
            value={
              (gscRow.metrics as { position?: number } | null)?.position != null
                ? ((gscRow.metrics as { position?: number } | null)!.position ?? 0).toFixed(1)
                : "—"
            }
          />
        </div>
      ) : compRow ? (
        <div className="grid grid-cols-4 gap-3 mt-3 mb-4 text-xs">
          <Metric
            label="Volume / mo"
            value={(compRow.metrics as { volume?: number } | null)?.volume?.toLocaleString()}
          />
          <Metric
            label="Competitor rank"
            value={
              (compRow.metrics as { position?: number } | null)?.position != null
                ? `#${((compRow.metrics as { position?: number } | null)!.position ?? 0).toFixed(0)}`
                : "—"
            }
          />
          <Metric
            label="KD"
            value={(compRow.metrics as { difficulty?: number } | null)?.difficulty != null
                ? String((compRow.metrics as { difficulty?: number } | null)!.difficulty)
                : "—"
            }
          />
          <Metric
            label="CPC"
            value={(compRow.metrics as { cpc?: number } | null)?.cpc != null
                ? `$${((compRow.metrics as { cpc?: number } | null)!.cpc ?? 0).toFixed(2)}`
                : "—"
            }
          />
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2 pt-3 border-t border-ink-100">
        <Button
          variant="ghost"
          onClick={onDismiss}
          className="!text-ink-400 hover:!text-rose-600"
        >
          <Trash2 className="size-4" />
          Dismiss
        </Button>
        <Button
          variant="primary"
          onClick={onMove}
          disabled={anyMoved}
        >
          <Plus className="size-4" />
          Move to Kanban
        </Button>
      </div>
    </div>
  );
}

function DiscoveryRow({
  d,
  onMove,
  onDismiss
}: {
  d: Discovery;
  onMove: () => void;
  onDismiss: () => void;
}) {
  const m = d.metrics || {};
  return (
    <div className="card p-4 hover:shadow-cardHover transition">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            tone={SOURCE_TONE[d.source] || "neutral"}
            className="uppercase tracking-wider"
          >
            {SOURCE_LABEL[d.source] || d.source}
          </Badge>
          <Badge tone={scoreTone(d.score)}>Score {d.score}</Badge>
          {d.status === "moved" ? (
            <Badge tone="success">Moved to Kanban</Badge>
          ) : null}
        </div>
        <div className="text-xs text-ink-500">{d.reason}</div>
      </div>
      <div className="font-mono text-base font-semibold text-ink-900 mb-1.5">
        {d.query}
      </div>
      {d.url ? (
        <a
          href={d.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-brand-700 hover:underline font-mono mb-2"
        >
          <ExternalLink className="size-3" />
          {d.url}
        </a>
      ) : null}
      <div className="grid grid-cols-4 gap-3 mt-3 mb-4 text-xs">
        <Metric label="Impressions" value={m.impressions?.toLocaleString()} />
        <Metric label="Clicks" value={m.clicks?.toLocaleString()} />
        <Metric
          label="CTR"
          value={m.ctr != null ? `${(m.ctr * 100).toFixed(1)}%` : "—"}
        />
        <Metric
          label="Position"
          value={m.position != null ? m.position.toFixed(1) : "—"}
        />
      </div>
      <div className="flex items-center justify-end gap-2 pt-3 border-t border-ink-100">
        <Button
          variant="ghost"
          onClick={onDismiss}
          className="!text-ink-400 hover:!text-rose-600"
        >
          <Trash2 className="size-4" />
          Dismiss
        </Button>
        <Button
          variant="primary"
          onClick={onMove}
          disabled={d.status === "moved"}
        >
          <Plus className="size-4" />
          Move to Kanban
        </Button>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-0.5">
        {label}
      </div>
      <div className="text-base font-semibold text-ink-900 tabular-nums">
        {value || "—"}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="max-w-md mx-auto text-center py-16">
      <div className="size-12 rounded-xl bg-brand-50 text-brand-600 grid place-items-center mx-auto mb-4">
        <Telescope className="size-6" />
      </div>
      <h2 className="text-xl font-semibold text-ink-900 mb-1">
        No opportunities yet
      </h2>
      <p className="text-base text-ink-600 mb-6">
        Connect Google Search Console in Settings → Data sources, then sync
        to pull your top opportunities here.
      </p>
      <Link href="/settings/sources">
        <Button variant="primary">
          <ChevronDown className="size-4" />
          Connect a source
        </Button>
      </Link>
    </div>
  );
}
