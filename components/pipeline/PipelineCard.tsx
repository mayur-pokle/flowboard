"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Sparkles,
  TrendingUp,
  CheckCircle2
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Shared Pipeline Card ─────────────────────────────────────────────
//
// One card component used by BOTH AI Discovery and AI Resources. Every
// section is optional and driven by the props — caller decides which
// pieces apply to its surface. The chassis stays identical so the two
// boards look the same at a glance.
//
//   ┌─────────────────────────────────────────────┐
//   │ [type][priority][sig pills]    [score box] │  ← top row
//   │  Title (1–2 lines)                          │
//   │  Subline (kw, content type, etc.)           │
//   │  ⚠ Cannibalization · ⚡ Trending · ✨ AI gap │
//   │  ┌───────┬───────┬───────┐                  │
//   │  │ m1    │ m2    │ m3    │                  │  ← optional metrics
//   │  └───────┴───────┴───────┘                  │
//   │  ▼ Why this idea (expandable)               │
//   │  ───────────────────────────                │
//   │  [Footer slot]                              │  ← column-specific actions
//   └─────────────────────────────────────────────┘

export interface ScoreToneVariant {
  bg: string;
  text: string;
}

export interface CardBadge {
  label: string;
  className: string;
  icon?: React.ReactNode;
  title?: string;
}

export interface CardMetric {
  label: string;
  value: string;
}

export interface CardBreakdownBar {
  label: string;
  value: number;
  max: number;
  // Optional override — defaults to emerald.
  tone?: "good" | "warn" | "aeo";
}

export interface PipelineCardProps {
  // ── Identity ──
  id: string;
  title: string;
  // Optional sub-line under the title (target keyword, content type, etc.)
  subline?: { label: string; value: string } | null;

  // ── Top-row badges (left side, before score box) ──
  // Type badge (e.g. "New", "Refresh", "Community") and priority
  // (P0/P1/P2 or High/Med/Low) — render the same on both surfaces.
  typeBadge?: CardBadge;
  priorityBadge?: CardBadge;

  // ── Score (top-right colored box) ──
  // Pass null to hide the score box (e.g. for early-stage tasks where
  // priority is the better headline).
  score?: number | null;
  scoreTone?: ScoreToneVariant;

  // ── Signal pills row ──
  // Trending, AI citation gap, cannibalization risk, etc. Each surface
  // populates with its own signals.
  signals?: CardBadge[];

  // ── Inline metrics (3-up strip) ──
  // Optional. Skip when there are no meaningful numbers (in-progress
  // task without performance data, etc.).
  metrics?: CardMetric[];

  // ── Expandable breakdown ──
  // Bars rendered under a "Show details" toggle. Discovery uses the
  // 6-pillar score; Resources uses Impact / Novelty / Priority / etc.
  breakdown?: CardBreakdownBar[];
  breakdownLabel?: string; // e.g. "Why this idea" / "Score breakdown"
  // Free-form text that appears below the bars when expanded.
  breakdownDetails?: React.ReactNode;

  // ── Footer ──
  // Column-specific action buttons. Caller owns rendering. Always sits
  // above a separator at the bottom of the card.
  footer?: React.ReactNode;

  // ── Click + drag wiring ──
  onClick?: () => void;
  // Drag handle wrapper — passed in by surfaces that participate in
  // dnd. The handle wraps the entire card so the whole surface is
  // grabbable; actions inside the footer stopPropagation as needed.
  draggableProps?: React.HTMLAttributes<HTMLDivElement> & {
    ref?: React.Ref<HTMLDivElement>;
  };

  // ── Visual variants ──
  // "isDragOverlay" disables hover/interaction styles when rendered in
  // the DragOverlay. "compact" reduces padding for dense columns.
  isDragOverlay?: boolean;
  compact?: boolean;

  // Indicator dot (e.g. green dot to flag "brief ready" or "draft ready")
  indicator?: { label: string; tone?: "success" | "info" | "warn" };
}

export function PipelineCard({
  title,
  subline,
  typeBadge,
  priorityBadge,
  score,
  scoreTone,
  signals,
  metrics,
  breakdown,
  breakdownLabel = "Show details",
  breakdownDetails,
  footer,
  onClick,
  draggableProps,
  isDragOverlay,
  compact,
  indicator
}: PipelineCardProps) {
  const [expanded, setExpanded] = useState(false);
  const hasBreakdown =
    (breakdown && breakdown.length > 0) || Boolean(breakdownDetails);

  return (
    <div
      {...draggableProps}
      onClick={onClick}
      className={cn(
        "bg-white border border-ink-200 rounded-lg transition",
        compact ? "p-2.5" : "p-3",
        !isDragOverlay && "hover:border-ink-300 hover:shadow-md",
        onClick && !isDragOverlay && "cursor-pointer",
        isDragOverlay && "shadow-xl rotate-1"
      )}
    >
      {/* Top row — badges left, score right */}
      {(typeBadge || priorityBadge || typeof score === "number") && (
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            {typeBadge ? (
              <span
                className={cn("badge text-[10px]", typeBadge.className)}
                title={typeBadge.title}
              >
                {typeBadge.icon}
                {typeBadge.label}
              </span>
            ) : null}
            {priorityBadge ? (
              <span
                className={cn(
                  "badge text-[10px] font-semibold",
                  priorityBadge.className
                )}
                title={priorityBadge.title}
              >
                {priorityBadge.icon}
                {priorityBadge.label}
              </span>
            ) : null}
          </div>
          {typeof score === "number" && scoreTone ? (
            <div
              className={cn(
                "shrink-0 px-2 py-0.5 rounded-md font-bold tabular-nums text-sm",
                scoreTone.bg,
                scoreTone.text
              )}
            >
              {score}
            </div>
          ) : null}
        </div>
      )}

      {/* Title */}
      <div className="text-sm font-semibold text-ink-900 mb-1 leading-snug line-clamp-2">
        {title}
      </div>

      {/* Sub-line (target keyword / content type / status) */}
      {subline ? (
        <div className="font-mono text-[10px] text-ink-500 mb-2 truncate">
          <span className="uppercase tracking-wider mr-1">
            {subline.label}:
          </span>
          {subline.value}
        </div>
      ) : null}

      {/* Signal pills */}
      {signals && signals.length > 0 ? (
        <div className="flex items-center gap-1.5 flex-wrap mb-2">
          {signals.map((s, i) => (
            <span
              key={i}
              className={cn(
                "badge text-[10px] inline-flex items-center gap-1",
                s.className
              )}
              title={s.title}
            >
              {s.icon}
              {s.label}
            </span>
          ))}
        </div>
      ) : null}

      {/* Metrics strip */}
      {metrics && metrics.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 py-2 my-2 border-y border-ink-100">
          {metrics.slice(0, 3).map((m, i) => (
            <div key={i} className="min-w-0">
              <div className="text-[9px] uppercase tracking-wider text-ink-500 mb-0.5">
                {m.label}
              </div>
              <div className="text-xs font-semibold text-ink-900 tabular-nums truncate">
                {m.value}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Expandable breakdown */}
      {hasBreakdown ? (
        <div className="mt-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            className="text-[10px] text-ink-500 hover:text-ink-900 font-medium inline-flex items-center gap-1 mb-1"
          >
            {expanded ? (
              <ChevronUp className="size-3" />
            ) : (
              <ChevronDown className="size-3" />
            )}
            {expanded ? "Hide details" : breakdownLabel}
          </button>
          {expanded ? (
            <div
              className="space-y-2 mb-1"
              onClick={(e) => e.stopPropagation()}
            >
              {breakdown?.map((b, i) => (
                <BreakdownBar key={i} {...b} />
              ))}
              {breakdownDetails ? (
                <div className="text-[11px] text-ink-600 leading-relaxed">
                  {breakdownDetails}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Indicator (e.g. brief ready) — sits between body and footer */}
      {indicator ? (
        <div
          className={cn(
            "text-[10px] inline-flex items-center gap-1 mt-1",
            indicator.tone === "success"
              ? "text-emerald-700"
              : indicator.tone === "warn"
              ? "text-amber-700"
              : "text-ink-500"
          )}
        >
          <CheckCircle2 className="size-3" />
          {indicator.label}
        </div>
      ) : null}

      {/* Footer — column-specific actions */}
      {footer ? (
        <div
          className="flex items-center gap-1.5 pt-2 border-t border-ink-100 mt-2"
          onClick={(e) => e.stopPropagation()}
        >
          {footer}
        </div>
      ) : null}
    </div>
  );
}

function BreakdownBar({
  label,
  value,
  max,
  tone
}: CardBreakdownBar) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const barCls =
    tone === "aeo"
      ? "bg-[#4A4DC9]"
      : tone === "warn"
      ? "bg-amber-500"
      : "bg-emerald-500";
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
          className={cn("h-full rounded-full", barCls)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// Re-export the icon set we use for signals so the surface code can
// build CardBadge entries without re-importing lucide everywhere.
export const SignalIcons = {
  Trending: TrendingUp,
  AICitation: Sparkles,
  Cannibalization: AlertTriangle
};

// Standard tone presets so both surfaces share the score-rail colors.
export const SCORE_TONES = {
  high: {
    bg: "bg-emerald-50",
    text: "text-emerald-700"
  },
  mid: {
    bg: "bg-amber-50",
    text: "text-amber-700"
  },
  low: {
    bg: "bg-rose-50",
    text: "text-rose-700"
  }
} as const;

export function pickScoreTone(score: number): ScoreToneVariant {
  if (score >= 75) return SCORE_TONES.high;
  if (score >= 50) return SCORE_TONES.mid;
  return SCORE_TONES.low;
}
