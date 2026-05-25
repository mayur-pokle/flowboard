"use client";

import { useState } from "react";
import { Plus, Trash2, ListChecks, Search } from "lucide-react";
import { useStore, useHasHydrated } from "@/lib/store";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/components/Toast";
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
      <div className="px-8 py-6 text-sm text-ink-500">Loading…</div>
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
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="px-8 h-16 flex items-center justify-between border-b border-ink-200 bg-white">
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
        </div>
      </div>

      <div className="flex-1 overflow-auto scrollbar-thin px-8 py-6 max-w-5xl w-full">
        {/* Add new */}
        <section className="card p-4 mb-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-3">
            Add keyword
          </div>
          <div className="grid sm:grid-cols-[2fr_120px_160px_110px_110px_auto] gap-2">
            <input
              className="input !py-1.5 text-sm"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
              placeholder="month-end close automation"
            />
            <select
              className="input !py-1.5 text-sm"
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
              className="input !py-1.5 text-sm"
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
              className="input !py-1.5 text-sm"
              value={newVolume}
              onChange={(e) => setNewVolume(e.target.value)}
              placeholder="Vol"
              inputMode="numeric"
            />
            <input
              className="input !py-1.5 text-sm"
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
          <p className="text-[11px] text-ink-500 mt-2">
            Volume and difficulty are optional — leave blank if you don&apos;t
            have data. Mark <strong>P0</strong> sparingly: those are the
            keywords every generated topic should try to address.
          </p>
        </section>

        {/* Filter strip */}
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              className="input !py-1.5 pl-8 text-sm"
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
          <div className="card p-8 text-center text-sm text-ink-500">
            No keywords yet. Add the head terms and key long-tails you want
            Flowboard to orient every topic generation around.
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
    </div>
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
        className="input !py-1.5 text-sm font-mono"
        value={row.keyword}
        onChange={(e) => onUpdate({ keyword: e.target.value })}
      />
      <select
        className="input !py-1.5 text-xs"
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
        className="input !py-1.5 text-xs"
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
        className="input !py-1.5 text-xs"
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
        className="input !py-1.5 text-xs"
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
        className="input !py-1.5 text-xs"
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
          className="p-1.5 text-ink-400 hover:text-rose-600 rounded"
          aria-label="Remove keyword"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  );
}
