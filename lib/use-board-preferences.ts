"use client";

import { useEffect, useState } from "react";

// ── Shared per-board preferences hook ────────────────────────────────
//
// Persists search / filter / sort state to localStorage keyed by
// board id ("opportunities" / "content" / "analyzer") so the strategist
// doesn't lose their triage cut when they reload or leave the page.
//
// Design notes:
// - Keeps the shape open (Record<string, unknown>) so each board can
//   store its own set of filters without changing the hook.
// - Reads from localStorage lazily on mount — avoids SSR-vs-client
//   hydration mismatch. Initial render uses `initial`, then the effect
//   swaps in stored values if they exist.
// - Debounces writes so we don't hammer localStorage during typing.

const STORAGE_PREFIX = "flowboard:board-prefs:";

export function useBoardPreferences<T extends Record<string, unknown>>(
  boardId: string,
  initial: T
): [T, (patch: Partial<T>) => void, () => void] {
  const [state, setState] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);

  // Read from localStorage once on mount.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_PREFIX + boardId);
      if (raw) {
        const stored = JSON.parse(raw);
        if (stored && typeof stored === "object") {
          // Merge stored keys onto the initial shape — safer than
          // wholesale replacement, in case we add new keys later.
          setState((prev) => ({ ...prev, ...stored }));
        }
      }
    } catch {
      // ignore corrupt localStorage — start fresh
    }
    setHydrated(true);
  }, [boardId]);

  // Debounced write to localStorage. Writes after 250ms of quiescence.
  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(
          STORAGE_PREFIX + boardId,
          JSON.stringify(state)
        );
      } catch {
        // Storage quota / private mode — silently drop
      }
    }, 250);
    return () => clearTimeout(t);
  }, [state, boardId, hydrated]);

  function patch(next: Partial<T>) {
    setState((prev) => ({ ...prev, ...next }));
  }
  function reset() {
    setState(initial);
    try {
      window.localStorage.removeItem(STORAGE_PREFIX + boardId);
    } catch {
      // ignore
    }
  }

  return [state, patch, reset];
}

// ── Sort helpers ─────────────────────────────────────────────────────
//
// Shared sort options used across all three boards. Each board owns
// its own comparator, but the option keys and labels are shared so the
// UI dropdown looks consistent everywhere.

export type SortKey =
  | "newest"
  | "oldest"
  | "score-desc"
  | "score-asc"
  | "priority"
  | "title-asc";

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
  { key: "score-desc", label: "Score (high → low)" },
  { key: "score-asc", label: "Score (low → high)" },
  { key: "priority", label: "Priority (P0 → P4)" },
  { key: "title-asc", label: "Title (A → Z)" }
];

// Priority-code sort weight — higher number = higher priority.
// Supports both "P0"..."P4" and "high"/"med"/"low" schemes.
export function priorityWeight(code?: string | null): number {
  if (!code) return 0;
  const c = code.toLowerCase().trim();
  if (c === "p0") return 5;
  if (c === "p1") return 4;
  if (c === "p2") return 3;
  if (c === "p3") return 2;
  if (c === "p4") return 1;
  if (c === "high") return 5;
  if (c === "medium" || c === "med") return 3;
  if (c === "low") return 1;
  return 0;
}
