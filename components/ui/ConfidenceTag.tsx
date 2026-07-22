"use client";

import { ShieldCheck, Sparkles, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Confidence Tag ───────────────────────────────────────────────────
//
// Small badge that signals HOW an AI-adjacent value was produced. Fixes
// the trust problem where hallucinated article URLs looked identical
// to real search URLs.
//
// Three levels:
//   - "verified"     — value came from a deterministic source (crawl,
//                      search URL builder, DB row). Green.
//   - "ai-suggested" — value came from an LLM without live grounding;
//                      user should verify. Amber.
//   - "deterministic"— computed rule (score, playbook match, etc.).
//                      Ink/neutral.
//
// Rendered as a tiny pill with an icon + label. Optional tooltip
// explains what to do about the confidence level.

export type Confidence = "verified" | "ai-suggested" | "deterministic";

export interface ConfidenceTagProps {
  level: Confidence;
  /** Optional short label override (defaults per level). */
  label?: string;
  /** Optional custom tooltip. Defaults to the standard explanation. */
  tooltip?: string;
  /** Icon-only for very tight spots. */
  compact?: boolean;
}

const STANDARD_TOOLTIPS: Record<Confidence, string> = {
  verified:
    "Verified — this came from a deterministic source (crawl, DB, or search URL). Safe to use directly.",
  "ai-suggested":
    "AI-suggested — this came from an LLM's knowledge, not a live crawl. Verify before citing publicly.",
  deterministic:
    "Deterministic — computed from your workspace data (rules, matches, scores). No AI generation involved."
};

const STANDARD_LABELS: Record<Confidence, string> = {
  verified: "Verified",
  "ai-suggested": "AI-suggested",
  deterministic: "Deterministic"
};

export function ConfidenceTag({
  level,
  label,
  tooltip,
  compact
}: ConfidenceTagProps) {
  const tone =
    level === "verified"
      ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
      : level === "ai-suggested"
      ? "bg-amber-50 text-amber-800 ring-amber-200"
      : "bg-ink-100 text-ink-700 ring-ink-200";
  const Icon =
    level === "verified"
      ? ShieldCheck
      : level === "ai-suggested"
      ? Sparkles
      : Cpu;
  const tip = tooltip ?? STANDARD_TOOLTIPS[level];
  const displayLabel = label ?? STANDARD_LABELS[level];

  if (compact) {
    return (
      <span
        title={tip}
        aria-label={displayLabel + " — " + tip}
        className={cn(
          "inline-flex items-center justify-center size-4 rounded-full ring-1 ring-inset",
          tone
        )}
      >
        <Icon className="size-2.5" aria-hidden />
      </span>
    );
  }
  return (
    <span
      title={tip}
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset",
        tone
      )}
    >
      <Icon className="size-3" aria-hidden />
      {displayLabel}
    </span>
  );
}
