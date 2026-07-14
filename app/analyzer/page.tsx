"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Microscope,
  Wand2,
  Loader2,
  Trash2,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/Toast";
import { PipelineColumn } from "@/components/pipeline/PipelineColumn";
import {
  PipelineCard,
  pickScoreTone
} from "@/components/pipeline/PipelineCard";
import { PipelineTopBar } from "@/components/pipeline/PipelineTopBar";
import { AnalyzerDetailPanel } from "@/components/analyzer/AnalyzerDetailPanel";
import {
  COLUMN_LABEL,
  COLUMN_ORDER,
  COLUMN_TONE,
  type AnalyzedTopic,
  type AnalyzerColumn
} from "@/components/analyzer/types";
import { cn } from "@/lib/utils";

type Tab = "analyze" | "bucket";

export default function TopicAnalyzerPage() {
  const [tab, setTab] = useState<Tab>("analyze");
  const [topics, setTopics] = useState<AnalyzedTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  // Analyze tab local state
  const [title, setTitle] = useState("");
  const [targetKeyword, setTargetKeyword] = useState("");
  const [notes, setNotes] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [lastAnalyzedId, setLastAnalyzedId] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/analyzer");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load");
      setTopics(json.topics || []);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  const openTopic = useMemo(
    () => topics.find((t) => t.id === openId) || null,
    [topics, openId]
  );

  async function handleAnalyze() {
    if (title.trim().length < 5) {
      toast("Topic title needs at least 5 characters.", "error");
      return;
    }
    setAnalyzing(true);
    try {
      const res = await fetch("/api/analyzer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          targetKeyword: targetKeyword.trim() || undefined,
          notes: notes.trim() || undefined
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Analysis failed");
      const newTopic: AnalyzedTopic = json.topic;
      setTopics((prev) => [newTopic, ...prev]);
      setLastAnalyzedId(newTopic.id);
      toast("Analysis ready — review the report below", "success");
      // Reset the form for the next submission but leave notes clear
      setTitle("");
      setTargetKeyword("");
      setNotes("");
      // Auto-open the panel so the strategist sees the report
      setOpenId(newTopic.id);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setAnalyzing(false);
    }
  }

  const lastAnalyzed = useMemo(
    () => topics.find((t) => t.id === lastAnalyzedId) || null,
    [topics, lastAnalyzedId]
  );

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col">
      <PipelineTopBar
        title="Topic Analyzer"
        subtitle="Submit a candidate topic one at a time. Get cannibalization checks, playbook detection, brief, and a scored recommendation before you commit."
        actions={
          <div className="flex items-center gap-1 rounded-md bg-ink-100 p-0.5">
            <button
              onClick={() => setTab("analyze")}
              className={cn(
                "h-8 px-3 rounded text-xs font-medium transition",
                tab === "analyze"
                  ? "bg-white text-ink-900 shadow-sm"
                  : "text-ink-600 hover:text-ink-900"
              )}
            >
              <Wand2 className="size-3.5 inline mr-1.5" />
              Analyze
            </button>
            <button
              onClick={() => setTab("bucket")}
              className={cn(
                "h-8 px-3 rounded text-xs font-medium transition",
                tab === "bucket"
                  ? "bg-white text-ink-900 shadow-sm"
                  : "text-ink-600 hover:text-ink-900"
              )}
            >
              <Microscope className="size-3.5 inline mr-1.5" />
              Bucket
              {topics.length > 0 ? (
                <span className="ml-1.5 text-[10px] bg-ink-200 text-ink-700 rounded px-1 tabular-nums">
                  {topics.length}
                </span>
              ) : null}
            </button>
          </div>
        }
      />

      {tab === "analyze" ? (
        <AnalyzeTab
          title={title}
          setTitle={setTitle}
          targetKeyword={targetKeyword}
          setTargetKeyword={setTargetKeyword}
          notes={notes}
          setNotes={setNotes}
          analyzing={analyzing}
          onAnalyze={handleAnalyze}
          lastAnalyzed={lastAnalyzed}
          onOpenDetail={() => lastAnalyzed && setOpenId(lastAnalyzed.id)}
          onGoToBucket={() => setTab("bucket")}
          totalCount={topics.length}
        />
      ) : (
        <BucketTab
          topics={topics}
          loading={loading}
          onOpen={(id) => setOpenId(id)}
          onRefresh={load}
        />
      )}

      {openTopic ? (
        <AnalyzerDetailPanel
          key={openTopic.id}
          topic={openTopic}
          onClose={() => setOpenId(null)}
          onRefresh={load}
          onDeleted={(id) =>
            setTopics((prev) => prev.filter((t) => t.id !== id))
          }
        />
      ) : null}
    </div>
  );
}

// ── Analyze tab ──────────────────────────────────────────────────────

function AnalyzeTab({
  title,
  setTitle,
  targetKeyword,
  setTargetKeyword,
  notes,
  setNotes,
  analyzing,
  onAnalyze,
  lastAnalyzed,
  onOpenDetail,
  onGoToBucket,
  totalCount
}: {
  title: string;
  setTitle: (v: string) => void;
  targetKeyword: string;
  setTargetKeyword: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  analyzing: boolean;
  onAnalyze: () => void;
  lastAnalyzed: AnalyzedTopic | null;
  onOpenDetail: () => void;
  onGoToBucket: () => void;
  totalCount: number;
}) {
  return (
    <div className="flex-1 min-h-0 overflow-auto scrollbar-thin px-6 py-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Submission form */}
        <div className="rounded-xl border border-ink-200 bg-white p-5">
          <h2 className="text-base font-semibold text-ink-900 mb-1">
            Submit a topic
          </h2>
          <p className="text-xs text-ink-600 mb-4">
            One topic at a time. The analyzer runs against your brand
            context, competitors, and Content Library — no LLM call
            needed for the base report. Deeper research is one click
            away.
          </p>

          <label className="text-xs font-medium text-ink-800 mb-1 block">
            Topic title *
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. AI accountants vs. human bookkeepers — when to switch"
            className="input mb-3"
            disabled={analyzing}
            maxLength={200}
          />

          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs font-medium text-ink-800 mb-1 block">
                Target keyword{" "}
                <span className="text-ink-400 font-normal">
                  (optional — derived from title if blank)
                </span>
              </label>
              <input
                type="text"
                value={targetKeyword}
                onChange={(e) => setTargetKeyword(e.target.value)}
                placeholder="e.g. ai accountant vs human"
                className="input font-mono !text-xs"
                disabled={analyzing}
                maxLength={100}
              />
            </div>
            <div className="flex items-end">
              <div className="text-[11px] text-ink-500 leading-relaxed">
                We&apos;ll detect intent, choose a playbook, and score
                the topic across the 6-pillar Discovery grid.
              </div>
            </div>
          </div>

          <label className="text-xs font-medium text-ink-800 mb-1 block">
            Notes{" "}
            <span className="text-ink-400 font-normal">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Why are you considering this? Any audience or angle constraints?"
            rows={3}
            className="input mb-4 !text-xs"
            disabled={analyzing}
            maxLength={2000}
          />

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="primary"
              onClick={onAnalyze}
              disabled={analyzing || title.trim().length < 5}
              loading={analyzing}
            >
              <Wand2 className="size-4" />
              {analyzing ? "Analyzing…" : "Analyze topic"}
            </Button>
            {totalCount > 0 ? (
              <button
                onClick={onGoToBucket}
                className="text-xs text-ink-600 hover:text-ink-900 inline-flex items-center gap-1"
              >
                View bucket ({totalCount})
                <ChevronRight className="size-3" />
              </button>
            ) : null}
          </div>
        </div>

        {/* Recap of the most-recent analysis */}
        {lastAnalyzed && lastAnalyzed.analysis ? (
          <RecentAnalysisCard
            topic={lastAnalyzed}
            onOpenDetail={onOpenDetail}
          />
        ) : null}

        {/* First-run guidance if the bucket is empty */}
        {totalCount === 0 && !analyzing ? (
          <div className="text-center text-xs text-ink-500 py-6">
            <Sparkles className="size-5 text-ink-300 mx-auto mb-2" />
            Start by submitting your first topic above. Every analysis
            lands in the bucket where you can triage, enrich, and
            promote it to AI Discovery or AI Resources.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RecentAnalysisCard({
  topic,
  onOpenDetail
}: {
  topic: AnalyzedTopic;
  onOpenDetail: () => void;
}) {
  const a = topic.analysis!;
  const rec = a.recommendation;
  const tone =
    rec.verdict === "proceed"
      ? {
          wrap: "border-emerald-200 bg-emerald-50",
          text: "text-emerald-900",
          icon: <CheckCircle2 className="size-4 text-emerald-600" />,
          label: "Proceed"
        }
      : rec.verdict === "refine"
      ? {
          wrap: "border-amber-200 bg-amber-50",
          text: "text-amber-900",
          icon: <AlertTriangle className="size-4 text-amber-600" />,
          label: "Refine"
        }
      : {
          wrap: "border-rose-200 bg-rose-50",
          text: "text-rose-900",
          icon: <AlertCircle className="size-4 text-rose-600" />,
          label: "Reconsider"
        };
  return (
    <div className={cn("rounded-xl border p-5", tone.wrap)}>
      <div className="flex items-center gap-2 mb-2">
        {tone.icon}
        <span
          className={cn(
            "text-xs font-semibold uppercase tracking-wider",
            tone.text
          )}
        >
          Recommendation · {tone.label}
        </span>
        <span className="ml-auto text-xs text-ink-500">
          Score {a.score.toFixed(1)} · {a.priorityTier.label}
        </span>
      </div>
      <h3 className="text-base font-semibold text-ink-900 mb-1">
        {topic.title}
      </h3>
      <p className={cn("text-xs mb-3", tone.text)}>{rec.summary}</p>
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="primary" onClick={onOpenDetail}>
          Open full report
          <ArrowRight className="size-4" />
        </Button>
        <div className="text-[11px] text-ink-500">
          Full brief, cannibalization matches, competitor coverage, AEO
          angle, and promotion actions inside.
        </div>
      </div>
    </div>
  );
}

// ── Bucket tab ───────────────────────────────────────────────────────

function BucketTab({
  topics,
  loading,
  onOpen,
  onRefresh
}: {
  topics: AnalyzedTopic[];
  loading: boolean;
  onOpen: (id: string) => void;
  onRefresh: () => void;
}) {
  const byColumn = useMemo(() => {
    const out: Record<AnalyzerColumn, AnalyzedTopic[]> = {
      draft: [],
      analyzed: [],
      approved: [],
      archived: []
    };
    for (const t of topics) {
      const col = COLUMN_ORDER.includes(t.kanbanColumn)
        ? t.kanbanColumn
        : "draft";
      out[col].push(t);
    }
    return out;
  }, [topics]);

  async function move(id: string, col: AnalyzerColumn) {
    try {
      const res = await fetch(`/api/analyzer/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kanbanColumn: col })
      });
      if (!res.ok) throw new Error("Move failed");
      onRefresh();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function remove(id: string, title: string) {
    if (!window.confirm(`Delete "${title}"? This can't be undone.`))
      return;
    try {
      const res = await fetch(`/api/analyzer/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      toast("Topic deleted", "info");
      onRefresh();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  if (loading) {
    return (
      <div className="flex-1 grid place-items-center text-sm text-ink-500">
        Loading…
      </div>
    );
  }
  if (topics.length === 0) {
    return (
      <div className="flex-1 grid place-items-center">
        <div className="text-center max-w-md">
          <div className="size-12 rounded-xl bg-brand-50 text-brand-600 grid place-items-center mx-auto mb-4">
            <Microscope className="size-6" />
          </div>
          <h2 className="text-base font-semibold text-ink-900 mb-1">
            Bucket is empty
          </h2>
          <p className="text-sm text-ink-600 mb-4">
            Submit your first topic on the Analyze tab. It&apos;ll land
            here in the Analyzed column once the report is ready.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-hidden p-4">
      <div className="flex gap-3 h-full overflow-x-auto scrollbar-thin">
        {COLUMN_ORDER.map((col) => (
          <PipelineColumn
            key={col}
            title={COLUMN_LABEL[col]}
            count={byColumn[col].length}
            tone={COLUMN_TONE[col]}
            emptyState={
              <div className="text-[11px] text-ink-400 text-center py-6 px-2">
                {col === "draft"
                  ? "In-flight analyses land here briefly."
                  : col === "analyzed"
                  ? "Reports ready to review."
                  : col === "approved"
                  ? "Locked-in topics ready to promote."
                  : "Archived — not shipping."}
              </div>
            }
          >
            {byColumn[col].map((t) => (
              <BucketCard
                key={t.id}
                topic={t}
                onOpen={() => onOpen(t.id)}
                onMove={(c) => move(t.id, c)}
                onDelete={() => remove(t.id, t.title)}
              />
            ))}
          </PipelineColumn>
        ))}
      </div>
    </div>
  );
}

function BucketCard({
  topic,
  onOpen,
  onMove,
  onDelete
}: {
  topic: AnalyzedTopic;
  onOpen: () => void;
  onMove: (col: AnalyzerColumn) => void;
  onDelete: () => void;
}) {
  const a = topic.analysis;
  const score = a?.score ?? 0;
  const scoreTone = pickScoreTone(score);
  const nextCol =
    topic.kanbanColumn === "draft"
      ? "analyzed"
      : topic.kanbanColumn === "analyzed"
      ? "approved"
      : topic.kanbanColumn === "approved"
      ? "archived"
      : null;

  const signals = [];
  if (a?.aiCitationGap) {
    signals.push({
      label: "AI citation gap",
      className:
        "bg-[#EEEEFD] text-[#4A4DC9] ring-1 ring-inset ring-[#D5D6FF]"
    });
  }
  if (a?.cannibalization.verdict === "block") {
    signals.push({
      label: "Cannibalization block",
      className:
        "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200"
    });
  } else if (a?.cannibalization.verdict === "review") {
    signals.push({
      label: "Cannibalization review",
      className:
        "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200"
    });
  }
  if (topic.promotedToDiscoveryId || topic.promotedToTaskId) {
    signals.push({
      label: "Promoted",
      className:
        "bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200"
    });
  }

  return (
    <PipelineCard
      id={topic.id}
      title={topic.title}
      subline={
        topic.targetKeyword && a
          ? { label: "kw", value: topic.targetKeyword }
          : a && a.targetKeyword
          ? { label: "kw", value: a.targetKeyword }
          : null
      }
      typeBadge={
        a
          ? {
              label: a.playbookLabel,
              className:
                "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200"
            }
          : undefined
      }
      priorityBadge={
        a
          ? {
              label: a.priorityTier.code,
              className:
                a.priorityTier.code === "P0" || a.priorityTier.code === "P1"
                  ? "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200"
                  : "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200"
            }
          : undefined
      }
      score={a ? Math.round(score) : undefined}
      scoreTone={scoreTone}
      signals={signals}
      indicator={
        a?.recommendation.verdict === "proceed"
          ? { label: "Proceed", tone: "success" }
          : a?.recommendation.verdict === "refine"
          ? { label: "Refine", tone: "warn" }
          : a
          ? { label: "Reconsider", tone: "warn" }
          : undefined
      }
      onClick={onOpen}
      footer={
        <>
          {nextCol ? (
            <button
              onClick={() => onMove(nextCol)}
              className="flex-1 h-7 px-2 rounded-md bg-ink-900 hover:bg-ink-800 text-white text-xs font-medium transition inline-flex items-center justify-center gap-1"
            >
              {`Move → ${COLUMN_LABEL[nextCol]}`}
            </button>
          ) : (
            <button
              onClick={onOpen}
              className="flex-1 h-7 px-2 rounded-md bg-white hover:bg-ink-50 ring-1 ring-inset ring-ink-200 text-ink-700 text-xs font-medium transition inline-flex items-center justify-center gap-1"
            >
              Open
              <ChevronRight className="size-3" />
            </button>
          )}
          <button
            onClick={onDelete}
            className="h-7 px-2 rounded-md text-ink-400 hover:text-rose-600 hover:bg-rose-50"
            title="Delete permanently"
          >
            <Trash2 className="size-3.5" />
          </button>
        </>
      }
    />
  );
}

// Silence unused Link import — kept in case follow-up wants deep-linking.
void Link;
