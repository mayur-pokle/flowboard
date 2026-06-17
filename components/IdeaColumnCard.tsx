"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Check,
  Loader2,
  X,
  AlertTriangle
} from "lucide-react";
import { Badge, PriorityBadge, TypeBadge } from "@/components/ui/Badge";
import type { Topic } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  topic: Topic;
  busy?: boolean;
  onAccept: () => void;
  onReject: () => void;
}

// Lean topic card for the Ideas column on the Content Pipeline page.
// Visually denser than the existing /ideas grid card — needs to fit
// in a kanban column. Shows the headline signals (title, keyword,
// type, priority, score) with a collapsible breakdown for the
// strategist who wants to inspect before accepting.
export function IdeaColumnCard({ topic, busy, onAccept, onReject }: Props) {
  const [expanded, setExpanded] = useState(false);

  const impact = topic.impactScore ?? topic.priorityScore;
  const novelty = topic.noveltyScore ?? 100;
  const hasOverlap = Boolean(topic.overlapWithUrl);

  return (
    <div
      className={cn(
        "bg-white border border-ink-200 rounded-lg p-3 transition",
        "hover:border-ink-300 hover:shadow-md"
      )}
    >
      {/* Top row — type + priority + score */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <TypeBadge value={topic.contentType} />
          <PriorityBadge value={topic.priority} />
        </div>
        <div
          className={cn(
            "shrink-0 px-2 py-0.5 rounded-md font-bold tabular-nums text-sm",
            impact >= 75
              ? "bg-emerald-50 text-emerald-700"
              : impact >= 50
              ? "bg-amber-50 text-amber-700"
              : "bg-rose-50 text-rose-700"
          )}
        >
          {impact}
        </div>
      </div>

      {/* Title */}
      <div className="text-sm font-semibold text-ink-900 mb-1 leading-snug line-clamp-2">
        {topic.title}
      </div>

      {/* Target keyword */}
      <div className="font-mono text-[10px] text-ink-500 mb-2 truncate">
        <span className="uppercase tracking-wider mr-1">kw:</span>
        {topic.targetKeyword}
      </div>

      {/* Cannibalization warning */}
      {hasOverlap ? (
        <div className="mb-2">
          <span
            className={cn(
              "badge text-[10px] inline-flex items-center gap-1",
              "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200"
            )}
            title={`Overlaps with ${topic.overlapWithTitle || topic.overlapWithUrl}`}
          >
            <AlertTriangle className="size-3" />
            Cannibalization risk
          </span>
        </div>
      ) : null}

      {/* Expandable breakdown — impact, novelty, why */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="text-[10px] text-ink-500 hover:text-ink-900 font-medium inline-flex items-center gap-1 mb-1"
      >
        {expanded ? (
          <ChevronUp className="size-3" />
        ) : (
          <ChevronDown className="size-3" />
        )}
        {expanded ? "Hide details" : "Why this idea"}
      </button>
      {expanded ? (
        <div className="space-y-2 mb-2">
          <BreakdownBar label="Impact" value={impact} max={100} />
          <BreakdownBar
            label="Novelty"
            value={novelty}
            max={100}
            tone={novelty >= 70 ? "good" : "warn"}
          />
          {topic.whyOpportunity ? (
            <p className="text-[11px] text-ink-600 leading-relaxed line-clamp-3">
              {topic.whyOpportunity}
            </p>
          ) : null}
          {topic.searchIntent ? (
            <div className="text-[10px] text-ink-500">
              <span className="uppercase tracking-wider mr-1">Intent:</span>
              {topic.searchIntent}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex items-center gap-3 text-[10px] text-ink-500 mb-1">
          <span>
            <span className="text-ink-400">Impact</span>{" "}
            <span className="text-ink-900 font-semibold tabular-nums">
              {impact}
            </span>
          </span>
          <span>
            <span className="text-ink-400">Novelty</span>{" "}
            <span className="text-ink-900 font-semibold tabular-nums">
              {novelty}
            </span>
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1.5 pt-2 border-t border-ink-100 mt-2">
        <button
          onClick={onAccept}
          disabled={busy}
          className="flex-1 h-7 px-2 rounded-md bg-ink-900 hover:bg-ink-800 text-white text-xs font-medium transition disabled:opacity-50 inline-flex items-center justify-center gap-1"
        >
          {busy ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <>
              <Check className="size-3" />
              Accept
            </>
          )}
        </button>
        <button
          onClick={onReject}
          disabled={busy}
          className="h-7 px-2 rounded-md bg-white hover:bg-ink-50 ring-1 ring-inset ring-ink-200 text-ink-600 text-xs transition disabled:opacity-50 inline-flex items-center gap-1"
          title="Reject (won't be suggested again)"
        >
          <X className="size-3" />
        </button>
      </div>
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
  tone?: "good" | "warn";
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[10px] text-ink-600">{label}</span>
        <span className="text-[10px] font-semibold text-ink-900 tabular-nums">
          {value}
          <span className="text-ink-400 font-normal"> / {max}</span>
        </span>
      </div>
      <div className="h-1.5 bg-ink-100 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full",
            tone === "warn" ? "bg-amber-500" : "bg-emerald-500"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// Suppress unused Badge import warning — kept for future reuse.
void Badge;
