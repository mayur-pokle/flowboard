// ── Discovery design tokens ──────────────────────────────────────────
//
// Centralizes the colour logic that needs to be IDENTICAL across the
// Kanban board, cards, detail panel, and brief/content views. The big
// rule from the spec: "purple ALWAYS means AEO/GEO", "score always
// signals urgency". Importing these helpers everywhere keeps the
// through-line tight.

import type {
  Intent,
  OpportunityType,
  Priority
} from "@/lib/opportunity-classifier";

// ── Score → traffic light ──
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

// ── Source pill ──
export const SOURCE_LABEL: Record<string, string> = {
  gsc: "GSC",
  semrush: "SEMrush",
  ahrefs: "Ahrefs",
  refresh: "Refresh",
  "ai-citations": "AI Citations",
  sitemap: "Sitemap",
  "competitor-sitemap": "Sitemap"
};
export const SOURCE_TONE: Record<
  string,
  "info" | "success" | "warn" | "neutral" | "danger"
> = {
  gsc: "info",
  semrush: "warn",
  ahrefs: "success",
  refresh: "danger",
  "ai-citations": "info",
  sitemap: "neutral",
  "competitor-sitemap": "neutral"
};

// ── Intent → label + tone ──
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

// ── Opportunity type → badge ──
export const TYPE_LABEL: Record<OpportunityType, string> = {
  new: "New",
  refresh: "Refresh",
  community: "Community"
};
export const TYPE_BADGE_CLASS: Record<OpportunityType, string> = {
  new: "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200",
  refresh: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200",
  community: "bg-[#F5F5FE] text-[#4A4DC9] ring-1 ring-inset ring-[#D5D6FF]"
};

// ── Priority tag ──
export const PRIORITY_LABEL: Record<Priority, string> = {
  P0: "P0",
  P1: "P1",
  P2: "P2"
};
export const PRIORITY_BADGE_CLASS: Record<Priority, string> = {
  P0: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200",
  P1: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200",
  P2: "bg-ink-100 text-ink-700 ring-1 ring-inset ring-ink-200"
};

// ── AEO/GEO purple (consistent everywhere) ──
export const AI_CITATION_BADGE_CLASS =
  "bg-[#EEEEFD] text-[#4A4DC9] ring-1 ring-inset ring-[#D5D6FF]";
export const AI_CITATION_BOX_CLASS =
  "bg-[#F5F5FE] text-[#4A4DC9] ring-1 ring-inset ring-[#D5D6FF]";

// ── Trending signal (amber, energetic) ──
export const TRENDING_BADGE_CLASS =
  "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200";

// ── Kanban column labels ──
export const COLUMN_LABEL: Record<string, string> = {
  intake: "Intake",
  new: "New",
  in_progress: "In progress",
  done: "Done",
  rejected: "Rejected"
};
export const COLUMN_ORDER = ["intake", "new", "in_progress", "done"] as const;
export type KanbanColumn = (typeof COLUMN_ORDER)[number];
