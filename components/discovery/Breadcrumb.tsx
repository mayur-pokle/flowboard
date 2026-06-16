"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// The through-line across all three Discovery screens. Highlights the
// current step so the user always knows where they are in the
// Opportunities → Brief → Content pipeline.

export type Step = "opportunities" | "brief" | "content";

interface BreadcrumbProps {
  current: Step;
  opportunityId?: string;
  query?: string;
}

const STEPS: Array<{ key: Step; label: string }> = [
  { key: "opportunities", label: "Opportunities" },
  { key: "brief", label: "Brief" },
  { key: "content", label: "Content" }
];

export function Breadcrumb({
  current,
  opportunityId,
  query
}: BreadcrumbProps) {
  function hrefFor(step: Step): string | null {
    if (step === "opportunities") return "/discovery";
    if (!opportunityId) return null;
    if (step === "brief") return `/discovery/${opportunityId}/brief`;
    return `/discovery/${opportunityId}/content`;
  }

  const currentIdx = STEPS.findIndex((s) => s.key === current);

  return (
    <nav
      aria-label="Pipeline progress"
      className="flex items-center gap-2 text-xs"
    >
      {STEPS.map((s, i) => {
        const isCurrent = s.key === current;
        const isReachable = i <= currentIdx || s.key === "opportunities";
        const href = hrefFor(s.key);
        const content = (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 px-2 py-1 rounded-md transition",
              isCurrent
                ? "bg-ink-900 text-white font-medium"
                : isReachable
                ? "text-ink-600 hover:bg-ink-100 hover:text-ink-900"
                : "text-ink-300 cursor-default"
            )}
          >
            <span
              className={cn(
                "size-4 rounded-full grid place-items-center text-[10px] font-semibold tabular-nums",
                isCurrent
                  ? "bg-white text-ink-900"
                  : "bg-ink-100 text-ink-500"
              )}
            >
              {i + 1}
            </span>
            {s.label}
          </span>
        );
        return (
          <span key={s.key} className="flex items-center gap-2">
            {isReachable && href && !isCurrent ? (
              <Link href={href}>{content}</Link>
            ) : (
              content
            )}
            {i < STEPS.length - 1 ? (
              <ChevronRight className="size-3 text-ink-300" aria-hidden />
            ) : null}
          </span>
        );
      })}
      {query ? (
        <span className="ml-2 text-ink-400 truncate max-w-[240px]">
          <span className="text-ink-300 mr-1">·</span>
          <span className="font-mono">{query}</span>
        </span>
      ) : null}
    </nav>
  );
}
