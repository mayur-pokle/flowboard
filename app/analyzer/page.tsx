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
  ChevronRight,
  Search,
  X
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
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { LLMStepper } from "@/components/ui/LLMStepper";
import {
  useBoardPreferences,
  SORT_OPTIONS,
  priorityWeight,
  type SortKey
} from "@/lib/use-board-preferences";
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
  const [postBody, setPostBody] = useState("");
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
          notes: notes.trim() || undefined,
          postBody: postBody.trim() || undefined
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
      setPostBody("");
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
        title="Analyzer"
        subtitle="Submit a candidate topic. Get cannibalization checks, playbook detection, a brief, and a scored recommendation before you commit."
        actions={
          <div
            className="flex items-center gap-1 rounded-md bg-ink-100 p-0.5"
            role="tablist"
            aria-label="Analyzer sections"
          >
            <button
              onClick={() => setTab("analyze")}
              role="tab"
              aria-selected={tab === "analyze"}
              className={cn(
                "h-8 px-3 rounded text-xs font-medium transition focus-ring",
                tab === "analyze"
                  ? "bg-white text-ink-900 shadow-sm"
                  : "text-ink-600 hover:text-ink-900"
              )}
            >
              <Wand2 className="size-3.5 inline mr-1.5" aria-hidden />
              Analyze
            </button>
            <button
              onClick={() => setTab("bucket")}
              role="tab"
              aria-selected={tab === "bucket"}
              className={cn(
                "h-8 px-3 rounded text-xs font-medium transition focus-ring",
                tab === "bucket"
                  ? "bg-white text-ink-900 shadow-sm"
                  : "text-ink-600 hover:text-ink-900"
              )}
            >
              <Microscope className="size-3.5 inline mr-1.5" aria-hidden />
              Queue
              {topics.length > 0 ? (
                <span
                  className="ml-1.5 text-[10px] bg-ink-200 text-ink-700 rounded px-1 tabular-nums"
                  aria-label={`${topics.length} in queue`}
                >
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
          postBody={postBody}
          setPostBody={setPostBody}
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
  postBody,
  setPostBody,
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
  postBody: string;
  setPostBody: (v: string) => void;
  analyzing: boolean;
  onAnalyze: () => void;
  lastAnalyzed: AnalyzedTopic | null;
  onOpenDetail: () => void;
  onGoToBucket: () => void;
  totalCount: number;
}) {
  // Word count preview — helps the strategist eyeball whether the
  // draft is close to the target range before submitting.
  const draftWordCount = postBody
    ? postBody.trim().split(/\s+/).filter(Boolean).length
    : 0;
  // Progressive disclosure: Post body stays hidden behind a link on
  // first render. Once the strategist expands it (or the field has
  // content, e.g. because we're revisiting a partially typed form),
  // the textarea appears. Keeps the default form to 3 fields — the
  // 90% case.
  const [showPostBody, setShowPostBody] = useState<boolean>(
    Boolean(postBody && postBody.length > 0)
  );
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

          {/* Progressive disclosure — Post body is collapsed by default.
              90% of submissions are just title/keyword/notes. When the
              strategist actually has a draft, they click to reveal. */}
          {!showPostBody ? (
            <button
              type="button"
              onClick={() => setShowPostBody(true)}
              disabled={analyzing}
              className="mb-4 inline-flex items-center gap-1.5 text-xs text-ink-600 hover:text-ink-900 rounded-md border border-dashed border-ink-300 hover:border-ink-400 px-3 py-2 transition w-full sm:w-auto"
            >
              <Sparkles className="size-3.5 text-brand-600" />
              <span className="font-medium text-ink-800">
                + Add a draft to check copy quality
              </span>
              <span className="text-ink-400 font-normal">
                (optional — runs 5 quality checks)
              </span>
            </button>
          ) : (
            <>
              <div className="flex items-baseline justify-between mb-1">
                <label className="text-xs font-medium text-ink-800 block">
                  Post body{" "}
                  <span className="text-ink-400 font-normal">
                    (optional — paste your draft to also run quality checks)
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  {postBody ? (
                    <span className="text-[10px] text-ink-500 tabular-nums">
                      {draftWordCount.toLocaleString()} words
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setPostBody("");
                      setShowPostBody(false);
                    }}
                    disabled={analyzing}
                    className="text-[10px] text-ink-500 hover:text-ink-800 inline-flex items-center gap-0.5"
                    title="Hide draft field"
                  >
                    <X className="size-3" />
                    Hide
                  </button>
                </div>
              </div>
              <textarea
                value={postBody}
                onChange={(e) => setPostBody(e.target.value)}
                placeholder="# The article title&#10;&#10;First paragraph goes here — direct answer to the topic, ideally 40–80 words containing the target keyword…&#10;&#10;## First H2&#10;&#10;..."
                rows={10}
                className="input mb-2 !text-xs font-mono leading-relaxed min-h-[220px]"
                disabled={analyzing}
                maxLength={60000}
              />
              <p className="text-[11px] text-ink-500 mb-4 leading-relaxed">
                When you paste a draft, the analyzer also runs quality
                checks — direct-answer opening, comparison table, FAQ
                section, cannibalization against your library, and word
                count vs. the playbook&apos;s target range. Draft failures
                downgrade the recommendation so you don&apos;t ship broken
                copy.
              </p>
            </>
          )}

          {analyzing ? (
            <div className="mb-3">
              <LLMStepper
                title="Analyzing this topic"
                steps={
                  postBody
                    ? [
                        "Reading brand + competitor context…",
                        "Detecting playbook + intent…",
                        "Checking cannibalization vs. your library…",
                        "Running quality checks on your draft…",
                        "Scoring across the 6-pillar model…"
                      ]
                    : [
                        "Reading brand + competitor context…",
                        "Detecting playbook + intent…",
                        "Checking cannibalization vs. your library…",
                        "Scoring across the 6-pillar model…",
                        "Building the brief + recommendation…"
                      ]
                }
                tone="brand"
                cadenceMs={900}
                ariaLabel="Analyzing topic in progress"
              />
            </div>
          ) : null}
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
                View queue ({totalCount})
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
            lands in the queue where you can triage, enrich, and
            promote it to Opportunities or Content.
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

type VerdictFilter = "all" | "proceed" | "refine" | "reconsider";

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
  // Search + verdict filter + sort. Persisted per-user in localStorage
  // so a triage cut survives reload/tab-switch. Applies across all 4
  // columns so the strategist can slice a bucket of 30+ topics down to
  // the 3 that need attention without column-switching.
  const [prefs, setPrefs] = useBoardPreferences<{
    query: string;
    verdictFilter: VerdictFilter;
    sortKey: SortKey;
  }>("analyzer", {
    query: "",
    verdictFilter: "all",
    sortKey: "newest"
  });
  const { query, verdictFilter, sortKey } = prefs;
  const setQuery = (v: string) => setPrefs({ query: v });
  const setVerdictFilter = (v: VerdictFilter) => setPrefs({ verdictFilter: v });
  const setSortKey = (v: SortKey) => setPrefs({ sortKey: v });
  // Confirm-modal state for delete. Holds the target id + title so the
  // modal can render a preview line, plus loading state so the button
  // spins during the DELETE round-trip.
  const [confirmDelete, setConfirmDelete] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filteredTopics = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = topics.filter((t) => {
      // Verdict filter — treats un-analyzed rows as "all" only. If the
      // strategist picks a verdict, we require an analysis payload
      // matching that verdict.
      if (verdictFilter !== "all") {
        if (!t.analysis || t.analysis.recommendation.verdict !== verdictFilter) {
          return false;
        }
      }
      if (!q) return true;
      // Search matches title + keyword. Case-insensitive substring.
      const hayTitle = t.title.toLowerCase();
      const hayKw = (t.targetKeyword || "").toLowerCase();
      return hayTitle.includes(q) || hayKw.includes(q);
    });
    // Sort applies after filter — same visible set the user's looking
    // at, just reordered. Sort is stable so equal-score rows keep
    // insertion order (which is newest-first from the API).
    const sorted = filtered.slice();
    sorted.sort((a, b) => {
      switch (sortKey) {
        case "oldest":
          return a.createdAt.localeCompare(b.createdAt);
        case "score-desc":
          return (b.analysis?.score ?? -1) - (a.analysis?.score ?? -1);
        case "score-asc":
          return (a.analysis?.score ?? 999) - (b.analysis?.score ?? 999);
        case "priority":
          return (
            priorityWeight(b.analysis?.priorityTier.code) -
            priorityWeight(a.analysis?.priorityTier.code)
          );
        case "title-asc":
          return a.title.localeCompare(b.title);
        case "newest":
        default:
          return b.createdAt.localeCompare(a.createdAt);
      }
    });
    return sorted;
  }, [topics, query, verdictFilter, sortKey]);

  const byColumn = useMemo(() => {
    const out: Record<AnalyzerColumn, AnalyzedTopic[]> = {
      draft: [],
      analyzed: [],
      approved: [],
      archived: []
    };
    for (const t of filteredTopics) {
      const col = COLUMN_ORDER.includes(t.kanbanColumn)
        ? t.kanbanColumn
        : "draft";
      out[col].push(t);
    }
    return out;
  }, [filteredTopics]);

  // Verdict counts for the filter chips — recomputed against the full
  // unfiltered set so the count reflects "topics matching this verdict"
  // even after other filters are applied.
  const verdictCounts = useMemo(() => {
    const counts = { all: topics.length, proceed: 0, refine: 0, reconsider: 0 };
    for (const t of topics) {
      const v = t.analysis?.recommendation.verdict;
      if (v === "proceed") counts.proceed++;
      else if (v === "refine") counts.refine++;
      else if (v === "reconsider") counts.reconsider++;
    }
    return counts;
  }, [topics]);

  const hasFilters = Boolean(query || verdictFilter !== "all");
  const totalMatches = filteredTopics.length;

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

  function requestDelete(id: string, title: string) {
    setConfirmDelete({ id, title });
  }
  async function performDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/analyzer/${confirmDelete.id}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error("Delete failed");
      toast("Topic deleted", "info");
      setConfirmDelete(null);
      onRefresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setDeleting(false);
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
            Queue is empty
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
    <div className="flex-1 min-h-0 overflow-hidden p-4 flex flex-col">
      {/* Search + verdict filter — always visible when there are any
          topics so scale doesn't sneak up on the strategist. */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="size-3.5 text-ink-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title or keyword…"
            className="input !h-8 !text-xs pl-8 pr-8"
          />
          {query ? (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
              title="Clear"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-1 rounded-md bg-ink-100 p-0.5 text-xs">
          {(
            [
              { key: "all", label: "All", tone: "bg-white text-ink-900" },
              {
                key: "proceed",
                label: "Proceed",
                tone: "bg-emerald-500 text-white"
              },
              {
                key: "refine",
                label: "Refine",
                tone: "bg-amber-500 text-white"
              },
              {
                key: "reconsider",
                label: "Reconsider",
                tone: "bg-rose-500 text-white"
              }
            ] as const
          ).map((chip) => {
            const isActive = verdictFilter === chip.key;
            const count = verdictCounts[chip.key];
            return (
              <button
                key={chip.key}
                onClick={() => setVerdictFilter(chip.key)}
                className={cn(
                  "h-7 px-2.5 rounded font-medium transition inline-flex items-center gap-1.5",
                  isActive
                    ? chip.tone + " shadow-sm"
                    : "text-ink-600 hover:text-ink-900"
                )}
              >
                {chip.label}
                <span
                  className={cn(
                    "text-[10px] rounded px-1 tabular-nums",
                    isActive
                      ? "bg-white/20 text-white"
                      : "bg-ink-200 text-ink-600"
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-[11px] text-ink-500 inline-flex items-center gap-1.5">
            <span className="uppercase tracking-wider">Sort</span>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="h-7 rounded-md border border-ink-200 bg-white text-xs px-1.5 focus-ring"
              aria-label="Sort order"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {hasFilters ? (
            <div className="text-[11px] text-ink-500 inline-flex items-center gap-2">
              <span>
                Showing {totalMatches} of {topics.length}
              </span>
              <button
                onClick={() => {
                  setQuery("");
                  setVerdictFilter("all");
                }}
                className="text-ink-600 hover:text-ink-900 underline"
              >
                Clear filters
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex gap-3 flex-1 min-h-0 overflow-x-auto scrollbar-thin">
        {COLUMN_ORDER.map((col) => (
          <PipelineColumn
            key={col}
            title={COLUMN_LABEL[col]}
            count={byColumn[col].length}
            tone={COLUMN_TONE[col]}
            emptyState={
              <div className="text-[11px] text-ink-400 text-center py-6 px-2">
                {hasFilters
                  ? "No topics match this filter."
                  : col === "draft"
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
                onDelete={() => requestDelete(t.id, t.title)}
              />
            ))}
          </PipelineColumn>
        ))}
      </div>
      <ConfirmModal
        open={confirmDelete !== null}
        title="Delete this topic?"
        message="This can't be undone. The full analysis, brief, any enrichment, and draft body will be permanently removed."
        preview={confirmDelete?.title}
        confirmLabel="Delete permanently"
        tone="danger"
        loading={deleting}
        onConfirm={performDelete}
        onCancel={() => (deleting ? null : setConfirmDelete(null))}
      />
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

  // Verdict-colored left rail — the primary "which cards need attention"
  // signal. Green = ship it, amber = fix things first, rose = probably
  // skip, ink = still un-analyzed.
  const verdict = a?.recommendation.verdict;
  const rail: "emerald" | "amber" | "rose" | "ink" | null =
    verdict === "proceed"
      ? "emerald"
      : verdict === "refine"
      ? "amber"
      : verdict === "reconsider"
      ? "rose"
      : a
      ? "ink"
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
          ? { label: "Keyword", value: topic.targetKeyword }
          : a && a.targetKeyword
          ? { label: "Keyword", value: a.targetKeyword }
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
      leftRail={rail}
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
