"use client";

import { useState } from "react";
import {
  Plus,
  Trash2,
  ListChecks,
  Search,
  Wand2,
  X,
  Loader2,
  Sparkles,
  Globe,
  CheckSquare,
  Square
} from "lucide-react";
import { useStore, useHasHydrated } from "@/lib/store";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/components/Toast";
import { cn } from "@/lib/utils";
import type {
  Keyword,
  KeywordPriority,
  KeywordStatus,
  SearchIntentType
} from "@/lib/types";

const PRIORITIES: KeywordPriority[] = ["P0", "P1", "P2"];
const INTENTS: SearchIntentType[] = [
  "informational",
  "commercial",
  "transactional",
  "navigational"
];
const STATUSES: KeywordStatus[] = [
  "targeting",
  "ranking",
  "won",
  "abandoned"
];

const PRIORITY_TONE: Record<
  KeywordPriority,
  "danger" | "warn" | "neutral"
> = {
  P0: "danger",
  P1: "warn",
  P2: "neutral"
};

const PRIORITY_LABEL: Record<KeywordPriority, string> = {
  P0: "P0 — must target",
  P1: "P1 — nice to have",
  P2: "P2 — watchlist"
};

export default function KeywordsPage() {
  const hydrated = useHasHydrated();
  const keywords = useStore((s) => s.keywords);
  const addKeyword = useStore((s) => s.addKeyword);
  const updateKeyword = useStore((s) => s.updateKeyword);
  const removeKeyword = useStore((s) => s.removeKeyword);

  // Add-new form state
  const [newKeyword, setNewKeyword] = useState("");
  const [newPriority, setNewPriority] = useState<KeywordPriority>("P1");
  const [newIntent, setNewIntent] = useState<SearchIntentType>(
    "informational"
  );
  const [newVolume, setNewVolume] = useState("");
  const [newDifficulty, setNewDifficulty] = useState("");

  // Filter
  const [filter, setFilter] = useState<"all" | KeywordPriority>("all");
  const [query, setQuery] = useState("");

  // ── Auto-suggest state ──
  const settings = useStore((s) => s.settings);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<
    Array<{
      keyword: string;
      priority: KeywordPriority;
      intent: SearchIntentType;
      reason: string;
    }>
  >([]);
  const [suggestProvider, setSuggestProvider] = useState<string>("");
  const [suggestUsedHomepage, setSuggestUsedHomepage] = useState(false);
  const [suggestHomepageError, setSuggestHomepageError] = useState<
    string | null
  >(null);
  const [selectedSuggestions, setSelectedSuggestions] = useState<
    Set<string>
  >(new Set());
  const [bulkAdding, setBulkAdding] = useState(false);
  const [suggestStep, setSuggestStep] = useState(0);
  // Rotating loading labels while the request is in flight.
  const suggestSteps = [
    "Reading your brand profile…",
    "Fetching your homepage…",
    "Scanning competitors + content library…",
    "Asking Gemini for prioritized keywords…",
    "Filtering out anything already in the bank…"
  ];

  async function runSuggest() {
    setSuggestOpen(true);
    setSuggesting(true);
    setSuggestions([]);
    setSelectedSuggestions(new Set());
    setSuggestHomepageError(null);
    setSuggestStep(0);
    const stepTimer = setInterval(() => {
      setSuggestStep((s) => Math.min(suggestSteps.length - 1, s + 1));
    }, 1600);
    try {
      const res = await fetch("/api/settings/suggest-keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includeHomepage: true })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Suggestion failed");
      const list = (json.keywords || []) as Array<{
        keyword: string;
        priority: KeywordPriority;
        intent: SearchIntentType;
        reason: string;
      }>;
      setSuggestions(list);
      setSuggestProvider(json.provider || "");
      setSuggestUsedHomepage(Boolean(json.usedHomepage));
      setSuggestHomepageError(json.homepageError || null);
      // Default all selected — the strategist unchecks anything they
      // don't want.
      setSelectedSuggestions(new Set(list.map((k) => k.keyword)));
      if (list.length === 0) {
        toast(
          "No new suggestions — everything relevant may already be in your bank.",
          "info"
        );
      } else if (json.provider === "deterministic") {
        toast(
          `Fallback set (${list.length}). Connect an AI provider in Settings for a richer pass.`,
          "info"
        );
      } else {
        toast(
          `Got ${list.length} suggestions from ${json.provider}.`,
          "success"
        );
      }
    } catch (err) {
      toast((err as Error).message, "error");
      setSuggestOpen(false);
    } finally {
      clearInterval(stepTimer);
      setSuggesting(false);
    }
  }

  function toggleSelected(keyword: string) {
    setSelectedSuggestions((prev) => {
      const next = new Set(prev);
      if (next.has(keyword)) next.delete(keyword);
      else next.add(keyword);
      return next;
    });
  }
  function selectAll() {
    setSelectedSuggestions(new Set(suggestions.map((s) => s.keyword)));
  }
  function selectNone() {
    setSelectedSuggestions(new Set());
  }
  function selectByPriority(p: KeywordPriority) {
    setSelectedSuggestions(
      new Set(
        suggestions.filter((s) => s.priority === p).map((s) => s.keyword)
      )
    );
  }

  async function bulkAddSelected() {
    const picked = suggestions.filter((s) =>
      selectedSuggestions.has(s.keyword)
    );
    if (picked.length === 0) {
      toast("Select at least one keyword to add.", "info");
      return;
    }
    setBulkAdding(true);
    try {
      const res = await fetch("/api/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keywords: picked.map((p) => ({
            keyword: p.keyword,
            priority: p.priority,
            intent: p.intent,
            status: "targeting",
            notes: p.reason
          }))
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Bulk add failed");
      toast(
        `Added ${json.inserted}${
          json.skipped ? ` · ${json.skipped} duplicates skipped` : ""
        }`,
        "success"
      );
      setSuggestOpen(false);
      setSuggestions([]);
      setSelectedSuggestions(new Set());
      // Re-hydrate keywords via a full refetch — the store's addKeyword
      // path pushes optimistically but we bypassed it for bulk speed.
      const kwRes = await fetch("/api/keywords");
      const kwJson = await kwRes.json();
      // Push into the store by dispatching a hydrate — or just reload
      // the page since the settings surface is not perf-critical.
      window.location.reload();
      void kwJson;
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBulkAdding(false);
    }
  }

  async function handleAdd() {
    const kw = newKeyword.trim();
    if (!kw) {
      toast("Type a keyword first", "error");
      return;
    }
    const vol = Number(newVolume);
    const diff = Number(newDifficulty);
    try {
      await addKeyword({
        keyword: kw,
        priority: newPriority,
        intent: newIntent,
        status: "targeting",
        searchVolume: Number.isFinite(vol) && newVolume ? vol : undefined,
        difficulty:
          Number.isFinite(diff) && newDifficulty ? diff : undefined,
        notes: ""
      });
      setNewKeyword("");
      setNewVolume("");
      setNewDifficulty("");
      toast("Keyword added", "success");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  if (!hydrated) {
    return (
      <div className="px-8 py-6 text-base text-ink-500">Loading…</div>
    );
  }

  const filtered = keywords.filter((k) => {
    if (filter !== "all" && k.priority !== filter) return false;
    if (
      query &&
      !k.keyword.toLowerCase().includes(query.toLowerCase().trim())
    )
      return false;
    return true;
  });

  const counts = {
    P0: keywords.filter((k) => k.priority === "P0").length,
    P1: keywords.filter((k) => k.priority === "P1").length,
    P2: keywords.filter((k) => k.priority === "P2").length
  };

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col">
      <div className="px-8 h-16 flex items-center justify-between border-b border-ink-200 bg-white shrink-0">
        <div>
          <h1 className="text-base font-semibold text-ink-900 leading-tight flex items-center gap-2">
            <ListChecks className="size-4 text-ink-500" />
            Keyword bank
          </h1>
          <p className="text-xs text-ink-500 leading-tight">
            Tag the keywords you actually want to rank for. P0 keywords drive
            every generation; P1/P2 are nice-to-have / watchlist.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="danger">P0: {counts.P0}</Badge>
          <Badge tone="warn">P1: {counts.P1}</Badge>
          <Badge tone="neutral">P2: {counts.P2}</Badge>
          <Button
            variant="primary"
            onClick={() => void runSuggest()}
            disabled={suggesting || bulkAdding}
            className="ml-2"
          >
            {suggesting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Wand2 className="size-4" />
            )}
            Suggest keywords
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto scrollbar-thin px-8 py-6 max-w-5xl w-full">
        {/* Add new */}
        <section className="card p-4 mb-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-3">
            Add keyword
          </div>
          <div className="grid sm:grid-cols-[2fr_120px_160px_110px_110px_auto] gap-2">
            <input
              className="input !py-2 text-base"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
              placeholder="month-end close automation"
            />
            <select
              className="input !py-2 text-base"
              value={newPriority}
              onChange={(e) =>
                setNewPriority(e.target.value as KeywordPriority)
              }
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
            <select
              className="input !py-2 text-base"
              value={newIntent}
              onChange={(e) =>
                setNewIntent(e.target.value as SearchIntentType)
              }
            >
              {INTENTS.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
            <input
              className="input !py-2 text-base"
              value={newVolume}
              onChange={(e) => setNewVolume(e.target.value)}
              placeholder="Vol"
              inputMode="numeric"
            />
            <input
              className="input !py-2 text-base"
              value={newDifficulty}
              onChange={(e) => setNewDifficulty(e.target.value)}
              placeholder="KD"
              inputMode="numeric"
            />
            <Button variant="primary" onClick={handleAdd}>
              <Plus className="size-4" />
              Add
            </Button>
          </div>
          <p className="text-xs text-ink-500 mt-2">
            Volume and difficulty are optional — leave blank if you don&apos;t
            have data. Mark <strong>P0</strong> sparingly: those are the
            keywords every generated topic should try to address.
          </p>
        </section>

        {/* Filter strip */}
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              className="input !py-2 pl-8 text-base"
              placeholder="Filter keywords…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1 text-xs">
            {(["all", "P0", "P1", "P2"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={
                  "px-2 py-1 rounded " +
                  (filter === f
                    ? "bg-brand-50 text-brand-700"
                    : "text-ink-600 hover:bg-ink-100")
                }
              >
                {f === "all" ? "All" : f}
              </button>
            ))}
          </div>
        </div>

        {/* Rows */}
        {filtered.length === 0 ? (
          <div className="card p-8 text-center text-base text-ink-500">
            No keywords yet. Add the head terms and key long-tails you want
            Flowboard to orient every topic generation around, or click{" "}
            <button
              onClick={() => void runSuggest()}
              className="text-brand-700 underline hover:no-underline font-medium"
            >
              Suggest keywords
            </button>{" "}
            to auto-fill from your brand context.
          </div>
        ) : (
          <div className="card divide-y divide-ink-100">
            {filtered.map((k) => (
              <KeywordRow
                key={k.id}
                row={k}
                onUpdate={(patch) => updateKeyword(k.id, patch)}
                onRemove={() => removeKeyword(k.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Suggestions modal */}
      {suggestOpen ? (
        <SuggestKeywordsModal
          suggesting={suggesting}
          suggestions={suggestions}
          selected={selectedSuggestions}
          toggleSelected={toggleSelected}
          selectAll={selectAll}
          selectNone={selectNone}
          selectByPriority={selectByPriority}
          bulkAdding={bulkAdding}
          onClose={() => setSuggestOpen(false)}
          onAdd={bulkAddSelected}
          onRefresh={runSuggest}
          provider={suggestProvider}
          usedHomepage={suggestUsedHomepage}
          homepageError={suggestHomepageError}
          websiteUrl={settings.websiteUrl}
          suggestStep={suggestStep}
          suggestSteps={suggestSteps}
        />
      ) : null}
    </div>
  );
}

// ── Suggestions modal ──
// Grouped by P0 / P1 / P2. Every suggestion has a checkbox + reason.
// The strategist unchecks anything they don't want and hits "Add
// selected". Duplicates against the existing bank were already
// filtered server-side.

function SuggestKeywordsModal({
  suggesting,
  suggestions,
  selected,
  toggleSelected,
  selectAll,
  selectNone,
  selectByPriority,
  bulkAdding,
  onClose,
  onAdd,
  onRefresh,
  provider,
  usedHomepage,
  homepageError,
  websiteUrl,
  suggestStep,
  suggestSteps
}: {
  suggesting: boolean;
  suggestions: Array<{
    keyword: string;
    priority: KeywordPriority;
    intent: SearchIntentType;
    reason: string;
  }>;
  selected: Set<string>;
  toggleSelected: (k: string) => void;
  selectAll: () => void;
  selectNone: () => void;
  selectByPriority: (p: KeywordPriority) => void;
  bulkAdding: boolean;
  onClose: () => void;
  onAdd: () => void;
  onRefresh: () => void;
  provider: string;
  usedHomepage: boolean;
  homepageError: string | null;
  websiteUrl: string;
  suggestStep: number;
  suggestSteps: string[];
}) {
  const grouped: Record<KeywordPriority, typeof suggestions> = {
    P0: suggestions.filter((s) => s.priority === "P0"),
    P1: suggestions.filter((s) => s.priority === "P1"),
    P2: suggestions.filter((s) => s.priority === "P2")
  };
  const selectedCount = selected.size;

  return (
    <div
      className="fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-[2px] grid place-items-center px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-ink-200 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink-900 leading-tight flex items-center gap-2">
              <Sparkles className="size-4 text-brand-600" />
              Suggested keywords
            </h2>
            <p className="text-xs text-ink-500 leading-tight mt-0.5">
              {suggesting
                ? "Analyzing…"
                : provider === "deterministic"
                ? "Deterministic fallback (no LLM key configured)"
                : provider
                ? `Generated via ${provider}`
                : ""}
              {usedHomepage && websiteUrl ? (
                <span className="ml-2 inline-flex items-center gap-1 text-emerald-700">
                  <Globe className="size-3" />
                  Homepage read: {websiteUrl.replace(/^https?:\/\//, "")}
                </span>
              ) : null}
            </p>
          </div>
          <button
            onClick={onClose}
            className="size-8 grid place-items-center rounded-md hover:bg-ink-100 text-ink-500 shrink-0"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-auto scrollbar-thin px-5 py-4">
          {suggesting ? (
            <div className="py-8">
              <div className="inline-flex items-center gap-2 text-sm text-ink-700 mb-3">
                <Loader2 className="size-4 animate-spin text-brand-600" />
                {suggestSteps[suggestStep]}
              </div>
              <div className="space-y-2 max-w-md">
                {suggestSteps.map((label, i) => (
                  <div
                    key={label}
                    className={cn(
                      "text-xs flex items-center gap-2",
                      i < suggestStep
                        ? "text-ink-400"
                        : i === suggestStep
                        ? "text-ink-900 font-medium"
                        : "text-ink-300"
                    )}
                  >
                    <span
                      className={cn(
                        "size-2 rounded-full inline-block",
                        i < suggestStep
                          ? "bg-emerald-500"
                          : i === suggestStep
                          ? "bg-brand-500 animate-pulse"
                          : "bg-ink-200"
                      )}
                    />
                    {label}
                  </div>
                ))}
              </div>
            </div>
          ) : suggestions.length === 0 ? (
            <div className="py-8 text-center text-sm text-ink-600">
              No suggestions came back. Everything relevant might already
              be in your bank, or the LLM had nothing to add.
              <div className="mt-3">
                <Button variant="secondary" onClick={onRefresh}>
                  Try again
                </Button>
              </div>
            </div>
          ) : (
            <>
              {homepageError ? (
                <div className="mb-3 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2">
                  {homepageError}
                </div>
              ) : null}

              {/* Bulk selection controls */}
              <div className="flex items-center gap-1.5 mb-3 flex-wrap text-xs">
                <span className="text-ink-500 mr-1">Quick select:</span>
                <SelectChip onClick={selectAll}>All</SelectChip>
                <SelectChip onClick={selectNone}>None</SelectChip>
                <SelectChip onClick={() => selectByPriority("P0")}>
                  All P0
                </SelectChip>
                <SelectChip onClick={() => selectByPriority("P1")}>
                  All P1
                </SelectChip>
                <SelectChip onClick={() => selectByPriority("P2")}>
                  All P2
                </SelectChip>
                <span className="ml-auto text-ink-500">
                  {selectedCount} of {suggestions.length} selected
                </span>
              </div>

              {(["P0", "P1", "P2"] as KeywordPriority[]).map((p) =>
                grouped[p].length > 0 ? (
                  <div key={p} className="mb-5">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge
                        tone={
                          p === "P0" ? "danger" : p === "P1" ? "warn" : "neutral"
                        }
                      >
                        {p === "P0"
                          ? "P0 · must target"
                          : p === "P1"
                          ? "P1 · nice to have"
                          : "P2 · watchlist"}
                      </Badge>
                      <span className="text-xs text-ink-500">
                        {grouped[p].length}{" "}
                        {grouped[p].length === 1 ? "keyword" : "keywords"}
                      </span>
                    </div>
                    <ul className="space-y-1.5">
                      {grouped[p].map((s) => {
                        const isSelected = selected.has(s.keyword);
                        return (
                          <li
                            key={s.keyword}
                            onClick={() => toggleSelected(s.keyword)}
                            className={cn(
                              "cursor-pointer rounded-md border p-2 flex items-start gap-2 transition",
                              isSelected
                                ? "border-brand-200 bg-brand-50/40"
                                : "border-ink-200 bg-white hover:bg-ink-50"
                            )}
                          >
                            {isSelected ? (
                              <CheckSquare className="size-4 text-brand-600 shrink-0 mt-0.5" />
                            ) : (
                              <Square className="size-4 text-ink-400 shrink-0 mt-0.5" />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs font-semibold text-ink-900">
                                  {s.keyword}
                                </span>
                                <span className="badge text-[10px] bg-ink-100 text-ink-700 ring-1 ring-inset ring-ink-200">
                                  {s.intent}
                                </span>
                              </div>
                              {s.reason ? (
                                <div className="text-[11px] text-ink-600 mt-1 leading-snug">
                                  {s.reason}
                                </div>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-ink-200 bg-ink-50/60 flex items-center justify-between gap-2 flex-wrap">
          <div className="text-[11px] text-ink-500">
            {suggesting
              ? "Working…"
              : `${selectedCount} selected — duplicates against your existing bank are auto-skipped.`}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={bulkAdding}>
              Cancel
            </Button>
            {!suggesting ? (
              <Button variant="secondary" onClick={onRefresh}>
                <Wand2 className="size-3.5" />
                Regenerate
              </Button>
            ) : null}
            <Button
              variant="primary"
              onClick={onAdd}
              disabled={
                suggesting || bulkAdding || selectedCount === 0
              }
              loading={bulkAdding}
            >
              <Plus className="size-4" />
              Add {selectedCount > 0 ? selectedCount : ""} keyword
              {selectedCount === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SelectChip({
  onClick,
  children
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="px-2 py-0.5 rounded-full text-[11px] bg-white ring-1 ring-inset ring-ink-200 text-ink-700 hover:bg-ink-50 transition"
    >
      {children}
    </button>
  );
}

function KeywordRow({
  row,
  onUpdate,
  onRemove
}: {
  row: Keyword;
  onUpdate: (patch: Partial<Keyword>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="px-4 py-3 grid grid-cols-[2fr_120px_140px_110px_110px_130px_auto] gap-2 items-center">
      <input
        className="input !py-2 text-base font-mono"
        value={row.keyword}
        onChange={(e) => onUpdate({ keyword: e.target.value })}
      />
      <select
        className="input !py-2 text-xs"
        value={row.priority}
        onChange={(e) =>
          onUpdate({ priority: e.target.value as KeywordPriority })
        }
      >
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {PRIORITY_LABEL[p]}
          </option>
        ))}
      </select>
      <select
        className="input !py-2 text-xs"
        value={row.intent}
        onChange={(e) =>
          onUpdate({ intent: e.target.value as SearchIntentType })
        }
      >
        {INTENTS.map((i) => (
          <option key={i} value={i}>
            {i}
          </option>
        ))}
      </select>
      <input
        className="input !py-2 text-xs"
        value={row.searchVolume ?? ""}
        onChange={(e) => {
          const v = Number(e.target.value);
          onUpdate({
            searchVolume:
              Number.isFinite(v) && e.target.value ? v : undefined
          });
        }}
        placeholder="Vol"
        inputMode="numeric"
      />
      <input
        className="input !py-2 text-xs"
        value={row.difficulty ?? ""}
        onChange={(e) => {
          const v = Number(e.target.value);
          onUpdate({
            difficulty:
              Number.isFinite(v) && e.target.value ? v : undefined
          });
        }}
        placeholder="KD"
        inputMode="numeric"
      />
      <select
        className="input !py-2 text-xs"
        value={row.status}
        onChange={(e) =>
          onUpdate({ status: e.target.value as KeywordStatus })
        }
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <div className="flex items-center justify-end gap-1">
        <Badge tone={PRIORITY_TONE[row.priority]}>{row.priority}</Badge>
        <button
          onClick={onRemove}
          className="p-2 text-ink-400 hover:text-rose-600 rounded"
          aria-label="Remove keyword"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  );
}
