"use client";

import {
  Sparkles,
  TrendingUp,
  CheckCircle2,
  Loader2,
  ChevronRight
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import {
  scoreTone,
  SCORE_TONE_CLASSES,
  TYPE_LABEL,
  TYPE_BADGE_CLASS,
  PRIORITY_LABEL,
  PRIORITY_BADGE_CLASS,
  SOURCE_LABEL,
  SOURCE_TONE,
  AI_CITATION_BADGE_CLASS,
  TRENDING_BADGE_CLASS,
  type KanbanColumn
} from "./tokens";
import type { Opportunity } from "./types";
import { cn } from "@/lib/utils";

interface Props {
  opp: Opportunity;
  column: KanbanColumn;
  busy?: boolean;
  onOpenDetail: () => void;
  onAccept: () => void;
  onReject: () => void;
  onViewBrief: () => void;
  onGenerateContent: () => void;
  onMarkDone: () => void;
}

// One self-contained decision unit. Score rail is the anchor; signals
// + actions adapt to which column the card sits in.
export function OpportunityCard({
  opp,
  column,
  busy,
  onOpenDetail,
  onAccept,
  onReject,
  onViewBrief,
  onGenerateContent,
  onMarkDone
}: Props) {
  const tone = scoreTone(opp.score);
  const toneCls = SCORE_TONE_CLASSES[tone];

  return (
    <div
      className={cn(
        "group relative bg-white border border-ink-200 rounded-lg p-3",
        "hover:border-ink-300 hover:shadow-md transition cursor-pointer"
      )}
      onClick={onOpenDetail}
    >
      {/* Top row — type, priority, score */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span
            className={cn(
              "badge text-[10px]",
              TYPE_BADGE_CLASS[opp.opportunityType]
            )}
          >
            {TYPE_LABEL[opp.opportunityType]}
          </span>
          <span
            className={cn(
              "badge text-[10px] font-semibold",
              PRIORITY_BADGE_CLASS[opp.priority]
            )}
          >
            {PRIORITY_LABEL[opp.priority]}
          </span>
        </div>
        <div
          className={cn(
            "shrink-0 px-2 py-0.5 rounded-md font-bold tabular-nums text-sm",
            toneCls.bg,
            toneCls.text
          )}
        >
          {opp.score}
        </div>
      </div>

      {/* Query — the headline */}
      <div className="font-mono text-sm font-semibold text-ink-900 mb-2 leading-snug line-clamp-2">
        {opp.query}
      </div>

      {/* Signals — trending + AI citation gap */}
      {(opp.trending || opp.aiCitationGap) && (
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          {opp.trending ? (
            <span
              className={cn(
                "badge text-[10px] inline-flex items-center gap-1",
                TRENDING_BADGE_CLASS
              )}
            >
              <TrendingUp className="size-3" />
              Trending
            </span>
          ) : null}
          {opp.aiCitationGap ? (
            <span
              className={cn(
                "badge text-[10px] inline-flex items-center gap-1",
                AI_CITATION_BADGE_CLASS
              )}
            >
              <Sparkles className="size-3" />
              AI citation gap
            </span>
          ) : null}
        </div>
      )}

      {/* 3-metric row — impressions / gap / position */}
      <div className="grid grid-cols-3 gap-2 py-2 my-2 border-y border-ink-100">
        <Metric
          label="Impressions"
          value={
            opp.weeklyImpressions
              ? opp.weeklyImpressions.toLocaleString()
              : "—"
          }
        />
        <Metric
          label="Gap"
          value={opp.competitorGapScore ? `${opp.competitorGapScore}` : "—"}
        />
        <Metric
          label="Pos"
          value={
            opp.metrics?.position != null
              ? `#${(opp.metrics.position as number).toFixed(1)}`
              : "—"
          }
        />
      </div>

      {/* Source label */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <Badge
          tone={SOURCE_TONE[opp.source] || "neutral"}
          className="!text-[10px] uppercase tracking-wider"
        >
          {SOURCE_LABEL[opp.source] || opp.source}
        </Badge>
        {opp.briefData ? (
          <span className="text-[10px] text-ink-500 inline-flex items-center gap-1">
            <CheckCircle2 className="size-3 text-emerald-500" />
            Brief ready
          </span>
        ) : null}
      </div>

      {/* Column-specific actions */}
      <div
        className="flex items-center gap-1.5 pt-1"
        onClick={(e) => e.stopPropagation()}
      >
        {column === "intake" ? (
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
        ) : column === "new" ? (
          <button
            onClick={onViewBrief}
            disabled={busy}
            className="flex-1 h-7 px-2 rounded-md bg-ink-900 hover:bg-ink-800 text-white text-xs font-medium transition disabled:opacity-50 inline-flex items-center justify-center gap-1"
          >
            View brief
            <ChevronRight className="size-3" />
          </button>
        ) : column === "in_progress" ? (
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
        ) : (
          <div className="flex-1 text-[10px] text-ink-500 inline-flex items-center gap-1">
            <CheckCircle2 className="size-3 text-emerald-500" />
            Published to Kanban
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] uppercase tracking-wider text-ink-500 mb-0.5">
        {label}
      </div>
      <div className="text-xs font-semibold text-ink-900 tabular-nums truncate">
        {value}
      </div>
    </div>
  );
}
