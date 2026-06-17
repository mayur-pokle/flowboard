"use client";

import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";

// ── Shared Pipeline Column ───────────────────────────────────────────
//
// Identical column visual on both AI Discovery and AI Resources.
//
//   ▣ Column header
//     • Colored dot
//     • Title
//     • Live count
//     • Optional action button (e.g. `+` to open generator panel)
//
//   ▣ Body
//     • Bordered-dashed container
//     • Optional drop target (set droppableId to enable)
//     • Children = cards
//
//   ▣ Footer slot
//     • Optional. Used for "Rejected (N)" below Intake on Discovery,
//       or the undo strip below Ideas on Resources.

export interface PipelineColumnProps {
  title: string;
  count: number;
  // Accent color for the dot + dashed border. Each surface picks its
  // own palette per column.
  tone: "ink" | "violet" | "brand" | "amber" | "emerald" | "rose";
  // Optional header action — typically a `+` button to open a panel.
  // Set null/undefined to hide.
  headerAction?: React.ReactNode;
  // When set, the body becomes a drop target with this id.
  droppableId?: string;
  // Body content (cards). Empty array shows the empty-state slot.
  children?: React.ReactNode;
  emptyState?: React.ReactNode;
  // Optional footer below the column body — undo strip, count chip, etc.
  footer?: React.ReactNode;
  // Fixed width to keep all columns aligned regardless of contents.
  width?: number;
}

const TONE_DOT: Record<NonNullable<PipelineColumnProps["tone"]>, string> = {
  ink: "bg-ink-400",
  violet: "bg-violet-500",
  brand: "bg-brand-500",
  amber: "bg-amber-500",
  emerald: "bg-emerald-500",
  rose: "bg-rose-500"
};

const TONE_BG: Record<NonNullable<PipelineColumnProps["tone"]>, string> = {
  ink: "border-ink-200 bg-ink-100/40",
  violet: "border-violet-200 bg-violet-50/30",
  brand: "border-brand-200 bg-brand-50/40",
  amber: "border-amber-200 bg-amber-50/40",
  emerald: "border-emerald-200 bg-emerald-50/40",
  rose: "border-rose-200 bg-rose-50/40"
};

export function PipelineColumn({
  title,
  count,
  tone,
  headerAction,
  droppableId,
  children,
  emptyState,
  footer,
  width = 380
}: PipelineColumnProps) {
  // Drop target only attached when an id is provided.
  const { isOver, setNodeRef } = useDroppable({
    id: droppableId || "__non_droppable__",
    disabled: !droppableId
  });

  // Count whether there's actual card content (vs. just an empty
  // emptyState slot) for the empty-state visual.
  const hasContent = count > 0;

  return (
    <div
      className="flex flex-col shrink-0 h-full min-h-0"
      style={{ width: `${width}px` }}
    >
      <div className="flex items-center justify-between px-2 mb-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("size-2 rounded-full", TONE_DOT[tone])} />
          <h2 className="text-base font-semibold text-ink-800 truncate">
            {title}
          </h2>
          <span className="text-xs text-ink-500 tabular-nums shrink-0">
            {count}
          </span>
        </div>
        {headerAction ? (
          <div className="shrink-0">{headerAction}</div>
        ) : null}
      </div>

      <div
        ref={droppableId ? setNodeRef : undefined}
        className={cn(
          "flex flex-col gap-2 rounded-lg border-2 border-dashed p-2 flex-1 min-h-0 overflow-y-auto scrollbar-thin transition",
          TONE_BG[tone],
          isOver && "border-brand-400 bg-brand-50"
        )}
      >
        {hasContent ? children : emptyState}
      </div>

      {footer ? <div className="shrink-0 mt-2">{footer}</div> : null}
    </div>
  );
}
