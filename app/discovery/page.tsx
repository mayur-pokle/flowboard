"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Telescope,
  TrendingUp,
  Sparkles,
  Archive,
  Undo2,
  Search as SearchIcon,
  Wand2,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/components/Toast";
import { OpportunityCard } from "@/components/discovery/OpportunityCard";
import { DetailPanel } from "@/components/discovery/DetailPanel";
import {
  COLUMN_LABEL,
  COLUMN_ORDER,
  type KanbanColumn,
  TYPE_LABEL,
  TYPE_BADGE_CLASS
} from "@/components/discovery/tokens";
import type { Opportunity } from "@/components/discovery/types";
import type { OpportunityType } from "@/lib/opportunity-classifier";
import { cn } from "@/lib/utils";

// In-session undo stack for rejected cards. Lives in component state
// (not localStorage) per spec: rejection is recoverable in session only.
type Reject = { id: string; query: string };

export default function DiscoveryKanbanPage() {
  const [items, setItems] = useState<Opportunity[]>([]);
  const [rejected, setRejected] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [sampleCount, setSampleCount] = useState(0);
  const [sampleBannerDismissed, setSampleBannerDismissed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [signalFilter, setSignalFilter] = useState<
    "all" | "trending" | "ai-gap" | "both"
  >("all");
  const [typeFilter, setTypeFilter] = useState<"all" | OpportunityType>("all");
  const [rejectStack, setRejectStack] = useState<Reject[]>([]);

  // ── Identify Gaps (Gemini-powered) ──
  const [identifying, setIdentifying] = useState(false);
  const [identifyStep, setIdentifyStep] = useState(0);
  const identifySteps = [
    "Reading your brand context…",
    "Scanning competitor coverage…",
    "Comparing against your published library…",
    "Asking Gemini for the biggest gaps…",
    "Scoring and queuing into Intake…"
  ];
  useEffect(() => {
    if (!identifying) return;
    setIdentifyStep(0);
    const t = setInterval(() => {
      setIdentifyStep((s) => Math.min(identifySteps.length - 1, s + 1));
    }, 1800);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identifying]);

  async function identifyGaps() {
    setIdentifying(true);
    try {
      const res = await fetch("/api/discoveries/identify-gaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 10 })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not identify gaps");
      if (json.provider === "mock") {
        toast(
          `Loaded ${json.inserted} sample gaps (no LLM key configured). Add GEMINI_API_KEY to identify real gaps.`,
          "info"
        );
      } else {
        toast(
          `${json.inserted} new opportunities identified by ${json.provider}.`,
          "success"
        );
      }
      await reload();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setIdentifying(false);
    }
  }

  async function load() {
    try {
      const res = await fetch("/api/discoveries?includeRejected=true");
      if (!res.ok) throw new Error("Could not load opportunities");
      const json = await res.json();
      const all: Opportunity[] = json.opportunities || [];
      setItems(all.filter((o) => o.kanbanColumn !== "rejected"));
      setRejected(all.filter((o) => o.kanbanColumn === "rejected"));
      setSampleCount(json.sampleCount || 0);
      // If the table is empty (no rows + no sample), auto-seed.
      if (all.length === 0) {
        await fetch("/api/discoveries/seed", { method: "POST" });
        await reload();
        return;
      }
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }
  async function reload() {
    try {
      const res = await fetch("/api/discoveries?includeRejected=true");
      const json = await res.json();
      const all: Opportunity[] = json.opportunities || [];
      setItems(all.filter((o) => o.kanbanColumn !== "rejected"));
      setRejected(all.filter((o) => o.kanbanColumn === "rejected"));
      setSampleCount(json.sampleCount || 0);
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filtering — additive: search + signal + type
  const filtered = useMemo(() => {
    return items.filter((o) => {
      if (query.trim()) {
        const q = query.toLowerCase().trim();
        if (
          !(
            o.query.toLowerCase().includes(q) ||
            (o.url || "").toLowerCase().includes(q)
          )
        )
          return false;
      }
      if (signalFilter === "trending" && !o.trending) return false;
      if (signalFilter === "ai-gap" && !o.aiCitationGap) return false;
      if (
        signalFilter === "both" &&
        (!o.trending || !o.aiCitationGap)
      )
        return false;
      if (typeFilter !== "all" && o.opportunityType !== typeFilter)
        return false;
      return true;
    });
  }, [items, query, signalFilter, typeFilter]);

  const byColumn = useMemo(() => {
    const out: Record<KanbanColumn, Opportunity[]> = {
      intake: [],
      new: [],
      in_progress: [],
      done: []
    };
    for (const o of filtered) {
      const col = (
        COLUMN_ORDER.includes(o.kanbanColumn as KanbanColumn)
          ? o.kanbanColumn
          : "intake"
      ) as KanbanColumn;
      out[col].push(o);
    }
    return out;
  }, [filtered]);

  const openOpp = useMemo(
    () => items.find((o) => o.id === openId) || null,
    [items, openId]
  );

  // ── Pipeline actions (optimistic where safe) ──
  async function handleAccept(opp: Opportunity) {
    setBusyId(opp.id);
    try {
      // Move card immediately (optimistic).
      setItems((prev) =>
        prev.map((o) =>
          o.id === opp.id ? { ...o, kanbanColumn: "new" } : o
        )
      );
      const accRes = await fetch(`/api/discoveries/${opp.id}/accept`, {
        method: "POST"
      });
      if (!accRes.ok) throw new Error("Accept failed");
      // Kick off brief generation in the background.
      fetch(`/api/discoveries/${opp.id}/brief`, { method: "POST" })
        .then((r) => r.json())
        .then(() => reload())
        .catch(() => {
          /* brief comes from open in detail panel too */
        });
      toast("Moved to New · brief generating…", "success");
    } catch (err) {
      toast((err as Error).message, "error");
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(opp: Opportunity) {
    setBusyId(opp.id);
    try {
      setItems((prev) => prev.filter((o) => o.id !== opp.id));
      setRejected((prev) => [{ ...opp, kanbanColumn: "rejected" }, ...prev]);
      setRejectStack((s) => [{ id: opp.id, query: opp.query }, ...s]);
      const res = await fetch(`/api/discoveries/${opp.id}/reject`, {
        method: "POST"
      });
      if (!res.ok) throw new Error("Reject failed");
      toast(`Rejected "${opp.query}"`, "info");
    } catch (err) {
      toast((err as Error).message, "error");
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  async function handleUndoReject() {
    const top = rejectStack[0];
    if (!top) return;
    try {
      const res = await fetch(`/api/discoveries/${top.id}/restore`, {
        method: "POST"
      });
      if (!res.ok) throw new Error("Restore failed");
      setRejectStack((s) => s.slice(1));
      toast(`Restored "${top.query}"`, "success");
      await reload();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function handleMarkDone(opp: Opportunity) {
    setBusyId(opp.id);
    try {
      setItems((prev) =>
        prev.map((o) =>
          o.id === opp.id ? { ...o, kanbanColumn: "done" } : o
        )
      );
      const res = await fetch(`/api/discoveries/${opp.id}/mark-done`, {
        method: "POST"
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Mark done failed");
      toast("Marked done — Kanban task created on /board", "success");
      await reload();
    } catch (err) {
      toast((err as Error).message, "error");
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  function handleOpenDetail(oppId: string) {
    setOpenId(oppId);
  }

  // ── Render ──
  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-ink-200 bg-white shrink-0">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Telescope className="size-4 text-ink-500" />
              <h1 className="text-base font-semibold text-ink-900 leading-tight">
                Discovery
              </h1>
            </div>
            <p className="text-xs text-ink-500 leading-tight max-w-2xl">
              Demand-capture pipeline. Each card moves Intake → New →
              In&#x2011;progress → Done. Accept queues a brief; Mark done
              ships a Kanban task to <Link href="/board" className="underline">/board</Link>.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              onClick={() => void identifyGaps()}
              disabled={identifying}
            >
              {identifying ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Wand2 className="size-4" />
              )}
              {identifying ? "Identifying…" : "Identify gaps"}
            </Button>
            <Link href="/settings/sources">
              <Button variant="secondary">Manage sources</Button>
            </Link>
          </div>
        </div>

        {identifying ? (
          <div className="mt-3 rounded-lg bg-brand-50 ring-1 ring-inset ring-brand-200 px-3 py-2 flex items-center gap-3 text-xs">
            <Loader2 className="size-3.5 text-brand-700 animate-spin shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-brand-900 mb-1">
                Gemini is identifying content gaps for your brand
              </div>
              <div className="text-brand-700">
                {identifySteps[identifyStep]}
              </div>
            </div>
          </div>
        ) : null}

        {/* Search + filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <SearchIcon className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search keyword"
              className="input pl-9"
            />
          </div>

          {/* Signal filter pills */}
          <div className="flex items-center gap-1.5">
            <FilterPill
              active={signalFilter === "all"}
              onClick={() => setSignalFilter("all")}
            >
              All signals
            </FilterPill>
            <FilterPill
              active={signalFilter === "trending"}
              onClick={() => setSignalFilter("trending")}
              icon={<TrendingUp className="size-3" />}
              tone="trending"
            >
              Trending
            </FilterPill>
            <FilterPill
              active={signalFilter === "ai-gap"}
              onClick={() => setSignalFilter("ai-gap")}
              icon={<Sparkles className="size-3" />}
              tone="aeo"
            >
              AI citation gap
            </FilterPill>
            <FilterPill
              active={signalFilter === "both"}
              onClick={() => setSignalFilter("both")}
            >
              Both
            </FilterPill>
          </div>

          {/* Type filter pills */}
          <div className="flex items-center gap-1.5 ml-2">
            <span className="text-[10px] uppercase tracking-wider text-ink-500 mr-1">
              Type
            </span>
            <FilterPill
              active={typeFilter === "all"}
              onClick={() => setTypeFilter("all")}
            >
              All
            </FilterPill>
            {(["new", "refresh", "community"] as OpportunityType[]).map(
              (t) => (
                <FilterPill
                  key={t}
                  active={typeFilter === t}
                  onClick={() => setTypeFilter(t)}
                  customClass={typeFilter === t ? "" : TYPE_BADGE_CLASS[t]}
                >
                  {TYPE_LABEL[t]}
                </FilterPill>
              )
            )}
          </div>

          <Badge tone="neutral" className="ml-auto">
            {filtered.length} of {items.length}
          </Badge>
        </div>

        {/* Sample data banner */}
        {sampleCount > 0 && !sampleBannerDismissed ? (
          <div className="mt-3 rounded-lg bg-brand-50 ring-1 ring-inset ring-brand-200 px-3 py-2 flex items-center gap-2 text-xs">
            <Sparkles className="size-3.5 text-brand-700 shrink-0" />
            <div className="flex-1 text-brand-900">
              <strong>Sample data mode.</strong> {sampleCount} demo
              opportunities loaded so you can try the full workflow. Connect
              real sources in Settings → Data sources to replace these.
            </div>
            <button
              onClick={async () => {
                if (
                  window.confirm(
                    "Clear all sample opportunities? Real data from connected sources stays."
                  )
                ) {
                  await fetch("/api/discoveries/seed", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ clear: true })
                  });
                  await reload();
                }
              }}
              className="text-brand-700 underline hover:text-brand-900"
            >
              Clear samples
            </button>
            <button
              onClick={() => setSampleBannerDismissed(true)}
              className="text-brand-700 hover:text-brand-900"
            >
              Dismiss
            </button>
          </div>
        ) : null}
      </div>

      {/* Kanban board */}
      <div className="flex-1 min-h-0 overflow-hidden p-4">
        {loading ? (
          <div className="text-sm text-ink-500 p-4">Loading…</div>
        ) : (
          <div className="h-full grid grid-cols-4 gap-3">
            {COLUMN_ORDER.map((col) => (
              <Column
                key={col}
                column={col}
                items={byColumn[col]}
                busyId={busyId}
                onOpenDetail={handleOpenDetail}
                onAccept={handleAccept}
                onReject={handleReject}
                onViewBrief={(o) => handleOpenDetail(o.id)}
                onGenerateContent={(o) => handleOpenDetail(o.id)}
                onMarkDone={handleMarkDone}
                rejectedCount={col === "intake" ? rejected.length : 0}
                onUndoReject={col === "intake" ? handleUndoReject : undefined}
                canUndo={rejectStack.length > 0}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail panel */}
      {openOpp ? (
        <DetailPanel
          opportunity={openOpp}
          onClose={() => setOpenId(null)}
          onRefresh={reload}
        />
      ) : null}
    </div>
  );
}

// ── Column ──
function Column({
  column,
  items,
  busyId,
  onOpenDetail,
  onAccept,
  onReject,
  onViewBrief,
  onGenerateContent,
  onMarkDone,
  rejectedCount,
  onUndoReject,
  canUndo
}: {
  column: KanbanColumn;
  items: Opportunity[];
  busyId: string | null;
  onOpenDetail: (id: string) => void;
  onAccept: (o: Opportunity) => void;
  onReject: (o: Opportunity) => void;
  onViewBrief: (o: Opportunity) => void;
  onGenerateContent: (o: Opportunity) => void;
  onMarkDone: (o: Opportunity) => void;
  rejectedCount: number;
  onUndoReject?: () => void;
  canUndo: boolean;
}) {
  return (
    <div className="bg-ink-50 rounded-xl border border-ink-200 flex flex-col min-h-0">
      <div className="px-3 py-2.5 border-b border-ink-200 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold text-ink-900 uppercase tracking-wider">
            {COLUMN_LABEL[column]}
          </h2>
          <Badge tone="neutral" className="!text-[10px] !px-1.5">
            {items.length}
          </Badge>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto scrollbar-thin p-2 space-y-2">
        {items.length === 0 ? (
          <div className="text-[11px] text-ink-400 text-center py-6 px-2">
            {column === "intake"
              ? "No fresh opportunities. Connect a source to pull more."
              : column === "new"
              ? "Cards land here when Accepted."
              : column === "in_progress"
              ? "Cards arrive here when content generation starts."
              : "Marked-done cards land here and ship to /board."}
          </div>
        ) : (
          items.map((o) => (
            <OpportunityCard
              key={o.id}
              opp={o}
              column={column}
              busy={busyId === o.id}
              onOpenDetail={() => onOpenDetail(o.id)}
              onAccept={() => onAccept(o)}
              onReject={() => onReject(o)}
              onViewBrief={() => onViewBrief(o)}
              onGenerateContent={() => onGenerateContent(o)}
              onMarkDone={() => onMarkDone(o)}
            />
          ))
        )}
      </div>
      {/* Rejected (N) link below Intake */}
      {column === "intake" ? (
        <div className="border-t border-ink-200 px-3 py-2 flex items-center justify-between text-xs">
          <span className="text-ink-500 inline-flex items-center gap-1.5">
            <Archive className="size-3" />
            Rejected ({rejectedCount})
          </span>
          {canUndo && onUndoReject ? (
            <button
              onClick={onUndoReject}
              className="text-ink-700 hover:text-ink-900 inline-flex items-center gap-1 font-medium"
            >
              <Undo2 className="size-3" />
              Undo
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  icon,
  tone,
  children,
  customClass
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  tone?: "trending" | "aeo";
  children: React.ReactNode;
  customClass?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 px-2.5 h-7 rounded-full text-[11px] font-medium transition ring-1 ring-inset",
        active && tone === "aeo"
          ? "bg-[#4A4DC9] text-white ring-[#4A4DC9]"
          : active && tone === "trending"
          ? "bg-amber-500 text-white ring-amber-500"
          : active
          ? "bg-ink-900 text-white ring-ink-900"
          : customClass
          ? `bg-white hover:bg-ink-50 ring-ink-200 ${customClass}`
          : "bg-white text-ink-700 ring-ink-200 hover:bg-ink-50"
      )}
    >
      {icon}
      {children}
    </button>
  );
}
