// ── Discovery palette / token helpers ────────────────────────────────
//
// Centralizes the color logic that needs to be IDENTICAL across the
// Opportunities Board, Brief, and Content screens. The big rule from
// the spec: "purple ALWAYS means AEO/GEO signal", "score color always
// signals urgency". Importing these helpers everywhere keeps the
// through-line tight.

import type { Intent } from "@/lib/opportunity-classifier";

// Score → traffic-light color. The score is the primary visual anchor
// on the board card.
export type ScoreTone = "high" | "mid" | "low";
export function scoreTone(score: number): ScoreTone {
  if (score >= 75) return "high";
  if (score >= 50) return "mid";
  return "low";
}
export const SCORE_TONE_CLASSES: Record<
  ScoreTone,
  { ring: string; bg: string; text: string; bar: string }
> = {
  high: {
    ring: "ring-emerald-200",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    bar: "bg-emerald-500"
  },
  mid: {
    ring: "ring-amber-200",
    bg: "bg-amber-50",
    text: "text-amber-700",
    bar: "bg-amber-500"
  },
  low: {
    ring: "ring-rose-200",
    bg: "bg-rose-50",
    text: "text-rose-700",
    bar: "bg-rose-500"
  }
};

// Source pill — same colors everywhere.
export const SOURCE_LABEL: Record<string, string> = {
  gsc: "GSC",
  semrush: "SEMrush",
  ahrefs: "Ahrefs",
  refresh: "Refresh"
};
export const SOURCE_TONE: Record<
  string,
  "info" | "success" | "warn" | "neutral" | "danger"
> = {
  gsc: "info",
  semrush: "warn",
  ahrefs: "success",
  refresh: "danger"
};

// Intent → label + tone.
export const INTENT_LABEL: Record<Intent, string> = {
  commercial: "Commercial",
  informational: "Informational",
  transactional: "Transactional",
  navigational: "Navigational"
};
export const INTENT_BADGE_CLASS: Record<Intent, string> = {
  commercial:
    "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200",
  informational:
    "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200",
  transactional:
    "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
  navigational:
    "bg-ink-100 text-ink-700 ring-1 ring-inset ring-ink-200"
};

// The AEO/GEO badge — purple, ALWAYS. Used on the board card, the
// brief's "AI citation angle" box, and the content screen's quality
// signal. Anchored to the V2 brand purple so it stays distinctive.
export const AI_CITATION_BADGE_CLASS =
  "bg-[#EEEEFD] text-[#4A4DC9] ring-1 ring-inset ring-[#D5D6FF]";
export const AI_CITATION_BOX_CLASS =
  "bg-[#F5F5FE] text-[#4A4DC9] ring-1 ring-inset ring-[#D5D6FF]";

// Status pill — drives the inline dropdown on the board.
export const STATUS_LABEL: Record<string, string> = {
  new: "New",
  triaging: "Triaging",
  briefed: "Briefed",
  in_progress: "In progress",
  published: "Published",
  archived: "Archived",
  // legacy
  moved: "Moved to Kanban",
  dismissed: "Dismissed"
};
export const STATUS_TONE: Record<
  string,
  "neutral" | "info" | "success" | "warn" | "danger"
> = {
  new: "info",
  triaging: "warn",
  briefed: "warn",
  in_progress: "info",
  published: "success",
  archived: "neutral",
  moved: "success",
  dismissed: "neutral"
};

export const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "new", label: "New" },
  { value: "triaging", label: "Triaging" },
  { value: "briefed", label: "Briefed" },
  { value: "in_progress", label: "In progress" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" }
];
