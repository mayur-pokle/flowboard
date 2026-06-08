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

const STATUSES: { value: LivePageStatus; label: string }[] = [
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
  { value: "updating", label: "Updating" },
  { value: "needs_refresh", label: "Needs refresh" },
  { value: "retired", label: "Retired" }
];

const STATUS_TONE: Record<
  LivePageStatus,
  "neutral" | "info" | "warn" | "success" | "danger"
> = {
  scheduled: "neutral",
  published: "success",
  updating: "info",
  needs_refresh: "warn",
  retired: "danger"
};

const CONTENT_TYPES: ContentType[] = [
  "Calculator",
  "Template",
  "Guide",
  "Whitepaper",
  "Checklist",
  "Framework"
];

const INTENTS = [
  "informational",
  "commercial",
  "transactional",
  "navigational"
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
          {STATUSES.map((s) => (
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
        <div className="flex items-center gap-2 min-w-0">
          <CellInput
            value={page.url}
            onChange={(v) => onUpdate({ url: v })}
            placeholder="https://…"
            className="font-mono text-xs"
          />
          {page.url ? (
            <a
              href={page.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 text-ink-400 hover:text-ink-700 rounded shrink-0"
              aria-label="Open"
            >
              <ExternalLink className="size-4" />
            </a>
          ) : null}
        </div>
      </Td>
      <Td>
        <CellInput
          value={page.targetKeyword}
          onChange={(v) => onUpdate({ targetKeyword: v })}
          placeholder="target keyword"
          className="font-mono text-xs"
        />
      </Td>
      <Td>
        <CellSelect
          value={page.contentType}
          onChange={(v) => onUpdate({ contentType: v as ContentType })}
          options={CONTENT_TYPES.map((t) => ({ value: t, label: t }))}
        />
      </Td>
      <Td>
        <CellSelect
          value={page.searchIntent}
          onChange={(v) => onUpdate({ searchIntent: v })}
          options={[
            { value: "", label: "—" },
            ...INTENTS.map((i) => ({ value: i, label: i }))
          ]}
        />
      </Td>
      <Td>
        <StatusCell
          value={page.status}
          onChange={(v) => onUpdate({ status: v })}
        />
      </Td>
      <Td>
        <input
          type="date"
          className={CELL_INPUT_CLASS}
          value={page.publishDate ? page.publishDate.slice(0, 10) : ""}
          onChange={(e) =>
            onUpdate({
              publishDate: e.target.value
                ? new Date(e.target.value).toISOString()
                : undefined
            })
          }
        />
      </Td>
      <Td>
        <input
          type="date"
          className={CELL_INPUT_CLASS}
          value={
            page.lastReviewedDate ? page.lastReviewedDate.slice(0, 10) : ""
          }
          onChange={(e) =>
            onUpdate({
              lastReviewedDate: e.target.value
                ? new Date(e.target.value).toISOString()
                : undefined
            })
          }
          title="Last time this page was reviewed for accuracy / SEO health"
        />
      </Td>
      <Td>
        <CellInput
          value={page.owner}
          onChange={(v) => onUpdate({ owner: v })}
          placeholder="—"
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
      className={`${CELL_INPUT_CLASS} text-right tabular-nums`}
    />
  );
}

function CellSelect({
  value,
  onChange,
  options
}: {
  value: string;
  onChange: (next: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={CELL_INPUT_CLASS}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
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

function StatusCell({
  value,
  onChange
}: {
  value: LivePageStatus;
  onChange: (next: LivePageStatus) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Badge tone={STATUS_TONE[value]}>
        {STATUSES.find((s) => s.value === value)?.label || value}
      </Badge>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as LivePageStatus)}
        className={`${CELL_INPUT_CLASS} !w-auto`}
        aria-label="Change status"
      >
        {STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
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
