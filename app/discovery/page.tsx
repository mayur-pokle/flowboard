"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Telescope,
  ExternalLink,
  Search as SearchIcon,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ArrowRight,
  X
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/components/Toast";
import { Breadcrumb } from "@/components/discovery/Breadcrumb";
import {
  scoreTone,
  SCORE_TONE_CLASSES,
  SOURCE_LABEL,
  SOURCE_TONE,
  INTENT_LABEL,
  INTENT_BADGE_CLASS,
  AI_CITATION_BADGE_CLASS,
  STATUS_LABEL,
  STATUS_OPTIONS
} from "@/components/discovery/tokens";
import type { Intent, ScoreBreakdown } from "@/lib/opportunity-classifier";
import { cn } from "@/lib/utils";

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
    volume?: number;
    difficulty?: number;
  } | null;
  score: number;
  scoreBreakdown: ScoreBreakdown | null;
  intent: Intent | null;
  aiCitationGap: boolean;
  status: string;
  reason: string | null;
  linkedTaskId: string | null;
  briefGeneratedAt: string | null;
  contentGeneratedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// Pill-style filter. "Additive" means the user clicks toggles, no form
// modal. Most users want 1-2 filters at a time per the spec.
type Filter =
  | { kind: "source"; value: string }
  | { kind: "intent"; value: Intent }
  | { kind: "citationGap" }
  | { kind: "scoreMin"; value: number };

const SOURCE_PILLS: Array<{ value: string; label: string }> = [
  { value: "gsc", label: "GSC" },
  { value: "semrush", label: "SEMrush" },
  { value: "ahrefs", label: "Ahrefs" },
  { value: "refresh", label: "Refresh" }
];
const INTENT_PILLS: Intent[] = [
  "commercial",
  "informational",
  "transactional"
];

export default function OpportunitiesBoardPage() {
  const [items, setItems] = useState<Discovery[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filter[]>([]);

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

  function toggleFilter(f: Filter) {
    setFilters((prev) => {
      const exists = prev.findIndex(
        (p) =>
          p.kind === f.kind &&
          (("value" in p && "value" in f && p.value === f.value) ||
            (p.kind === "citationGap" && f.kind === "citationGap"))
      );
      if (exists >= 0) return prev.filter((_, i) => i !== exists);
      return [...prev, f];
    });
  }
  function hasFilter(f: Filter): boolean {
    return filters.some(
      (p) =>
        p.kind === f.kind &&
        (("value" in p && "value" in f && p.value === f.value) ||
          (p.kind === "citationGap" && f.kind === "citationGap"))
    );
  }

  const visible = useMemo(() => {
    return items.filter((d) => {
      for (const f of filters) {
        if (f.kind === "source" && d.source !== f.value) return false;
        if (f.kind === "intent" && d.intent !== f.value) return false;
        if (f.kind === "citationGap" && !d.aiCitationGap) return false;
        if (f.kind === "scoreMin" && d.score < f.value) return false;
      }
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
  }, [items, query, filters]);

  async function updateStatus(id: string, status: string) {
    // Optimistic
    setItems((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status } : d))
    );
    try {
      const res = await fetch(`/api/discoveries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error("Failed");
      toast(`Status updated to ${STATUS_LABEL[status] || status}`, "success");
    } catch (err) {
      toast((err as Error).message, "error");
      await load(); // resync
    }
  }

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col">
      <div className="px-8 py-4 border-b border-ink-200 bg-white shrink-0">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Telescope className="size-4 text-ink-500" />
              <h1 className="text-base font-semibold text-ink-900 leading-tight">
                Opportunities
              </h1>
            </div>
            <p className="text-xs text-ink-500 leading-tight max-w-2xl">
              Pulled from your data sources. Score breakdown tells you why each
              row earned its rank. Click any opportunity to draft a brief.
            </p>
          </div>
          <Breadcrumb current="opportunities" />
        </div>

        <div className="flex items-center gap-3 flex-wrap mt-3">
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
          <Link href="/settings/sources">
            <Button variant="secondary">Manage sources</Button>
          </Link>
        </div>

        {/* Additive pill filter row */}
        <div className="flex items-center gap-2 flex-wrap mt-4">
          <span className="text-[10px] uppercase tracking-wider text-ink-500 mr-1">
            Filter
          </span>
          {SOURCE_PILLS.map((s) => (
            <FilterPill
              key={`src-${s.value}`}
              active={hasFilter({ kind: "source", value: s.value })}
              onToggle={() => toggleFilter({ kind: "source", value: s.value })}
            >
              {s.label}
            </FilterPill>
          ))}
          <span className="h-4 w-px bg-ink-200 mx-1" aria-hidden />
          {INTENT_PILLS.map((i) => (
            <FilterPill
              key={`int-${i}`}
              active={hasFilter({ kind: "intent", value: i })}
              onToggle={() => toggleFilter({ kind: "intent", value: i })}
            >
              {INTENT_LABEL[i]}
            </FilterPill>
          ))}
          <span className="h-4 w-px bg-ink-200 mx-1" aria-hidden />
          <FilterPill
            active={hasFilter({ kind: "citationGap" })}
            onToggle={() => toggleFilter({ kind: "citationGap" })}
            tone="aeo"
          >
            <Sparkles className="size-3" />
            AI citation gap
          </FilterPill>
          <span className="h-4 w-px bg-ink-200 mx-1" aria-hidden />
          <FilterPill
            active={hasFilter({ kind: "scoreMin", value: 75 })}
            onToggle={() => toggleFilter({ kind: "scoreMin", value: 75 })}
          >
            High score (75+)
          </FilterPill>
          {filters.length > 0 ? (
            <button
              onClick={() => setFilters([])}
              className="text-xs text-ink-500 hover:text-ink-900 underline ml-1"
            >
              Clear
            </button>
          ) : null}
          <Badge tone="neutral" className="ml-auto">
            {visible.length} of {items.length}
          </Badge>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto scrollbar-thin px-8 py-6">
        {loading ? (
          <div className="text-sm text-ink-500">Loading…</div>
        ) : visible.length === 0 ? (
          <EmptyState totalCount={items.length} />
        ) : (
          <div className="flex flex-col gap-4 max-w-5xl">
            {visible.map((d) => (
              <OpportunityCard
                key={d.id}
                opp={d}
                onStatusChange={(s) => updateStatus(d.id, s)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterPill({
  active,
  onToggle,
  tone,
  children
}: {
  active: boolean;
  onToggle: () => void;
  tone?: "default" | "aeo";
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "inline-flex items-center gap-1 px-3 h-7 rounded-full text-xs font-medium transition ring-1 ring-inset",
        active && tone === "aeo"
          ? "bg-[#4A4DC9] text-white ring-[#4A4DC9]"
          : active
          ? "bg-ink-900 text-white ring-ink-900"
          : tone === "aeo"
          ? "bg-[#F5F5FE] text-[#4A4DC9] ring-[#D5D6FF] hover:bg-[#EEEEFD]"
          : "bg-white text-ink-700 ring-ink-200 hover:bg-ink-50"
      )}
    >
      {children}
    </button>
  );
}

// Self-contained decision unit — score color first, then signals, then
// a single primary CTA. ≤10 seconds per row from the spec.
function OpportunityCard({
  opp,
  onStatusChange
}: {
  opp: Discovery;
  onStatusChange: (status: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const tone = scoreTone(opp.score);
  const toneCls = SCORE_TONE_CLASSES[tone];
  const breakdown = opp.scoreBreakdown;

  return (
    <div className="card hover:shadow-cardHover transition flex">
      {/* Left score rail — primary visual anchor */}
      <div
        className={cn(
          "shrink-0 w-24 rounded-l-xl border-r border-ink-100 flex flex-col items-center justify-center px-4 py-4",
          toneCls.bg
        )}
      >
        <div
          className={cn(
            "text-3xl font-bold tabular-nums leading-none",
            toneCls.text
          )}
        >
          {opp.score}
        </div>
        <div className="text-[10px] uppercase tracking-wider text-ink-500 mt-1">
          / 100
        </div>
      </div>

      <div className="flex-1 min-w-0 p-4">
        {/* Badge row */}
        <div className="flex items-center gap-1.5 flex-wrap mb-2">
          <Badge
            tone={SOURCE_TONE[opp.source] || "neutral"}
            className="uppercase tracking-wider"
          >
            {SOURCE_LABEL[opp.source] || opp.source}
          </Badge>
          {opp.intent ? (
            <span
              className={cn(
                "badge",
                INTENT_BADGE_CLASS[opp.intent]
              )}
            >
              {INTENT_LABEL[opp.intent]}
            </span>
          ) : null}
          {opp.aiCitationGap ? (
            <span className={cn("badge inline-flex items-center gap-1", AI_CITATION_BADGE_CLASS)}>
              <Sparkles className="size-3" />
              AI citation gap
            </span>
          ) : null}
        </div>

        {/* Query + URL */}
        <div className="font-mono text-base font-semibold text-ink-900 mb-1">
          {opp.query}
        </div>
        {opp.url ? (
          <a
            href={opp.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-brand-700 hover:underline font-mono mb-2 truncate max-w-full"
          >
            <ExternalLink className="size-3 shrink-0" />
            <span className="truncate">{opp.url}</span>
          </a>
        ) : null}
        {opp.reason ? (
          <div className="text-xs text-ink-600 mb-3">{opp.reason}</div>
        ) : null}

        {/* Inline metrics strip */}
        <MetricsStrip opp={opp} />

        {/* Score breakdown — expandable */}
        {breakdown ? (
          <div className="mt-3">
            <button
              onClick={() => setExpanded((e) => !e)}
              className="inline-flex items-center gap-1 text-xs text-ink-500 hover:text-ink-900 font-medium"
            >
              Score breakdown
              {expanded ? (
                <ChevronUp className="size-3" />
              ) : (
                <ChevronDown className="size-3" />
              )}
            </button>
            {expanded ? (
              <div className="mt-2 grid grid-cols-4 gap-2">
                <BreakdownBar
                  label="GSC velocity"
                  value={breakdown.gscVelocity}
                  max={30}
                  tone={tone}
                />
                <BreakdownBar
                  label="Competitor gap"
                  value={breakdown.competitorGap}
                  max={30}
                  tone={tone}
                />
                <BreakdownBar
                  label="AI citation gap"
                  value={breakdown.aiCitationGap}
                  max={25}
                  tone="aeo"
                />
                <BreakdownBar
                  label="Conversion fit"
                  value={breakdown.conversions}
                  max={15}
                  tone={tone}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Footer: inline status + primary CTA */}
        <div className="flex items-center justify-between gap-2 pt-3 border-t border-ink-100 mt-3">
          <StatusDropdown
            value={opp.status}
            onChange={onStatusChange}
          />
          <Link href={`/discovery/${opp.id}/brief`}>
            <Button variant="primary">
              {opp.briefGeneratedAt ? "Open brief" : "Draft brief"}
              <ArrowRight className="size-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function MetricsStrip({ opp }: { opp: Discovery }) {
  const m = opp.metrics || {};
  const items: Array<{ label: string; value: string }> = [];
  if (typeof m.impressions === "number") {
    items.push({
      label: "Impressions",
      value: m.impressions.toLocaleString()
    });
  }
  if (typeof m.clicks === "number") {
    items.push({ label: "Clicks", value: m.clicks.toLocaleString() });
  }
  if (typeof m.ctr === "number") {
    items.push({ label: "CTR", value: `${(m.ctr * 100).toFixed(1)}%` });
  }
  if (typeof m.position === "number") {
    items.push({
      label: "Position",
      value: `#${m.position.toFixed(1)}`
    });
  }
  if (typeof m.volume === "number") {
    items.push({ label: "Volume", value: m.volume.toLocaleString() });
  }
  if (typeof m.difficulty === "number") {
    items.push({ label: "KD", value: String(m.difficulty) });
  }
  if (items.length === 0) return null;
  return (
    <div className="flex items-center gap-4 flex-wrap text-xs mt-1">
      {items.slice(0, 4).map((it) => (
        <div key={it.label} className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-ink-500">
            {it.label}
          </span>
          <span className="font-semibold text-ink-900 tabular-nums">
            {it.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function BreakdownBar({
  label,
  value,
  max,
  tone
}: {
  label: string;
  value: number;
  max: number;
  tone: "high" | "mid" | "low" | "aeo";
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const barCls =
    tone === "aeo" ? "bg-[#4A4DC9]" : SCORE_TONE_CLASSES[tone].bar;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider text-ink-500">
          {label}
        </span>
        <span className="text-xs font-semibold text-ink-900 tabular-nums">
          {value}
          <span className="text-ink-400 font-normal"> / {max}</span>
        </span>
      </div>
      <div className="h-1.5 bg-ink-100 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full", barCls)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StatusDropdown({
  value,
  onChange
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input !w-auto !py-1.5 !pl-3 !pr-8 !text-xs !h-8"
      >
        {STATUS_OPTIONS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
        {/* Show legacy values if a row is on one. */}
        {!STATUS_OPTIONS.find((o) => o.value === value) ? (
          <option value={value}>{STATUS_LABEL[value] || value}</option>
        ) : null}
      </select>
    </div>
  );
}

function EmptyState({ totalCount }: { totalCount: number }) {
  const hasItems = totalCount > 0;
  return (
    <div className="max-w-md mx-auto text-center py-16">
      <div className="size-12 rounded-xl bg-brand-50 text-brand-600 grid place-items-center mx-auto mb-4">
        <Telescope className="size-6" />
      </div>
      <h2 className="text-xl font-semibold text-ink-900 mb-1">
        {hasItems ? "No opportunities match your filters" : "No opportunities yet"}
      </h2>
      <p className="text-base text-ink-600 mb-6">
        {hasItems
          ? "Try clearing a filter — your data sources have opportunities, they're just outside this view."
          : "Connect Google Search Console in Settings → Data sources, then sync to pull your top opportunities here."}
      </p>
      {!hasItems ? (
        <Link href="/settings/sources">
          <Button variant="primary">
            <ChevronDown className="size-4" />
            Connect a source
          </Button>
        </Link>
      ) : null}
    </div>
  );
}

// Suppress unused warning for legacy X import.
void X;
