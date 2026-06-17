"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Telescope,
  TrendingUp,
  Sparkles,
  Archive,
  Undo2,
  Wand2,
  Loader2,
  Trash2,
  ChevronRight,
  CheckCircle2,
  AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/components/Toast";
import { DetailPanel } from "@/components/discovery/DetailPanel";
import {
  PipelineCard,
  pickScoreTone,
  SignalIcons
} from "@/components/pipeline/PipelineCard";
import { PipelineColumn } from "@/components/pipeline/PipelineColumn";
import {
  PipelineTopBar,
  FilterPill
} from "@/components/pipeline/PipelineTopBar";
import {
  COLUMN_LABEL,
  COLUMN_ORDER,
  type KanbanColumn,
  TYPE_LABEL,
  TYPE_BADGE_CLASS,
  PRIORITY_LABEL,
  PRIORITY_BADGE_CLASS,
  SOURCE_LABEL,
  SOURCE_TONE,
  AI_CITATION_BADGE_CLASS,
  TRENDING_BADGE_CLASS
} from "@/components/discovery/tokens";
import type { Opportunity } from "@/components/discovery/types";
import type { OpportunityType } from "@/lib/opportunity-classifier";
import { cn } from "@/lib/utils";

// dnd-kit
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDraggable
} from "@dnd-kit/core";

type Reject = { id: string; query: string };

// Map our kanban columns to dnd droppable ids. Intake is NOT droppable
// (cards land via Identify Gaps, leave via Accept/Reject). The other
// three columns are.
const DROPPABLE_COLUMNS: KanbanColumn[] = ["new", "in_progress", "done"];

const COLUMN_TONE: Record<KanbanColumn, "violet" | "ink" | "brand" | "emerald"> = {
  intake: "violet",
  new: "ink",
  in_progress: "brand",
  done: "emerald"
};

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
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  async function load() {
    try {
      const res = await fetch("/api/discoveries?includeRejected=true");
      if (!res.ok) throw new Error("Could not load opportunities");
      const json = await res.json();
      const all: Opportunity[] = json.opportunities || [];
      setItems(all.filter((o) => o.kanbanColumn !== "rejected"));
      setRejected(all.filter((o) => o.kanbanColumn === "rejected"));
      setSampleCount(json.sampleCount || 0);
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

  // ── Clear all ──
  const [clearing, setClearing] = useState(false);
  async function clearAll() {
    if (
      !window.confirm(
        "Clear every opportunity on the board? This permanently deletes all rows — Intake, New, In-progress, Done, and Rejected. You'll start from a clean slate."
      )
    )
      return;
    setClearing(true);
    try {
      const res = await fetch("/api/discoveries/clear-all", {
        method: "POST"
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Clear failed");
      toast(`Cleared ${json.cleared} opportunities`, "success");
      setItems([]);
      setRejected([]);
      setRejectStack([]);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setClearing(false);
    }
  }

  // ── Identify Gaps ──
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

  // ── Filtering ──
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
      if (signalFilter === "both" && (!o.trending || !o.aiCitationGap))
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

  // ── Pipeline actions ──
  async function handleAccept(opp: Opportunity) {
    setBusyId(opp.id);
    try {
      setItems((prev) =>
        prev.map((o) =>
          o.id === opp.id ? { ...o, kanbanColumn: "new" } : o
        )
      );
      const accRes = await fetch(`/api/discoveries/${opp.id}/accept`, {
        method: "POST"
      });
      if (!accRes.ok) throw new Error("Accept failed");
      fetch(`/api/discoveries/${opp.id}/brief`, { method: "POST" })
        .then((r) => r.json())
        .then(() => reload())
        .catch(() => {});
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

  // ── Drag-and-drop ──
  function handleDragStart(e: DragStartEvent) {
    setActiveDragId(String(e.active.id));
  }
  async function handleDragEnd(e: DragEndEvent) {
    setActiveDragId(null);
    const overId = e.over?.id;
    if (!overId) return;
    const targetColumn = String(overId) as KanbanColumn;
    if (!DROPPABLE_COLUMNS.includes(targetColumn)) return;
    const id = String(e.active.id);
    const opp = items.find((o) => o.id === id);
    if (!opp || opp.kanbanColumn === targetColumn) return;
    // Optimistic move
    setItems((prev) =>
      prev.map((o) => (o.id === id ? { ...o, kanbanColumn: targetColumn } : o))
    );
    try {
      const res = await fetch(`/api/discoveries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kanbanColumn: targetColumn })
      });
      if (!res.ok) throw new Error("Move failed");
    } catch (err) {
      toast((err as Error).message, "error");
      await reload();
    }
  }

  const activeDragOpp = useMemo(
    () => items.find((o) => o.id === activeDragId) || null,
    [items, activeDragId]
  );

  // ── Render ──
  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col">
      <PipelineTopBar
        title="AI Discovery"
        subtitle="Demand-capture pipeline. Identify content gaps via Gemini, accept the best, ship them to Kanban when done."
        actions={
          <>
            <Button
              variant="primary"
              onClick={() => void identifyGaps()}
              disabled={identifying || clearing}
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
            {items.length + rejected.length > 0 ? (
              <button
                onClick={() => void clearAll()}
                disabled={clearing || identifying}
                className="h-9 px-3 rounded-md text-xs text-ink-500 hover:text-rose-600 hover:bg-rose-50 inline-flex items-center gap-1.5 transition disabled:opacity-50"
                title="Delete every opportunity and start fresh"
              >
                {clearing ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
                Clear all
              </button>
            ) : null}
          </>
        }
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search keyword"
        }}
        filters={
          <>
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
            <span className="h-4 w-px bg-ink-200 mx-1" aria-hidden />
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
          </>
        }
        countLabel={`${filtered.length} of ${items.length}`}
        banner={
          <>
            {identifying ? (
              <div className="rounded-lg bg-brand-50 ring-1 ring-inset ring-brand-200 px-3 py-2 flex items-center gap-3 text-xs">
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
            {sampleCount > 0 && !sampleBannerDismissed && !identifying ? (
              <div className="rounded-lg bg-brand-50 ring-1 ring-inset ring-brand-200 px-3 py-2 flex items-center gap-2 text-xs">
                <Sparkles className="size-3.5 text-brand-700 shrink-0" />
                <div className="flex-1 text-brand-900">
                  <strong>Sample data mode.</strong> {sampleCount} demo
                  opportunities loaded so you can try the full workflow.
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
          </>
        }
      />

      {/* Kanban board */}
      <div className="flex-1 min-h-0 overflow-hidden p-4">
        {loading ? (
          <div className="text-sm text-ink-500 p-4">Loading…</div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-3 h-full overflow-x-auto scrollbar-thin">
              {COLUMN_ORDER.map((col) => (
                <PipelineColumn
                  key={col}
                  title={COLUMN_LABEL[col]}
                  count={byColumn[col].length}
                  tone={COLUMN_TONE[col]}
                  droppableId={
                    DROPPABLE_COLUMNS.includes(col) ? col : undefined
                  }
                  emptyState={
                    <div className="text-[11px] text-ink-400 text-center py-6 px-2">
                      {col === "intake"
                        ? "No fresh gaps. Click Identify gaps to ask Gemini."
                        : col === "new"
                        ? "Cards land here when Accepted."
                        : col === "in_progress"
                        ? "Cards arrive here when content generation starts."
                        : "Marked-done cards land here and ship to /board."}
                    </div>
                  }
                  footer={
                    col === "intake" ? (
                      <div className="px-3 py-2 rounded-md bg-ink-100 text-xs flex items-center justify-between">
                        <span className="text-ink-500 inline-flex items-center gap-1.5">
                          <Archive className="size-3" />
                          Rejected ({rejected.length})
                        </span>
                        {rejectStack.length > 0 ? (
                          <button
                            onClick={handleUndoReject}
                            className="text-ink-700 hover:text-ink-900 inline-flex items-center gap-1 font-medium"
                          >
                            <Undo2 className="size-3" />
                            Undo
                          </button>
                        ) : null}
                      </div>
                    ) : null
                  }
                >
                  {byColumn[col].map((o) =>
                    DROPPABLE_COLUMNS.includes(col) ? (
                      <DraggableOpportunityCard
                        key={o.id}
                        opp={o}
                        column={col}
                        busy={busyId === o.id}
                        onOpenDetail={() => setOpenId(o.id)}
                        onAccept={() => handleAccept(o)}
                        onReject={() => handleReject(o)}
                        onMarkDone={() => handleMarkDone(o)}
                      />
                    ) : (
                      <OpportunityRow
                        key={o.id}
                        opp={o}
                        column={col}
                        busy={busyId === o.id}
                        onOpenDetail={() => setOpenId(o.id)}
                        onAccept={() => handleAccept(o)}
                        onReject={() => handleReject(o)}
                        onMarkDone={() => handleMarkDone(o)}
                      />
                    )
                  )}
                </PipelineColumn>
              ))}
            </div>
            <DragOverlay>
              {activeDragOpp ? (
                <div className="w-[360px] opacity-90">
                  <OpportunityRow
                    opp={activeDragOpp}
                    column={activeDragOpp.kanbanColumn as KanbanColumn}
                    busy={false}
                    onOpenDetail={() => {}}
                    onAccept={() => {}}
                    onReject={() => {}}
                    onMarkDone={() => {}}
                    isDragOverlay
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {openOpp ? (
        <DetailPanel
          opportunity={openOpp}
          onClose={() => setOpenId(null)}
          onRefresh={reload}
          onDeleted={(id) => {
            setItems((prev) => prev.filter((o) => o.id !== id));
            setRejected((prev) => prev.filter((o) => o.id !== id));
          }}
        />
      ) : null}
    </div>
  );
}

// ── Draggable wrapper ──
function DraggableOpportunityCard(
  props: React.ComponentProps<typeof OpportunityRow>
) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: props.opp.id
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(isDragging && "opacity-30")}
    >
      <OpportunityRow {...props} />
    </div>
  );
}

// ── Single card renderer ──
// Builds the PipelineCard prop set from an Opportunity. Same chassis,
// same visuals, same actions across both surfaces.
function OpportunityRow({
  opp,
  column,
  busy,
  onOpenDetail,
  onAccept,
  onReject,
  onMarkDone,
  isDragOverlay
}: {
  opp: Opportunity;
  column: KanbanColumn;
  busy: boolean;
  onOpenDetail: () => void;
  onAccept: () => void;
  onReject: () => void;
  onMarkDone: () => void;
  isDragOverlay?: boolean;
}) {
  const targetKw =
    opp.metrics &&
    typeof (opp.metrics as Record<string, unknown>).targetKeyword === "string"
      ? ((opp.metrics as Record<string, unknown>).targetKeyword as string)
      : "";

  const metrics: { label: string; value: string }[] = [];
  if (opp.weeklyImpressions) {
    metrics.push({
      label: "Impressions",
      value: opp.weeklyImpressions.toLocaleString()
    });
  }
  if (opp.competitorGapScore) {
    metrics.push({ label: "Gap", value: String(opp.competitorGapScore) });
  }
  if (opp.metrics && (opp.metrics as Record<string, unknown>).position != null) {
    const p = (opp.metrics as Record<string, unknown>).position as number;
    metrics.push({ label: "Pos", value: `#${p.toFixed(1)}` });
  }

  const signals = [];
  if (opp.trending) {
    signals.push({
      label: "Trending",
      icon: <SignalIcons.Trending className="size-3" />,
      className: TRENDING_BADGE_CLASS
    });
  }
  if (opp.aiCitationGap) {
    signals.push({
      label: "AI citation gap",
      icon: <SignalIcons.AICitation className="size-3" />,
      className: AI_CITATION_BADGE_CLASS
    });
  }
  if (opp.cannibalizingPages && opp.cannibalizingPages.length > 0) {
    signals.push({
      label: "Cannibalization risk",
      icon: <SignalIcons.Cannibalization className="size-3" />,
      className: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200",
      title: `Overlaps with ${opp.cannibalizingPages.length} published page${
        opp.cannibalizingPages.length === 1 ? "" : "s"
      }`
    });
  }

  const footer = (() => {
    if (column === "intake") {
      return (
        <>
          <button
            onClick={onAccept}
            disabled={busy}
            className="flex-1 h-7 px-2 rounded-md bg-ink-900 hover:bg-ink-800 text-white text-xs font-medium transition disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="size-3 animate-spin mx-auto" />
            ) : (
              "Accept"
            )}
          </button>
          <button
            onClick={onReject}
            disabled={busy}
            className="h-7 px-2 rounded-md bg-white hover:bg-ink-50 ring-1 ring-inset ring-ink-200 text-ink-600 text-xs transition disabled:opacity-50"
          >
            Reject
          </button>
        </>
      );
    }
    if (column === "new") {
      return (
        <button
          onClick={onOpenDetail}
          disabled={busy}
          className="flex-1 h-7 px-2 rounded-md bg-ink-900 hover:bg-ink-800 text-white text-xs font-medium transition disabled:opacity-50 inline-flex items-center justify-center gap-1"
        >
          View brief
          <ChevronRight className="size-3" />
        </button>
      );
    }
    if (column === "in_progress") {
      return (
        <button
          onClick={onMarkDone}
          disabled={busy || !opp.contentGeneratedAt}
          className="flex-1 h-7 px-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition disabled:opacity-50 disabled:bg-ink-200 disabled:text-ink-500"
        >
          {busy
            ? "Working…"
            : opp.contentGeneratedAt
            ? "Mark done"
            : "Generating…"}
        </button>
      );
    }
    return (
      <div className="flex-1 text-[10px] text-ink-500 inline-flex items-center gap-1">
        <CheckCircle2 className="size-3 text-emerald-500" />
        Published to Kanban
      </div>
    );
  })();

  return (
    <PipelineCard
      id={opp.id}
      title={opp.query}
      subline={
        targetKw && targetKw.toLowerCase() !== opp.query.toLowerCase()
          ? { label: "kw", value: targetKw }
          : null
      }
      typeBadge={{
        label: TYPE_LABEL[opp.opportunityType],
        className: TYPE_BADGE_CLASS[opp.opportunityType]
      }}
      priorityBadge={{
        label: PRIORITY_LABEL[opp.priority],
        className: PRIORITY_BADGE_CLASS[opp.priority]
      }}
      score={opp.score}
      scoreTone={pickScoreTone(opp.score)}
      signals={signals}
      metrics={metrics}
      indicator={
        opp.briefData
          ? { label: "Brief ready", tone: "success" }
          : undefined
      }
      footer={footer}
      onClick={onOpenDetail}
      isDragOverlay={isDragOverlay}
    />
  );
}

// Silence unused legacy imports kept for tone-class re-export consistency.
void SOURCE_LABEL;
void SOURCE_TONE;
void Badge;
void Telescope;
void AlertTriangle;
