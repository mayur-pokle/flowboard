"use client";

import { useMemo, useState } from "react";
import {
  Globe,
  Plus,
  Search,
  Trash2,
  ExternalLink,
  Download,
  X
} from "lucide-react";
import { useStore, useHasHydrated } from "@/lib/store";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/components/Toast";
import type {
  ContentType,
  LivePage,
  LivePageStatus
} from "@/lib/types";

// ── Color palettes for the pill columns ──────────────────────────────────
// Tone string is a Tailwind class set so each pill has a coherent
// background + text + ring combo. Matches the rest of the app's badge styles.

const STATUS_OPTIONS: {
  value: LivePageStatus;
  label: string;
  tone: string;
}[] = [
  {
    value: "scheduled",
    label: "Scheduled",
    tone: "bg-ink-100 text-ink-700 ring-1 ring-inset ring-ink-200"
  },
  {
    value: "published",
    label: "Published",
    tone: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"
  },
  {
    value: "updating",
    label: "Updating",
    tone: "bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200"
  },
  {
    value: "needs_refresh",
    label: "Needs refresh",
    tone: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200"
  },
  {
    value: "retired",
    label: "Retired",
    tone: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200"
  }
];

const TYPE_OPTIONS: { value: ContentType; label: string; tone: string }[] = [
  {
    value: "Calculator",
    label: "Calculator",
    tone: "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200"
  },
  {
    value: "Template",
    label: "Template",
    tone: "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200"
  },
  {
    value: "Guide",
    label: "Guide",
    tone: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200"
  },
  {
    value: "Whitepaper",
    label: "Whitepaper",
    tone: "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200"
  },
  {
    value: "Checklist",
    label: "Checklist",
    tone: "bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-200"
  },
  {
    value: "Framework",
    label: "Framework",
    tone: "bg-fuchsia-50 text-fuchsia-700 ring-1 ring-inset ring-fuchsia-200"
  }
];

const INTENT_OPTIONS: { value: string; label: string; tone: string }[] = [
  {
    value: "",
    label: "—",
    tone:
      "bg-transparent text-ink-400 ring-1 ring-inset ring-dashed ring-ink-200"
  },
  {
    value: "informational",
    label: "Informational",
    tone: "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200"
  },
  {
    value: "commercial",
    label: "Commercial",
    tone: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200"
  },
  {
    value: "transactional",
    label: "Transactional",
    tone: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"
  },
  {
    value: "navigational",
    label: "Navigational",
    tone: "bg-cyan-50 text-cyan-700 ring-1 ring-inset ring-cyan-200"
  }
];

export default function LivePagesPage() {
  const hydrated = useHasHydrated();
  const livePages = useStore((s) => s.livePages);
  const addLivePage = useStore((s) => s.addLivePage);
  const updateLivePage = useStore((s) => s.updateLivePage);
  const removeLivePage = useStore((s) => s.removeLivePage);

  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<
    LivePageStatus | "all"
  >("all");
  const [adding, setAdding] = useState(false);

  const filtered = useMemo(() => {
    return livePages.filter((p) => {
      if (filterStatus !== "all" && p.status !== filterStatus) return false;
      if (query.trim()) {
        const q = query.toLowerCase().trim();
        if (
          !(
            p.title.toLowerCase().includes(q) ||
            p.url.toLowerCase().includes(q) ||
            p.targetKeyword.toLowerCase().includes(q) ||
            p.owner.toLowerCase().includes(q)
          )
        ) {
          return false;
        }
      }
      return true;
    });
  }, [livePages, query, filterStatus]);

  // Aggregate metrics for the bottom bar.
  const totals = useMemo(() => {
    let traffic = 0;
    let backlinks = 0;
    let conversions = 0;
    let published = 0;
    for (const p of filtered) {
      traffic += p.monthlyTraffic ?? 0;
      backlinks += p.backlinks ?? 0;
      conversions += p.conversions ?? 0;
      if (p.status === "published") published++;
    }
    return { traffic, backlinks, conversions, published };
  }, [filtered]);

  async function handleAdd() {
    setAdding(true);
    try {
      await addLivePage({
        title: "Untitled page",
        contentType: "Guide",
        status: "scheduled"
      });
      toast("Live page added", "success");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setAdding(false);
    }
  }

  function exportCsv() {
    const header = [
      "title",
      "url",
      "targetKeyword",
      "contentType",
      "searchIntent",
      "status",
      "publishDate",
      "lastReviewedDate",
      "owner",
      "tags",
      "searchVolume",
      "keywordDifficulty",
      "monthlyTraffic",
      "rankingPosition",
      "backlinks",
      "conversions",
      "notes"
    ];
    const rows = livePages.map((p) =>
      [
        p.title,
        p.url,
        p.targetKeyword,
        p.contentType,
        p.searchIntent,
        p.status,
        p.publishDate || "",
        p.lastReviewedDate || "",
        p.owner,
        p.tags.join("|"),
        p.searchVolume ?? "",
        p.keywordDifficulty ?? "",
        p.monthlyTraffic ?? "",
        p.rankingPosition ?? "",
        p.backlinks ?? "",
        p.conversions ?? "",
        p.notes
      ]
        .map((v) => csvEscape(String(v)))
        .join(",")
    );
    const blob = new Blob([[header.join(","), ...rows].join("\n")], {
      type: "text/csv"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "flowboard-live-pages.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!hydrated) {
    return (
      <div className="px-8 py-8 text-base text-ink-500">Loading…</div>
    );
  }

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col">
      {/* Header */}
      <div className="px-8 h-16 flex items-center justify-between border-b border-ink-200 bg-white shrink-0">
        <div>
          <h1 className="text-base font-semibold text-ink-900 leading-tight flex items-center gap-2">
            <Globe className="size-4 text-ink-500" />
            Live Pages
          </h1>
          <p className="text-xs text-ink-500 leading-tight">
            Published content tracked for SEO performance. Cards moved to Done
            on the Kanban board show up here automatically.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={exportCsv}>
            <Download className="size-4" />
            Export CSV
          </Button>
          <Button variant="primary" onClick={handleAdd} loading={adding}>
            <Plus className="size-4" />
            Add page
          </Button>
        </div>
      </div>

      {/* Filter strip */}
      <div className="px-8 py-4 border-b border-ink-200 bg-white shrink-0 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, URL, keyword, or owner"
            className="input pl-9"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) =>
            setFilterStatus(e.target.value as LivePageStatus | "all")
          }
          className="input !w-auto !py-2"
        >
          <option value="all">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <Badge tone="neutral">{filtered.length} rows</Badge>
      </div>

      {/* Table — both axes scroll; sticky header + sticky Title column */}
      <div className="flex-1 min-h-0 overflow-auto scrollbar-thin">
        {filtered.length === 0 ? (
          <EmptyState onAdd={handleAdd} />
        ) : (
          <table className="min-w-[2000px] w-full text-base border-separate border-spacing-0">
            <thead className="sticky top-0 z-20">
              <tr>
                <Th sticky className="w-[280px]">Title</Th>
                <Th className="w-[260px]">URL</Th>
                <Th className="w-[200px]">Target keyword</Th>
                <Th className="w-[160px]">Type</Th>
                <Th className="w-[160px]">Intent</Th>
                <Th className="w-[180px]">Status</Th>
                <Th className="w-[140px]">Publish date</Th>
                <Th className="w-[140px]">Reviewed</Th>
                <Th className="w-[160px]">Owner</Th>
                <Th className="w-[220px]">Tags</Th>
                <Th className="w-[120px] text-right">Volume / mo</Th>
                <Th className="w-[80px] text-right">KD</Th>
                <Th className="w-[120px] text-right">Traffic / mo</Th>
                <Th className="w-[100px] text-right">Rank</Th>
                <Th className="w-[120px] text-right">Backlinks</Th>
                <Th className="w-[120px] text-right">Conversions</Th>
                <Th className="w-[240px]">Notes</Th>
                <Th className="w-[60px]"></Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <Row
                  key={p.id}
                  page={p}
                  onUpdate={(patch) => updateLivePage(p.id, patch)}
                  onRemove={async () => {
                    if (!confirm("Delete this live page?")) return;
                    try {
                      await removeLivePage(p.id);
                      toast("Live page deleted", "info");
                    } catch (err) {
                      toast((err as Error).message, "error");
                    }
                  }}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Bottom summary bar */}
      {filtered.length > 0 ? (
        <div className="px-8 py-3 border-t border-ink-200 bg-white shrink-0 flex items-center gap-6 text-xs text-ink-700">
          <span>
            <strong className="text-ink-900">{filtered.length}</strong> rows
          </span>
          <span>
            <strong className="text-ink-900">{totals.published}</strong>{" "}
            published
          </span>
          <span>
            Sum traffic:{" "}
            <strong className="text-ink-900 tabular-nums">
              {totals.traffic.toLocaleString()}
            </strong>{" "}
            /mo
          </span>
          <span>
            Sum backlinks:{" "}
            <strong className="text-ink-900 tabular-nums">
              {totals.backlinks.toLocaleString()}
            </strong>
          </span>
          <span>
            Sum conversions:{" "}
            <strong className="text-ink-900 tabular-nums">
              {totals.conversions.toLocaleString()}
            </strong>
          </span>
        </div>
      ) : null}
    </div>
  );
}

// ─── Table cells ─────────────────────────────────────────────────────────

function Th({
  children,
  className = "",
  sticky = false
}: {
  children?: React.ReactNode;
  className?: string;
  // First column gets sticky-left styling so the Title stays visible
  // while horizontally scrolling through the metrics columns.
  sticky?: boolean;
}) {
  const stickyClass = sticky
    ? "sticky left-0 z-30 border-r-2 border-ink-200"
    : "border-r border-ink-200";
  return (
    <th
      className={
        "text-left text-xs font-semibold uppercase tracking-wider text-ink-600 px-3 py-3 bg-brand-50/60 border-b-2 border-ink-200 " +
        stickyClass +
        " " +
        className
      }
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
  sticky = false,
  hovered = false
}: {
  children: React.ReactNode;
  className?: string;
  // Matches Th sticky — keeps the Title cell pinned during horizontal scroll.
  sticky?: boolean;
  // Hover state passed from the row so the sticky cell's bg matches.
  hovered?: boolean;
}) {
  // Sticky cells need an explicit background so they don't show the
  // scrolling row content underneath. We swap between white and the hover
  // tint to match the row.
  const stickyBg = hovered ? "bg-ink-50" : "bg-white";
  const stickyClass = sticky
    ? `sticky left-0 z-10 border-r-2 border-ink-200 ${stickyBg}`
    : "border-r border-ink-200";
  return (
    <td
      className={
        "px-3 py-3 border-b border-ink-200 align-top " +
        stickyClass +
        " " +
        className
      }
    >
      {children}
    </td>
  );
}

function Row({
  page,
  onUpdate,
  onRemove
}: {
  page: LivePage;
  onUpdate: (patch: Partial<LivePage>) => void;
  onRemove: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={hovered ? "bg-ink-50 group" : "bg-white group"}
    >
      <Td sticky hovered={hovered}>
        <CellInput
          value={page.title}
          onChange={(v) => onUpdate({ title: v })}
          placeholder="Untitled page"
          className="font-medium"
          multiline
        />
      </Td>
      <Td>
        <UrlCell
          value={page.url}
          onChange={(v) => onUpdate({ url: v })}
        />
      </Td>
      <Td>
        <KeywordCell
          value={page.targetKeyword}
          onChange={(v) => onUpdate({ targetKeyword: v })}
        />
      </Td>
      <Td>
        <PillSelect
          value={page.contentType}
          options={TYPE_OPTIONS}
          onChange={(v) => onUpdate({ contentType: v as ContentType })}
        />
      </Td>
      <Td>
        <PillSelect
          value={page.searchIntent}
          options={INTENT_OPTIONS}
          onChange={(v) => onUpdate({ searchIntent: v })}
        />
      </Td>
      <Td>
        <PillSelect
          value={page.status}
          options={STATUS_OPTIONS}
          onChange={(v) => onUpdate({ status: v as LivePageStatus })}
        />
      </Td>
      <Td>
        <DateCell
          value={page.publishDate}
          onChange={(v) => onUpdate({ publishDate: v })}
        />
      </Td>
      <Td>
        <DateCell
          value={page.lastReviewedDate}
          onChange={(v) => onUpdate({ lastReviewedDate: v })}
        />
      </Td>
      <Td>
        <OwnerCell
          value={page.owner}
          onChange={(v) => onUpdate({ owner: v })}
        />
      </Td>
      <Td>
        <TagsCell
          tags={page.tags}
          onChange={(next) => onUpdate({ tags: next })}
        />
      </Td>
      <Td className="text-right">
        <CellNumber
          value={page.searchVolume}
          onChange={(v) => onUpdate({ searchVolume: v })}
        />
      </Td>
      <Td className="text-right">
        <CellNumber
          value={page.keywordDifficulty}
          onChange={(v) => onUpdate({ keywordDifficulty: v })}
        />
      </Td>
      <Td className="text-right">
        <CellNumber
          value={page.monthlyTraffic}
          onChange={(v) => onUpdate({ monthlyTraffic: v })}
        />
      </Td>
      <Td className="text-right">
        <CellNumber
          value={page.rankingPosition}
          onChange={(v) => onUpdate({ rankingPosition: v })}
        />
      </Td>
      <Td className="text-right">
        <CellNumber
          value={page.backlinks}
          onChange={(v) => onUpdate({ backlinks: v })}
        />
      </Td>
      <Td className="text-right">
        <CellNumber
          value={page.conversions}
          onChange={(v) => onUpdate({ conversions: v })}
        />
      </Td>
      <Td>
        <CellInput
          value={page.notes}
          onChange={(v) => onUpdate({ notes: v })}
          placeholder="—"
          multiline
        />
      </Td>
      <Td>
        <button
          onClick={onRemove}
          className="p-2 text-ink-400 hover:text-rose-600 rounded opacity-0 group-hover:opacity-100 transition"
          aria-label="Delete"
        >
          <Trash2 className="size-4" />
        </button>
      </Td>
    </tr>
  );
}

// ─── Cell controls — flat, no border until focused (Airtable-like) ─────

const CELL_INPUT_CLASS =
  "block w-full bg-transparent border border-transparent rounded px-2 py-1.5 text-base text-ink-800 focus:outline-none focus:border-brand-400 focus:bg-white";

function CellInput({
  value,
  onChange,
  placeholder,
  className = "",
  multiline = false
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  // When true, render as auto-growing textarea so long content wraps
  // naturally and the row height grows to fit. Used for Title + Notes.
  multiline?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  // Keep draft in sync if parent value changes externally.
  const active = document.activeElement?.tagName;
  if (draft !== value && active !== "INPUT" && active !== "TEXTAREA") {
    setDraft(value);
  }
  if (multiline) {
    return (
      <textarea
        value={draft}
        placeholder={placeholder}
        onChange={(e) => {
          setDraft(e.target.value);
          // Auto-grow the textarea to fit its content.
          const ta = e.target as HTMLTextAreaElement;
          ta.style.height = "auto";
          ta.style.height = ta.scrollHeight + "px";
        }}
        onBlur={() => {
          if (draft !== value) onChange(draft);
        }}
        rows={1}
        className={`${CELL_INPUT_CLASS} ${className} resize-none overflow-hidden leading-relaxed`}
        style={{ minHeight: "2rem" }}
      />
    );
  }
  return (
    <input
      type="text"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onChange(draft);
      }}
      className={`${CELL_INPUT_CLASS} ${className}`}
    />
  );
}

function CellNumber({
  value,
  onChange
}: {
  value: number | undefined;
  onChange: (next: number | undefined) => void;
}) {
  const [draft, setDraft] = useState(value != null ? String(value) : "");
  const ext = value != null ? String(value) : "";
  if (draft !== ext && document.activeElement?.tagName !== "INPUT") {
    setDraft(ext);
  }
  return (
    <input
      type="text"
      inputMode="numeric"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft === "") {
          if (value !== undefined) onChange(undefined);
          return;
        }
        const n = Number(draft);
        if (Number.isFinite(n) && n !== value) onChange(n);
      }}
      placeholder="—"
      className={`${CELL_INPUT_CLASS} text-right tabular-nums placeholder:text-ink-300 placeholder:font-normal`}
    />
  );
}

// ── PillSelect ─────────────────────────────────────────────────────────
// Renders the current value as a colored pill, with an invisible native
// <select> on top so clicking opens the browser's native dropdown. Gives
// us visual polish (colored chips) without any custom popover code, while
// remaining keyboard-accessible.
function PillSelect<T extends string>({
  value,
  options,
  onChange
}: {
  value: T;
  options: { value: T; label: string; tone: string }[];
  onChange: (next: T) => void;
}) {
  const current =
    options.find((o) => o.value === value) || options[0];
  return (
    <div className="relative inline-flex max-w-full">
      <span
        className={
          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium truncate cursor-pointer transition " +
          current.tone
        }
        title={current.label}
      >
        {current.label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="absolute inset-0 opacity-0 cursor-pointer"
        aria-label="Change value"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── DateCell ───────────────────────────────────────────────────────────
// Display the date in a human-readable format ("Apr 5, 2026") and overlay
// an invisible native date input so clicking opens the browser date picker.
function DateCell({
  value,
  onChange
}: {
  value: string | undefined;
  onChange: (next: string | undefined) => void;
}) {
  const display = value
    ? new Date(value).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric"
      })
    : "";
  return (
    <div className="relative inline-flex max-w-full">
      <span
        className={
          "block w-full rounded px-2 py-1.5 text-base cursor-pointer transition " +
          (display
            ? "text-ink-800 hover:bg-ink-100"
            : "text-ink-400 italic hover:bg-ink-100")
        }
      >
        {display || "Pick date"}
      </span>
      <input
        type="date"
        value={value ? value.slice(0, 10) : ""}
        onChange={(e) =>
          onChange(
            e.target.value
              ? new Date(e.target.value).toISOString()
              : undefined
          )
        }
        className="absolute inset-0 opacity-0 cursor-pointer"
        aria-label="Pick date"
      />
    </div>
  );
}

// ── OwnerCell ──────────────────────────────────────────────────────────
// Avatar circle with initials + editable name. Click anywhere in the cell
// to edit. Renders a placeholder dashed circle when empty.
function OwnerCell({
  value,
  onChange
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (!editing && draft !== value) setDraft(value);

  const initial = (() => {
    if (!value) return "";
    const local = value.includes("@") ? value.split("@")[0] : value;
    const parts = local.split(/[.\-_\s]/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return (local[0] || "").toUpperCase();
  })();

  if (editing) {
    return (
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (draft !== value) onChange(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        autoFocus
        className={CELL_INPUT_CLASS}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="flex items-center gap-2 w-full px-1 py-1 rounded hover:bg-ink-100 transition text-left"
    >
      {value ? (
        <span className="size-6 rounded-full bg-brand-600 text-white grid place-items-center text-[10px] font-semibold shrink-0">
          {initial}
        </span>
      ) : (
        <span className="size-6 rounded-full border border-dashed border-ink-300 grid place-items-center text-ink-400 text-[10px] shrink-0">
          ?
        </span>
      )}
      <span
        className={
          value ? "text-base text-ink-800 truncate" : "text-base text-ink-400 italic"
        }
      >
        {value || "Add owner"}
      </span>
    </button>
  );
}

// ── KeywordCell ────────────────────────────────────────────────────────
// Subtle code-style background to set keywords apart from regular text.
function KeywordCell({
  value,
  onChange
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const active = document.activeElement?.tagName;
  if (draft !== value && active !== "INPUT") setDraft(value);
  return (
    <input
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onChange(draft);
      }}
      placeholder="add keyword"
      className={
        "block w-full bg-ink-50 border border-transparent rounded px-2 py-1.5 text-xs font-mono text-ink-800 placeholder:text-ink-400 placeholder:not-italic focus:outline-none focus:border-brand-400 focus:bg-white transition"
      }
    />
  );
}

// ── UrlCell ────────────────────────────────────────────────────────────
// Globe icon + URL input + external-link icon when a URL is present.
function UrlCell({
  value,
  onChange
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const active = document.activeElement?.tagName;
  if (draft !== value && active !== "INPUT") setDraft(value);
  return (
    <div className="flex items-center gap-2 group/url min-w-0">
      <Globe
        className={
          "size-4 shrink-0 " +
          (value ? "text-brand-600" : "text-ink-300")
        }
      />
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onChange(draft);
        }}
        placeholder="https://"
        className="block flex-1 min-w-0 bg-transparent border border-transparent rounded px-1.5 py-1.5 text-xs font-mono text-brand-700 placeholder:text-ink-400 placeholder:font-sans placeholder:not-italic focus:outline-none focus:border-brand-400 focus:bg-white transition"
      />
      {value ? (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1 text-ink-300 hover:text-brand-700 rounded shrink-0 opacity-0 group-hover/url:opacity-100 transition"
          aria-label="Open URL in new tab"
        >
          <ExternalLink className="size-4" />
        </a>
      ) : null}
    </div>
  );
}

function TagsCell({
  tags,
  onChange
}: {
  tags: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function add(raw: string) {
    const t = raw.trim();
    if (!t) return;
    if (tags.includes(t)) return;
    onChange([...tags, t]);
    setDraft("");
  }

  return (
    <div className="flex items-center gap-1 flex-wrap px-1">
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 rounded-full bg-ink-100 text-ink-700 ring-1 ring-inset ring-ink-200 px-2 py-1 text-xs"
        >
          {t}
          <button
            type="button"
            onClick={() => onChange(tags.filter((x) => x !== t))}
            className="text-ink-400 hover:text-rose-600"
            aria-label={`Remove ${t}`}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(draft);
          } else if (
            e.key === "Backspace" &&
            draft === "" &&
            tags.length > 0
          ) {
            // Backspace on empty input pops the last tag (Airtable-like).
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={() => add(draft)}
        placeholder={tags.length === 0 ? "+ Add tag" : "+"}
        className="bg-transparent text-xs text-ink-700 placeholder:text-ink-400 focus:outline-none min-w-[60px] flex-1 py-1"
      />
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="max-w-md mx-auto text-center py-16">
      <div className="size-12 rounded-xl bg-brand-50 text-brand-600 grid place-items-center mx-auto mb-4">
        <Globe className="size-6" />
      </div>
      <h2 className="text-xl font-semibold text-ink-900 mb-1">
        No live pages yet
      </h2>
      <p className="text-base text-ink-600 mb-6">
        Move Kanban cards to <strong>Done</strong> and they show up here
        automatically. Or click below to add a page manually.
      </p>
      <Button variant="primary" onClick={onAdd}>
        <Plus className="size-4" />
        Add live page
      </Button>
    </div>
  );
}

function csvEscape(v: string) {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
