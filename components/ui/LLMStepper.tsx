"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Shared LLM Stepper ───────────────────────────────────────────────
//
// Extracted from the Identify-Gaps and Suggest-Keywords flows. Renders
// a small rotating status line during long-running LLM calls so the
// strategist knows the app is doing real work — much better UX than a
// bare spinner over 10-30 seconds.
//
// Usage:
//   const [busy, setBusy] = useState(false);
//   ...
//   {busy && (
//     <LLMStepper
//       title="Gemini is identifying content gaps for your brand"
//       steps={[
//         "Reading your brand context…",
//         "Scanning competitor coverage…",
//         "Asking Gemini for the biggest gaps…"
//       ]}
//     />
//   )}
//
// Behavior:
// - Advances one step every `cadenceMs` (default 1800ms).
// - Holds on the LAST step until the parent unmounts the component
//   (i.e. until `busy` flips back to false).
// - Progress bar underneath shows visual pacing.
// - `tone` swaps color (brand / violet / emerald / amber).
// - `compact` version drops the title + bar for use inside a button.

export interface LLMStepperProps {
  /** Optional heading rendered above the rotating step line. */
  title?: string;
  /**
   * Ordered list of status strings to rotate through. Must be non-empty.
   * The last string is held indefinitely until the parent unmounts the
   * stepper.
   */
  steps: string[];
  /** Milliseconds between step advances. Default 1800. */
  cadenceMs?: number;
  tone?: "brand" | "violet" | "emerald" | "amber";
  /** When true, renders a single-line spinner + label (for buttons). */
  compact?: boolean;
  /** Optional accessible label read by screen readers. */
  ariaLabel?: string;
}

export function LLMStepper({
  title,
  steps,
  cadenceMs = 1800,
  tone = "brand",
  compact = false,
  ariaLabel
}: LLMStepperProps) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(0);
    if (steps.length <= 1) return;
    const t = setInterval(() => {
      setIdx((s) => Math.min(steps.length - 1, s + 1));
    }, cadenceMs);
    return () => clearInterval(t);
    // Steps as a stable ref via join — avoids restarting the interval
    // when the parent re-renders with the same array literal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps.join("|"), cadenceMs]);

  const label = steps[idx] ?? steps[steps.length - 1] ?? "Working…";
  const pct = steps.length > 1 ? ((idx + 1) / steps.length) * 100 : 100;

  const toneCls =
    tone === "violet"
      ? {
          wrap: "bg-violet-50 ring-violet-200",
          heading: "text-violet-900",
          text: "text-violet-700",
          bar: "bg-violet-500"
        }
      : tone === "emerald"
      ? {
          wrap: "bg-emerald-50 ring-emerald-200",
          heading: "text-emerald-900",
          text: "text-emerald-700",
          bar: "bg-emerald-500"
        }
      : tone === "amber"
      ? {
          wrap: "bg-amber-50 ring-amber-200",
          heading: "text-amber-900",
          text: "text-amber-700",
          bar: "bg-amber-500"
        }
      : {
          wrap: "bg-brand-50 ring-brand-200",
          heading: "text-brand-900",
          text: "text-brand-700",
          bar: "bg-brand-500"
        };

  if (compact) {
    return (
      <span
        className={cn("inline-flex items-center gap-2 text-xs", toneCls.text)}
        role="status"
        aria-live="polite"
        aria-label={ariaLabel}
      >
        <Loader2 className="size-3.5 animate-spin" />
        <span className="truncate">{label}</span>
      </span>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg px-3 py-2.5 ring-1 ring-inset flex items-start gap-3 text-xs",
        toneCls.wrap
      )}
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
    >
      <Sparkles
        className={cn("size-4 shrink-0 mt-0.5 animate-pulse", toneCls.text)}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        {title ? (
          <div className={cn("font-medium mb-1", toneCls.heading)}>{title}</div>
        ) : null}
        <div className={cn("truncate", toneCls.text)}>{label}</div>
        {steps.length > 1 ? (
          <div className="mt-2 h-1 rounded-full bg-white/60 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500 ease-out",
                toneCls.bar
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
