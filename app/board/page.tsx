"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Wand2,
  Loader2,
  Trash2,
  CheckCircle2,
  Sparkles,
  Undo2,
  X,
  ChevronRight,
  AlertTriangle
} from "lucide-react";
import { useStore, useHasHydrated } from "@/lib/store";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/Toast";
import { CardDetailPanel } from "@/components/CardDetailPanel";
import {
  PipelineCard,
  pickScoreTone,
  SignalIcons,
  type CardBadge
} from "@/components/pipeline/PipelineCard";
import { PipelineColumn } from "@/components/pipeline/PipelineColumn";
import {
  PipelineTopBar,
  FilterPill
} from "@/components/pipeline/PipelineTopBar";
import type {
  Status,
  Task,
  Topic,
  Priority as TopicPriority
} from "@/lib/types";

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
import { cn } from "@/lib/utils";

// Mirrors the AI Discovery layout exactly:
//   ── PipelineTopBar (title, primary CTA, secondary, search, filters) ──
//   Ideas → To Do → In Progress → Done
//
// The Ideas column is populated by the AI topic generator (top-bar CTA).
// To Do / In Progress / Done are draggable (writers manage flow).

type Reject = { topic: Topic };

const PRIORITY_TONE: Record<TopicPriority, string> = {
  High: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200",
  Medium: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200",
  Low: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"
};

const TYPE_TONE: Record<string, string> = {
  Calculator: "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200",
  Template: "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200",
  Guide: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200",
  Whitepaper: "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200",
  Checklist: "bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-200",
  Framework: "bg-fuchsia-50 text-fuchsia-700 ring-1 ring-inset ring-fuchsia-200"
};

const CONTENT_STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  generating: "Generating",
  completed: "Draft ready",
  error: "Error"
};

export default function AIResourcesPage() {
  const hydrated = useHasHydrated();
  const topics = useStore((s) => s.topics);
  const tasks = useStore((s) => s.tasks);
  const addTopics = useStore((s) => s.addTopics);
  const moveTopicToBoard = useStore((s) => s.moveTopicToBoard);
  const deleteTopic = useStore((s) => s.deleteTopic);
  const setLastGeneratedAt = useStore((s) => s.setLastGeneratedAt);
  const setTaskStatus = useStore((s) => s.setTaskStatus);
  const settings = useStore((s) => s.settings);
  const selectedTaskId = useStore((s) => s.selectedTaskId);
  const selectTask = useStore((s) => s.selectTask);

  // ── Local UI state ──
  const [query, setQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<"all" | TopicPriority>(
    "all"
  );
  const [contentStatusFilter, setContentStatusFilter] = useState<
    "all" | "not_started" | "generating" | "completed"
  >("all");
  const [showGenerator, setShowGenerator] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [count, setCount] = useState(8);
  const [generating, setGenerating] = useState(false);
  const [busyTopicId, setBusyTopicId] = useState<string | null>(null);
  const [rejectStack, setRejectStack] = useState<Reject[]>([]);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) || null;

  // Close detail panel on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && selectedTaskId) selectTask(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedTaskId, selectTask]);

  // ── Generation ──
  async function handleGenerate() {
    setGenerating(true);
    try {
      const recentTitles = [
        ...topics.map((t) => t.title),
        ...tasks.map((t) => t.topic.title)
      ].slice(0, 50);
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };
      if (settings.openaiModel)
        headers["x-openai-model"] = settings.openaiModel;
      if (settings.geminiModel)
        headers["x-gemini-model"] = settings.geminiModel;
      if (settings.anthropicModel)
        headers["x-anthropic-model"] = settings.anthropicModel;
      if (settings.primaryProvider)
        headers["x-primary-provider"] = settings.primaryProvider;

      const seedKeywordsList = settings.seedKeywords
        ? settings.seedKeywords.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)
        : [];
      const topicsToAvoidList = settings.topicsToAvoid
        ? settings.topicsToAvoid.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)
        : [];

      const res = await fetch("/api/generate-topics", {
        method: "POST",
        headers,
        body: JSON.stringify({
          count,
          strategistInstructions: instructions.trim() || undefined,
          brandNiche: settings.brandNiche,
          brandAudience: settings.brandAudience,
          companyName: settings.companyName,
          websiteUrl: settings.websiteUrl,
          productDescription: settings.productDescription,
          valueProposition: settings.valueProposition,
          brandVoice: settings.brandVoice,
          primaryCta: settings.primaryCta,
          primaryGeo: settings.primaryGeo,
          competitors: settings.competitors,
          seedKeywords: seedKeywordsList,
          topicsToAvoid: topicsToAvoidList,
          recentTitles
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      const incoming = data.topics as Topic[];
      const { added, skipped } = await addTopics(incoming);
      await setLastGeneratedAt(new Date().toISOString());

      const warnings: string[] = Array.isArray(data.warnings)
        ? data.warnings
        : [];
      for (const w of warnings) toast(w, "error");

      const triedAnyKey =
        data.keysSeen?.openai || data.keysSeen?.gemini || data.keysSeen?.anthropic || false;
      const providerLabel =
        data.provider === "mock"
          ? triedAnyKey
            ? " (mock fallback — see error above)"
            : " (mock — add an API key in Settings)"
          : ` via ${data.provider}`;

      if (added === 0 && skipped > 0) {
        toast(
          `All ${skipped} ${skipped === 1 ? "topic" : "topics"} matched existing ideas${providerLabel}.`,
          "info"
        );
      } else {
        toast(
          `${added} new ${added === 1 ? "idea" : "ideas"}${skipped ? `, ${skipped} duplicates skipped` : ""}${providerLabel}`,
          added > 0 ? "success" : "info"
        );
        setShowGenerator(false);
      }
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setGenerating(false);
    }
  }

  // ── Clear topics ──
  async function clearAllTopics() {
    if (
      !window.confirm(
        `Delete all ${topics.length} unreviewed ideas? Cards already on the board (To Do / In Progress / Done) are not affected.`
      )
    )
      return;
    setClearing(true);
    try {
      for (const t of topics) await deleteTopic(t.id);
      toast(`Cleared ${topics.length} ideas`, "success");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setClearing(false);
    }
  }

  // ── Topic actions ──
  async function handleAccept(topic: Topic) {
    setBusyTopicId(topic.id);
    try {
      const task = await moveTopicToBoard(topic.id);
      if (!task) throw new Error("Could not move idea to board");
      toast("Accepted — landed in To Do", "success");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusyTopicId(null);
    }
  }

  async function handleReject(topic: Topic) {
    setBusyTopicId(topic.id);
    setRejectStack((s) => [{ topic }, ...s]);
    try {
      await deleteTopic(topic.id);
      toast(`Rejected "${topic.title}"`, "info");
    } catch (err) {
      toast((err as Error).message, "error");
      setRejectStack((s) => s.filter((r) => r.topic.id !== topic.id));
    } finally {
      setBusyTopicId(null);
    }
  }

  function handleUndoReject() {
    const top = rejectStack[0];
    if (!top) return;
    setRejectStack((s) => s.slice(1));
    toast(
      `"${top.topic.title}" will be eligible for re-suggestion. Click Generate to bring it back.`,
      "info"
    );
  }

  // ── Task dnd ──
  function handleDragStart(e: DragStartEvent) {
    setActiveDragId(String(e.active.id));
  }
  async function handleDragEnd(e: DragEndEvent) {
    setActiveDragId(null);
    const overId = e.over?.id;
    if (!overId) return;
    const status = String(overId) as Status;
    if (!["todo", "in_progress", "done"].includes(status)) return;
    await setTaskStatus(String(e.active.id), status);
  }

  // ── Filtering ──
  const filteredTopics = useMemo(() => {
    return topics.filter((t) => {
      if (query.trim()) {
        const q = query.toLowerCase().trim();
        if (
          !(
            t.title.toLowerCase().includes(q) ||
            t.targetKeyword.toLowerCase().includes(q)
          )
        )
          return false;
      }
      if (priorityFilter !== "all" && t.priority !== priorityFilter)
        return false;
      // contentStatus doesn't apply to topics — show them through any
      // contentStatus filter so they remain accessible
      return true;
    });
  }, [topics, query, priorityFilter]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (query.trim()) {
        const q = query.toLowerCase().trim();
        if (
          !(
            t.topic.title.toLowerCase().includes(q) ||
            t.topic.targetKeyword.toLowerCase().includes(q)
          )
        )
          return false;
      }
      if (priorityFilter !== "all" && t.topic.priority !== priorityFilter)
        return false;
      if (
        contentStatusFilter !== "all" &&
        t.contentStatus !== contentStatusFilter
      )
        return false;
      return true;
    });
  }, [tasks, query, priorityFilter, contentStatusFilter]);

  const tasksByStatus: Record<Status, Task[]> = useMemo(
    () => ({
      todo: filteredTasks.filter((t) => t.status === "todo"),
      in_progress: filteredTasks.filter((t) => t.status === "in_progress"),
      done: filteredTasks.filter((t) => t.status === "done")
    }),
    [filteredTasks]
  );

  const activeDragTask = useMemo(
    () => tasks.find((t) => t.id === activeDragId) || null,
    [tasks, activeDragId]
  );

  // ── Render ──
  if (!hydrated) {
    return (
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        <PipelineTopBar title="AI Resources" subtitle="Loading…" />
      </div>
    );
  }

  const totalShown = filteredTopics.length + filteredTasks.length;
  const totalAll = topics.length + tasks.length;

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col">
      <PipelineTopBar
        title="AI Resources"
        subtitle="Generate content ideas with AI, accept the best, ship them through To Do → In Progress → Done."
        actions={
          <>
            <Button
              variant="primary"
              onClick={() => setShowGenerator((v) => !v)}
              disabled={generating}
            >
              {generating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Wand2 className="size-4" />
              )}
              {generating ? "Generating…" : "Generate ideas"}
            </Button>
            {topics.length > 0 ? (
              <button
                onClick={() => void clearAllTopics()}
                disabled={clearing || generating}
                className="h-9 px-3 rounded-md text-xs text-ink-500 hover:text-rose-600 hover:bg-rose-50 inline-flex items-center gap-1.5 transition disabled:opacity-50"
                title="Delete all unreviewed ideas"
              >
                {clearing ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
                Clear ideas
              </button>
            ) : null}
          </>
        }
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search title or keyword"
        }}
        filters={
          <>
            <span className="text-[10px] uppercase tracking-wider text-ink-500 mr-1">
              Priority
            </span>
            <FilterPill
              active={priorityFilter === "all"}
              onClick={() => setPriorityFilter("all")}
            >
              All
            </FilterPill>
            {(["High", "Medium", "Low"] as TopicPriority[]).map((p) => (
              <FilterPill
                key={p}
                active={priorityFilter === p}
                onClick={() => setPriorityFilter(p)}
                customClass={priorityFilter === p ? "" : PRIORITY_TONE[p]}
              >
                {p}
              </FilterPill>
            ))}
            <span className="h-4 w-px bg-ink-200 mx-1" aria-hidden />
            <span className="text-[10px] uppercase tracking-wider text-ink-500 mr-1">
              Draft
            </span>
            <FilterPill
              active={contentStatusFilter === "all"}
              onClick={() => setContentStatusFilter("all")}
            >
              Any
            </FilterPill>
            <FilterPill
              active={contentStatusFilter === "completed"}
              onClick={() => setContentStatusFilter("completed")}
            >
              <CheckCircle2 className="size-3" />
              Ready
            </FilterPill>
            <FilterPill
              active={contentStatusFilter === "generating"}
              onClick={() => setContentStatusFilter("generating")}
            >
              <Loader2 className="size-3" />
              Drafting
            </FilterPill>
            <FilterPill
              active={contentStatusFilter === "not_started"}
              onClick={() => setContentStatusFilter("not_started")}
            >
              Not started
            </FilterPill>
          </>
        }
        countLabel={`${totalShown} of ${totalAll}`}
        banner={
          showGenerator ? (
            <div className="rounded-lg bg-white ring-1 ring-inset ring-ink-200 p-3 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Wand2 className="size-3.5 text-violet-600" />
                  <span className="text-xs font-semibold text-ink-900">
                    Generate ideas
                  </span>
                </div>
                <button
                  onClick={() => setShowGenerator(false)}
                  className="size-5 grid place-items-center rounded text-ink-400 hover:text-ink-700 hover:bg-ink-100"
                >
                  <X className="size-3" />
                </button>
              </div>
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-[10px] uppercase tracking-wider text-ink-500 mb-1 block">
                    Strategist instructions (optional)
                  </label>
                  <textarea
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="e.g. focus on AEO comparison angles, target CFO buyers"
                    rows={2}
                    className="input !text-xs min-h-[60px]"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-ink-500 mb-1 block">
                    Count
                  </label>
                  <select
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                    className="input !text-xs !py-2 mb-2"
                  >
                    {[4, 6, 8, 10, 12].map((n) => (
                      <option key={n} value={n}>
                        {n} ideas
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="primary"
                    onClick={() => void handleGenerate()}
                    loading={generating}
                    disabled={generating}
                    className="w-full !h-8 !text-xs"
                  >
                    <Wand2 className="size-3.5" />
                    Generate
                  </Button>
                </div>
              </div>
            </div>
          ) : null
        }
      />

      {/* Kanban board */}
      <div className="flex-1 min-h-0 overflow-hidden p-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-3 h-full overflow-x-auto scrollbar-thin">
            {/* Ideas column (non-droppable — topics land via AI gen, leave via Accept/Reject) */}
            <PipelineColumn
              title="Ideas"
              count={filteredTopics.length}
              tone="violet"
              emptyState={
                <div className="text-[11px] text-ink-400 text-center py-6 px-2">
                  <Wand2 className="size-5 text-ink-300 mx-auto mb-2" />
                  No ideas yet. Click <span className="font-semibold">Generate ideas</span> to start.
                </div>
              }
              footer={
                rejectStack.length > 0 ? (
                  <div className="px-3 py-2 rounded-md bg-ink-900 text-white text-[11px] flex items-center justify-between gap-2">
                    <span className="truncate">
                      Rejected {rejectStack.length}{" "}
                      {rejectStack.length === 1 ? "idea" : "ideas"}
                    </span>
                    <button
                      onClick={handleUndoReject}
                      className="inline-flex items-center gap-1 text-white/90 hover:text-white font-medium"
                    >
                      <Undo2 className="size-3" />
                      Undo
                    </button>
                  </div>
                ) : null
              }
            >
              {filteredTopics.map((t) => (
                <TopicRow
                  key={t.id}
                  topic={t}
                  busy={busyTopicId === t.id}
                  onAccept={() => handleAccept(t)}
                  onReject={() => handleReject(t)}
                />
              ))}
            </PipelineColumn>

            {/* Production columns (draggable) */}
            <PipelineColumn
              title="To Do"
              count={tasksByStatus.todo.length}
              tone="ink"
              droppableId="todo"
              emptyState={
                <div className="text-[11px] text-ink-400 text-center py-6 px-2">
                  Accept an idea to land it here.
                </div>
              }
            >
              {tasksByStatus.todo.map((task) => (
                <DraggableTaskCard
                  key={task.id}
                  task={task}
                  onClick={() => selectTask(task.id)}
                />
              ))}
            </PipelineColumn>

            <PipelineColumn
              title="In Progress"
              count={tasksByStatus.in_progress.length}
              tone="brand"
              droppableId="in_progress"
              emptyState={
                <div className="text-[11px] text-ink-400 text-center py-6 px-2">
                  Drop cards here to start production.
                </div>
              }
            >
              {tasksByStatus.in_progress.map((task) => (
                <DraggableTaskCard
                  key={task.id}
                  task={task}
                  onClick={() => selectTask(task.id)}
                />
              ))}
            </PipelineColumn>

            <PipelineColumn
              title="Done"
              count={tasksByStatus.done.length}
              tone="emerald"
              droppableId="done"
              emptyState={
                <div className="text-[11px] text-ink-400 text-center py-6 px-2">
                  Drop cards here once published.
                </div>
              }
            >
              {tasksByStatus.done.map((task) => (
                <DraggableTaskCard
                  key={task.id}
                  task={task}
                  onClick={() => selectTask(task.id)}
                />
              ))}
            </PipelineColumn>
          </div>
          <DragOverlay>
            {activeDragTask ? (
              <div className="w-[360px] opacity-90">
                <TaskRow task={activeDragTask} onClick={() => {}} isDragOverlay />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {selectedTask ? (
        <CardDetailPanel key={selectedTask.id} task={selectedTask} />
      ) : null}
      {selectedTask ? (
        <button
          aria-label="Close panel"
          className="fixed inset-0 z-30 bg-ink-900/20 backdrop-blur-[1px]"
          onClick={() => selectTask(null)}
        />
      ) : null}
    </div>
  );
}

// ── Topic card (Ideas column) ──
function TopicRow({
  topic,
  busy,
  onAccept,
  onReject
}: {
  topic: Topic;
  busy: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  const impact = topic.impactScore ?? topic.priorityScore;
  const novelty = topic.noveltyScore ?? 100;
  const hasOverlap = Boolean(topic.overlapWithUrl);

  const signals: CardBadge[] = [];
  if (hasOverlap) {
    signals.push({
      label: "Cannibalization risk",
      icon: <SignalIcons.Cannibalization className="size-3" />,
      className: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200",
      title: `Overlaps with ${topic.overlapWithTitle || topic.overlapWithUrl}`
    });
  }

  return (
    <PipelineCard
      id={topic.id}
      title={topic.title}
      subline={{ label: "kw", value: topic.targetKeyword }}
      typeBadge={{
        label: topic.contentType,
        className: TYPE_TONE[topic.contentType] || "bg-ink-100 text-ink-700"
      }}
      priorityBadge={{
        label: topic.priority,
        className: PRIORITY_TONE[topic.priority]
      }}
      score={impact}
      scoreTone={pickScoreTone(impact)}
      signals={signals}
      breakdown={[
        { label: "Impact", value: impact, max: 100 },
        {
          label: "Novelty",
          value: novelty,
          max: 100,
          tone: novelty >= 70 ? "good" : "warn"
        },
        { label: "Priority", value: topic.priorityScore, max: 100 }
      ]}
      breakdownLabel="Why this idea"
      breakdownDetails={
        <div className="space-y-1">
          {topic.whyOpportunity ? (
            <p className="line-clamp-3">{topic.whyOpportunity}</p>
          ) : null}
          {topic.searchIntent ? (
            <div className="text-[10px] text-ink-500">
              <span className="uppercase tracking-wider mr-1">Intent:</span>
              {topic.searchIntent}
            </div>
          ) : null}
        </div>
      }
      footer={
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
      }
    />
  );
}

// ── Task card (Production columns) ──
function DraggableTaskCard({
  task,
  onClick
}: {
  task: Task;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(isDragging && "opacity-30")}
    >
      <TaskRow task={task} onClick={onClick} />
    </div>
  );
}

function TaskRow({
  task,
  onClick,
  isDragOverlay
}: {
  task: Task;
  onClick: () => void;
  isDragOverlay?: boolean;
}) {
  const topic = task.topic;
  const contentLabel = CONTENT_STATUS_LABEL[task.contentStatus] || "—";

  const signals: CardBadge[] = [];
  if (task.contentStatus === "completed") {
    signals.push({
      label: "Draft ready",
      icon: <CheckCircle2 className="size-3" />,
      className:
        "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"
    });
  } else if (task.contentStatus === "generating") {
    signals.push({
      label: "Generating…",
      icon: <Loader2 className="size-3 animate-spin" />,
      className: "bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200"
    });
  }
  if (topic.overlapWithUrl) {
    signals.push({
      label: "Cannibalization risk",
      icon: <SignalIcons.Cannibalization className="size-3" />,
      className: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200"
    });
  }

  return (
    <PipelineCard
      id={task.id}
      title={topic.title}
      subline={{
        label: contentLabel === "—" ? "kw" : "status",
        value: contentLabel === "—" ? topic.targetKeyword : contentLabel
      }}
      typeBadge={{
        label: topic.contentType,
        className: TYPE_TONE[topic.contentType] || "bg-ink-100 text-ink-700"
      }}
      priorityBadge={{
        label: topic.priority,
        className: PRIORITY_TONE[topic.priority]
      }}
      score={topic.priorityScore}
      scoreTone={pickScoreTone(topic.priorityScore)}
      signals={signals}
      footer={
        <button
          onClick={onClick}
          className="flex-1 h-7 px-2 rounded-md bg-white hover:bg-ink-50 ring-1 ring-inset ring-ink-200 text-ink-700 text-xs font-medium transition inline-flex items-center justify-center gap-1"
        >
          Open
          <ChevronRight className="size-3" />
        </button>
      }
      onClick={onClick}
      isDragOverlay={isDragOverlay}
    />
  );
}

// Silence unused legacy imports.
void Sparkles;
void AlertTriangle;
