"use client";

import { Search as SearchIcon } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

// ── Shared Pipeline Top Bar ──────────────────────────────────────────
//
// Identical layout across AI Discovery and AI Resources:
//
//   ┌──────────────────────────────────────────────────────────────┐
//   │ Title                              [Primary CTA] [Secondary] │
//   │ Subtitle                                                      │
//   │ ┌─search──────┐  pill pill pill   pill pill   filters  N/N   │
//   └──────────────────────────────────────────────────────────────┘
//
// Slots are fully composable — each surface drops its own buttons,
// filter pills, and counts in.

export interface PipelineTopBarProps {
  title: string;
  subtitle?: string;
  // Right-aligned action area (Primary CTA + secondary buttons).
  actions?: React.ReactNode;
  // Optional search input — when omitted, the search column collapses.
  search?: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
  };
  // Filter pills row content. Each surface composes its own pills.
  filters?: React.ReactNode;
  // Right-aligned count chip (e.g. "8 of 12").
  countLabel?: string;
  // Optional banner that slots above the controls — sample-data
  // notice, loading state, etc.
  banner?: React.ReactNode;
}

export function PipelineTopBar({
  title,
  subtitle,
  actions,
  search,
  filters,
  countLabel,
  banner
}: PipelineTopBarProps) {
  return (
    <div className="px-6 py-4 border-b border-ink-200 bg-white shrink-0">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-ink-900 leading-tight">
            {title}
          </h1>
          {subtitle ? (
            <p className="text-xs text-ink-500 leading-tight max-w-2xl mt-0.5">
              {subtitle}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex items-center gap-2 flex-wrap">{actions}</div>
        ) : null}
      </div>

      {(search || filters || countLabel) && (
        <div className="flex items-center gap-2 flex-wrap">
          {search ? (
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <SearchIcon className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                type="text"
                value={search.value}
                onChange={(e) => search.onChange(e.target.value)}
                placeholder={search.placeholder || "Search"}
                className="input pl-9"
              />
            </div>
          ) : null}
          {filters ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              {filters}
            </div>
          ) : null}
          {countLabel ? (
            <Badge tone="neutral" className="ml-auto">
              {countLabel}
            </Badge>
          ) : null}
        </div>
      )}

      {banner ? <div className="mt-3">{banner}</div> : null}
    </div>
  );
}

// Standard pill renderer used in the `filters` slot. Encapsulates the
// hover/active/disabled styles so both surfaces look identical.
export function FilterPill({
  active,
  onClick,
  icon,
  tone,
  customClass,
  children
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  tone?: "default" | "aeo" | "trending";
  customClass?: string;
  children: React.ReactNode;
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
