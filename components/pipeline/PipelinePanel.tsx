"use client";

import { useEffect } from "react";
import { X, Undo2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Shared Pipeline Detail Panel ─────────────────────────────────────
//
// One slide-in side panel chassis used by BOTH surfaces. Tab content is
// fully delegated to the caller — Discovery passes Brief/Content/Quality
// tabs, AI Resources passes Content/Comments/Performance/Publish tabs.
//
// The header, the score block, and the tab strip look identical on both
// surfaces so the visual mental model carries over.

export interface PanelTab {
  id: string;
  label: string;
  // Tiny status dot or check mark next to the label (e.g. brief ready).
  indicator?: React.ReactNode;
  render: () => React.ReactNode;
}

export interface PanelHeaderBadge {
  label: string;
  className: string;
}

export interface PanelScoreBar {
  label: string;
  value: number;
  max: number;
  tone?: "good" | "warn" | "aeo";
  // Optional plain-English explanation of what the bar measures.
  // Rendered as small caption under the bar (Discovery uses this).
  description?: string;
  // When true, also show a normalized /10 rating in parens next to
  // the primary "value / max" (e.g. "14.0/20 (7.0/10)"). Discovery
  // uses this so the strategist has a stable 10-point scale to eyeball
  // regardless of the bar's actual max.
  showTenScale?: boolean;
}

export interface PipelinePanelProps {
  // ── Identity ──
  title: string;
  subline?: { label: string; value: string } | null;
  reason?: string | null;
  badges?: PanelHeaderBadge[];

  // ── Score block (top section under the header) ──
  // Pass null to hide both speedometer + bars (when a card has no
  // scoring surface, like an early-state task with no signals).
  score?: {
    value: number;
    label?: string; // "Score" | "Priority" | etc.
    priorityLabel?: string; // "P1" | "Medium" | etc.
    // When set, replaces the small "PRIORITY <label>" line under the
    // speedometer with a full tier label (e.g. "P2 Strong Priority").
    // Discovery uses this; AI Resources sticks with the short form.
    tierLabel?: string;
    // Optional secondary line — e.g. "Backend score: 75.5" — shown as
    // faint subtext beneath the tier label.
    subtext?: string;
    // "Step 2: Priority speedometer" style caption above the block.
    headline?: string;
    bars: PanelScoreBar[];
  } | null;

  // ── Tabs ──
  tabs: PanelTab[];
  activeTabId: string;
  onTabChange: (id: string) => void;

  // ── Header actions ──
  // Move-back arrow (per /discovery's move-back endpoint). Pass
  // undefined to hide.
  onMoveBack?: () => void;
  // Permanent delete. Pass undefined to hide. Caller owns confirm
  // prompt + cleanup.
  onDelete?: () => void;
  // Close action.
  onClose: () => void;

  // Right-side signals (e.g. "Trending +39% WoW") shown beneath the
  // score block, above the tabs.
  signals?: React.ReactNode;
}

export function PipelinePanel({
  title,
  subline,
  reason,
  badges,
  score,
  tabs,
  activeTabId,
  onTabChange,
  onMoveBack,
  onDelete,
  onClose,
  signals
}: PipelinePanelProps) {
  // Escape closes the panel.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  return (
    <div className="fixed inset-y-0 right-0 w-full md:w-[680px] bg-white shadow-2xl border-l border-ink-200 flex flex-col z-50 animate-in slide-in-from-right duration-200">
      {/* ── Header ── */}
      <div className="px-6 py-4 border-b border-ink-200 shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {badges && badges.length > 0 ? (
              <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                {badges.map((b, i) => (
                  <span key={i} className={cn("badge text-[10px]", b.className)}>
                    {b.label}
                  </span>
                ))}
              </div>
            ) : null}
            <h2 className="text-lg font-bold text-ink-900 leading-tight">
              {title}
            </h2>
            {subline ? (
              <div className="font-mono text-[11px] text-ink-500 mt-1">
                <span className="uppercase tracking-wider mr-1">
                  {subline.label}:
                </span>
                {subline.value}
              </div>
            ) : null}
            {reason ? (
              <p className="text-xs text-ink-600 mt-1.5 leading-relaxed">
                {reason}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {onMoveBack ? (
              <button
                onClick={onMoveBack}
                title="Move back one column"
                className="size-8 grid place-items-center rounded-md hover:bg-ink-100 text-ink-500"
              >
                <Undo2 className="size-4" />
              </button>
            ) : null}
            {onDelete ? (
              <button
                onClick={onDelete}
                title="Delete permanently"
                className="size-8 grid place-items-center rounded-md hover:bg-rose-50 hover:text-rose-600 text-ink-500"
              >
                <Trash2 className="size-4" />
              </button>
            ) : null}
            <button
              onClick={onClose}
              className="size-8 grid place-items-center rounded-md hover:bg-ink-100 text-ink-500"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Score block ── */}
      {score ? (
        <div className="px-6 py-4 border-b border-ink-100">
          {score.headline ? (
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500 mb-3">
              {score.headline}
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-4 items-start">
            <Speedometer
              value={score.value}
              label={score.label || "Score"}
              priorityLabel={score.priorityLabel}
              tierLabel={score.tierLabel}
              subtext={score.subtext}
            />
            <div className="space-y-3">
              {score.bars.map((b, i) => (
                <ScoreBar key={i} {...b} />
              ))}
            </div>
          </div>
          {signals ? (
            <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-ink-100 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider text-ink-500 mr-1">
                Signals
              </span>
              {signals}
            </div>
          ) : null}
        </div>
      ) : signals ? (
        <div className="px-6 py-3 border-b border-ink-100 flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-ink-500 mr-1">
            Signals
          </span>
          {signals}
        </div>
      ) : null}

      {/* ── Tab strip ── */}
      <div className="px-6 pt-3 border-b border-ink-200 shrink-0">
        <div className="flex items-center gap-1">
          {tabs.map((t) => (
            <TabButton
              key={t.id}
              active={t.id === activeTab.id}
              onClick={() => onTabChange(t.id)}
            >
              {t.label}
              {t.indicator ? (
                <span className="ml-1.5">{t.indicator}</span>
              ) : null}
            </TabButton>
          ))}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 min-h-0 overflow-auto scrollbar-thin">
        <div className="px-6 py-4">{activeTab.render()}</div>
      </div>
    </div>
  );
}

function Speedometer({
  value,
  label,
  priorityLabel,
  tierLabel,
  subtext
}: {
  value: number;
  label: string;
  priorityLabel?: string;
  tierLabel?: string;
  subtext?: string;
}) {
  // Semi-circle gauge. Needle angle: 180° at value=100, 0° at value=0.
  const angle = -90 + (Math.min(100, Math.max(0, value)) / 100) * 180;
  const tone =
    value >= 75
      ? { text: "text-emerald-700" }
      : value >= 50
      ? { text: "text-amber-700" }
      : { text: "text-rose-700" };

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-40 h-24">
        <svg viewBox="0 0 200 110" className="w-full h-full">
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="#eef0f4"
            strokeWidth="12"
            strokeLinecap="round"
          />
          <path
            d="M 20 100 A 80 80 0 0 1 73 30"
            fill="none"
            stroke="#fda4af"
            strokeWidth="12"
            strokeLinecap="round"
            opacity="0.6"
          />
          <path
            d="M 73 30 A 80 80 0 0 1 127 30"
            fill="none"
            stroke="#fcd34d"
            strokeWidth="12"
            strokeLinecap="round"
            opacity="0.6"
          />
          <path
            d="M 127 30 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="#6ee7b7"
            strokeWidth="12"
            strokeLinecap="round"
            opacity="0.6"
          />
          <g transform={`rotate(${angle} 100 100)`}>
            <line
              x1="100"
              y1="100"
              x2="100"
              y2="28"
              stroke="#13151c"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <circle cx="100" cy="100" r="5" fill="#13151c" />
          </g>
        </svg>
      </div>
      <div
        className={cn(
          "text-3xl font-bold tabular-nums leading-none",
          tone.text
        )}
      >
        {value}
        <span className="text-base text-ink-400 font-normal"> / 100</span>
      </div>
      {/* Tier label overrides the short priority label when provided
          — Discovery shows the full "P2 Strong Priority" phrasing. */}
      {tierLabel ? (
        <div className="text-xs font-semibold text-emerald-600 mt-1">
          {tierLabel}
        </div>
      ) : (
        <div className="text-[10px] uppercase tracking-wider text-ink-500 mt-1">
          {priorityLabel ? `${label} ${priorityLabel}` : label}
        </div>
      )}
      {subtext ? (
        <div className="text-[10px] text-ink-400 mt-0.5">{subtext}</div>
      ) : null}
    </div>
  );
}

function ScoreBar({
  label,
  value,
  max,
  tone,
  description,
  showTenScale
}: PanelScoreBar) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const barCls =
    tone === "aeo"
      ? "bg-[#4A4DC9]"
      : tone === "warn"
      ? "bg-amber-500"
      : "bg-emerald-500";
  // Normalized /10 rating rendered in parens next to the raw value.
  const tenScale =
    showTenScale && max > 0
      ? ((value / max) * 10).toFixed(1)
      : null;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1 gap-2">
        <span className="text-[11px] text-ink-600 truncate">{label}</span>
        <span className="text-[11px] font-semibold text-ink-900 tabular-nums shrink-0">
          {value.toFixed(value % 1 === 0 ? 0 : 1)}
          <span className="text-ink-400 font-normal"> / {max}</span>
          {tenScale ? (
            <span className="text-ink-400 font-normal ml-1">
              ({tenScale}/10)
            </span>
          ) : null}
        </span>
      </div>
      <div className="h-1.5 bg-ink-100 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full", barCls)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {description ? (
        <div className="text-[10px] text-ink-500 leading-snug mt-1">
          {description}
        </div>
      ) : null}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-2 text-xs font-medium border-b-2 transition inline-flex items-center",
        active
          ? "border-ink-900 text-ink-900"
          : "border-transparent text-ink-500 hover:text-ink-900"
      )}
    >
      {children}
    </button>
  );
}
