"use client";

import { useMemo, useRef, useState } from "react";
import {
  Plus,
  Trash2,
  Library,
  Globe,
  ExternalLink,
  Upload,
  Download,
  Search,
  RefreshCw,
  Sparkles,
  AlertTriangle,
  X,
  Check
} from "lucide-react";
import { useStore, useHasHydrated } from "@/lib/store";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/components/Toast";
import type { ExistingContent, SearchIntentType } from "@/lib/types";

const INTENTS: SearchIntentType[] = [
  "informational",
  "commercial",
  "transactional",
  "navigational"
];

// Process this many rows per /enrich-titles call.
const ENRICH_CHUNK = 10;

export default function ContentLibraryPage() {
  const hydrated = useHasHydrated();
  const items = useStore((s) => s.existingContent);
  const addExistingContent = useStore((s) => s.addExistingContent);
  const updateExistingContent = useStore((s) => s.updateExistingContent);
  const removeExistingContent = useStore((s) => s.removeExistingContent);
  const importSitemap = useStore((s) => s.importSitemap);
  const refreshSitemap = useStore((s) => s.refreshSitemap);
  const enrichTitles = useStore((s) => s.enrichTitles);
  const bulkDelete = useStore((s) => s.bulkDeleteExistingContent);

  const [newUrl, setNewUrl] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newKeyword, setNewKeyword] = useState("");
  const [newIntent, setNewIntent] = useState<SearchIntentType | "">("");

  const [sitemapUrl, setSitemapUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState({ done: 0, total: 0 });

  const [removedModal, setRemovedModal] = useState<{
    sitemapUrl: string;
    removed: Array<{ id: string; url: string; title: string }>;
  } | null>(null);

  const [query, setQuery] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derive list of unique saved sitemaps + per-sitemap counts.
  const savedSitemaps = useMemo(() => {
    const map = new Map<
      string,
      { url: string; total: number; unenriched: number }
    >();
    for (const c of items) {
      if (!c.sourceSitemapUrl) continue;
      const cur =
        map.get(c.sourceSitemapUrl) || {
          url: c.sourceSitemapUrl,
          total: 0,
          unenriched: 0
        };
      cur.total++;
      if (!c.enrichedAt) cur.unenriched++;
      map.set(c.sourceSitemapUrl, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [items]);

  const unenrichedIds = useMemo(
    () =>
      items
        .filter((c) => !c.enrichedAt && c.sourceSitemapUrl)
        .map((c) => c.id),
    [items]
  );

  async function handleAdd() {
    const url = newUrl.trim();
    const title = newTitle.trim();
    if (!url || !title) {
      toast("URL and title are required", "error");
      return;
    }
    try {
      await addExistingContent({
        url,
        title,
        targetKeyword: newKeyword.trim(),
        intent: newIntent,
        notes: ""
      });
      setNewUrl("");
      setNewTitle("");
      setNewKeyword("");
      setNewIntent("");
      toast("Content added", "success");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function handleSitemapImport() {
    const url = sitemapUrl.trim();
    if (!url) {
      toast("Paste a sitemap or domain URL first", "error");
      return;
    }
    setImporting(true);
    try {
      const res = await importSitemap(url);
      const more = res.truncated ? " (capped at 5000 — re-run for more)" : "";
      toast(
        `Imported ${res.imported} URLs from sitemap${
          res.skipped ? `, skipped ${res.skipped} duplicates` : ""
        }${more}`,
        "success"
      );
      setSitemapUrl("");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setImporting(false);
    }
  }

  async function handleRefresh(url: string) {
    setRefreshing(url);
    try {
      const res = await refreshSitemap(url);
      if (res.removed.length > 0) {
        setRemovedModal({ sitemapUrl: url, removed: res.removed });
      }
      toast(
        res.added > 0
          ? `Refreshed: ${res.added} new URL${res.added === 1 ? "" : "s"} added${
              res.removed.length > 0
                ? `, ${res.removed.length} no longer in sitemap`
                : ""
            }`
          : res.removed.length > 0
          ? `No new URLs — but ${res.removed.length} are no longer in the sitemap`
          : "Already up to date — no new URLs",
        res.added > 0 || res.removed.length > 0 ? "success" : "info"
      );
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setRefreshing(null);
    }
  }

  async function handleEnrichAll() {
    if (unenrichedIds.length === 0) {
      toast("Nothing to enrich — all titles already fetched", "info");
      return;
    }
    setEnriching(true);
    setEnrichProgress({ done: 0, total: unenrichedIds.length });
    try {
      let done = 0;
      let totalEnriched = 0;
      let totalFailed = 0;
      for (let i = 0; i < unenrichedIds.length; i += ENRICH_CHUNK) {
        const slice = unenrichedIds.slice(i, i + ENRICH_CHUNK);
        try {
          const res = await enrichTitles(slice);
          totalEnriched += res.enriched;
          totalFailed += res.failed;
        } catch (err) {
          // Continue on per-chunk error; surface at end.
          console.error("[enrich chunk failed]", err);
          totalFailed += slice.length;
        }
        done += slice.length;
        setEnrichProgress({ done, total: unenrichedIds.length });
      }
      toast(
        `Enriched ${totalEnriched} titles${
          totalFailed > 0 ? `, ${totalFailed} failed` : ""
        }`,
        totalEnriched > 0 ? "success" : "info"
      );
    } finally {
      setEnriching(false);
    }
  }

  async function handleConfirmDeleteRemoved() {
    if (!removedModal) return;
    const ids = removedModal.removed.map((r) => r.id);
    try {
      await bulkDelete(ids);
      toast(`Deleted ${ids.length} removed URLs`, "success");
      setRemovedModal(null);
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function handleCsvUpload(file: File) {
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length === 0) {
        toast("CSV is empty", "error");
        return;
      }
      const header = rows[0].map((h) => h.trim().toLowerCase());
      const idxUrl = header.indexOf("url");
      const idxTitle = header.indexOf("title");
      const idxKeyword = header.findIndex((h) =>
        ["targetkeyword", "keyword", "target_keyword"].includes(h)
      );
      const idxIntent = header.indexOf("intent");
      if (idxUrl < 0 || idxTitle < 0) {
        toast("CSV must have 'url' and 'title' columns", "error");
        return;
      }
      const items: Array<{
        url: string;
        title: string;
        targetKeyword: string;
        intent: string;
        notes: string;
      }> = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        const url = (r[idxUrl] || "").trim();
        const title = (r[idxTitle] || "").trim();
        if (!url || !title) continue;
        items.push({
          url,
          title,
          targetKeyword: idxKeyword >= 0 ? (r[idxKeyword] || "").trim() : "",
          intent: idxIntent >= 0 ? (r[idxIntent] || "").trim() : "",
          notes: "Imported from CSV"
        });
      }
      if (items.length === 0) {
        toast("No rows found in CSV", "error");
        return;
      }
      const res = await fetch("/api/existing-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      toast(`Imported ${data.inserted} rows`, "success");
      window.location.reload();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  function exportCsv() {
    const lines = [
      "url,title,targetKeyword,intent,publishedDate,notes",
      ...items.map((c) =>
        [
          csvEscape(c.url),
          csvEscape(c.title),
          csvEscape(c.targetKeyword),
          csvEscape(c.intent),
          csvEscape(c.publishedDate || ""),
          csvEscape(c.notes)
        ].join(",")
      )
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "flowboard-content-library.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!hydrated) {
    return <div className="px-8 py-6 text-sm text-ink-500">Loading…</div>;
  }

  const filtered = query.trim()
    ? items.filter((c) =>
        (c.url + " " + c.title + " " + c.targetKeyword)
          .toLowerCase()
          .includes(query.toLowerCase().trim())
      )
    : items;

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col">
      <div className="px-8 h-16 flex items-center justify-between border-b border-ink-200 bg-white shrink-0">
        <div>
          <h1 className="text-base font-semibold text-ink-900 leading-tight flex items-center gap-2">
            <Library className="size-4 text-ink-500" />
            Content library
          </h1>
          <p className="text-xs text-ink-500 leading-tight">
            Everything you&apos;ve already published. Fed into every
            generation so the AI doesn&apos;t propose ideas that cannibalize
            your existing pages.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unenrichedIds.length > 0 ? (
            <Button
              variant="secondary"
              onClick={handleEnrichAll}
              loading={enriching}
            >
              <Sparkles className="size-4" />
              {enriching
                ? `Enriching ${enrichProgress.done}/${enrichProgress.total}…`
                : `Enrich titles (${unenrichedIds.length})`}
            </Button>
          ) : null}
          <Badge tone="neutral">{items.length} entries</Badge>
        </div>
      </div>

      <div className="flex-1 overflow-auto scrollbar-thin px-8 py-6 max-w-5xl w-full">
        {/* Sitemap section */}
        <section className="card p-4 mb-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-2 flex items-center gap-1">
            <Globe className="size-3.5" />
            Import from sitemap
          </div>
          <div className="flex gap-2">
            <input
              className="input !py-1.5 text-sm flex-1 font-mono"
              value={sitemapUrl}
              onChange={(e) => setSitemapUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSitemapImport();
              }}
              placeholder="https://acme.com/sitemap.xml — or just acme.com"
            />
            <Button
              variant="primary"
              onClick={handleSitemapImport}
              loading={importing}
            >
              <Upload className="size-4" />
              Import all
            </Button>
          </div>
          <p className="text-[11px] text-ink-500 mt-2">
            Imports every URL from the sitemap in one shot (up to 5000).
            Titles are auto-derived from the URL path — click{" "}
            <strong>Enrich titles</strong> in the header to fetch the real
            <code>&lt;title&gt;</code> tags from each page (chunks of 10).
          </p>

          {/* Saved sitemaps */}
          {savedSitemaps.length > 0 ? (
            <div className="mt-3 border-t border-ink-100 pt-3 space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1">
                Saved sitemaps
              </div>
              {savedSitemaps.map((sm) => (
                <div
                  key={sm.url}
                  className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-ink-50"
                >
                  <Globe className="size-3.5 text-ink-400 shrink-0" />
                  <span className="font-mono text-xs truncate flex-1">
                    {sm.url}
                  </span>
                  <span className="text-[11px] text-ink-500 whitespace-nowrap">
                    {sm.total} URLs
                    {sm.unenriched > 0
                      ? ` · ${sm.unenriched} need titles`
                      : ""}
                  </span>
                  <Button
                    variant="ghost"
                    onClick={() => handleRefresh(sm.url)}
                    loading={refreshing === sm.url}
                    className="!py-1 !px-2"
                    title="Re-fetch this sitemap and add new URLs"
                  >
                    <RefreshCw className="size-3.5" />
                    Refresh
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {/* CSV */}
        <section className="card p-4 mb-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-2">
            CSV
          </div>
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleCsvUpload(f);
                e.target.value = "";
              }}
            />
            <Button
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="size-4" />
              Upload CSV
            </Button>
            <Button variant="secondary" onClick={exportCsv}>
              <Download className="size-4" />
              Export CSV
            </Button>
          </div>
          <p className="text-[11px] text-ink-500 mt-2">
            Required columns: <code>url</code>, <code>title</code>. Optional:{" "}
            <code>targetKeyword</code>, <code>intent</code>.
          </p>
        </section>

        {/* Manual add */}
        <section className="card p-4 mb-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-3">
            Add manually
          </div>
          <div className="grid sm:grid-cols-[2fr_2fr_1.5fr_150px_auto] gap-2">
            <input
              className="input !py-1.5 text-sm font-mono"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://acme.com/blog/post"
            />
            <input
              className="input !py-1.5 text-sm"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Page title"
            />
            <input
              className="input !py-1.5 text-sm font-mono"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              placeholder="target keyword (optional)"
            />
            <select
              className="input !py-1.5 text-sm"
              value={newIntent}
              onChange={(e) =>
                setNewIntent(e.target.value as SearchIntentType | "")
              }
            >
              <option value="">Intent…</option>
              {INTENTS.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
            <Button variant="primary" onClick={handleAdd}>
              <Plus className="size-4" />
              Add
            </Button>
          </div>
        </section>

        {/* Filter */}
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              className="input !py-1.5 pl-8 text-sm"
              placeholder="Filter library…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Items */}
        {filtered.length === 0 ? (
          <div className="card p-8 text-center text-sm text-ink-500">
            No content yet. Import your sitemap above or add URLs manually.
          </div>
        ) : (
          <div className="card divide-y divide-ink-100">
            {filtered.map((c) => (
              <LibraryRow
                key={c.id}
                row={c}
                onUpdate={(patch) => updateExistingContent(c.id, patch)}
                onRemove={() => removeExistingContent(c.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Removed-URLs confirm modal */}
      {removedModal ? (
        <RemovedUrlsModal
          modal={removedModal}
          onClose={() => setRemovedModal(null)}
          onConfirm={handleConfirmDeleteRemoved}
        />
      ) : null}
    </div>
  );
}

function LibraryRow({
  row,
  onUpdate,
  onRemove
}: {
  row: ExistingContent;
  onUpdate: (patch: Partial<ExistingContent>) => void;
  onRemove: () => void;
}) {
  const isAuto = !row.enrichedAt && row.sourceSitemapUrl;
  return (
    <div className="px-4 py-3 grid grid-cols-[2fr_2fr_1.5fr_140px_auto] gap-2 items-center">
      <div className="flex items-center gap-2 min-w-0">
        <input
          className="input !py-1.5 text-sm font-mono truncate"
          value={row.url}
          onChange={(e) => onUpdate({ url: e.target.value })}
        />
        <a
          href={row.url}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1 text-ink-400 hover:text-ink-700"
          aria-label="Visit"
        >
          <ExternalLink className="size-3.5" />
        </a>
      </div>
      <div className="flex items-center gap-1.5">
        <input
          className="input !py-1.5 text-sm"
          value={row.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
        />
        {isAuto ? (
          <span
            className="text-[10px] text-amber-700 font-medium shrink-0"
            title="Auto-derived from URL path — click Enrich titles to fetch the real page title"
          >
            auto
          </span>
        ) : null}
      </div>
      <input
        className="input !py-1.5 text-sm font-mono"
        value={row.targetKeyword}
        onChange={(e) => onUpdate({ targetKeyword: e.target.value })}
        placeholder="target keyword"
      />
      <select
        className="input !py-1.5 text-xs"
        value={row.intent}
        onChange={(e) =>
          onUpdate({ intent: e.target.value as ExistingContent["intent"] })
        }
      >
        <option value="">—</option>
        {INTENTS.map((i) => (
          <option key={i} value={i}>
            {i}
          </option>
        ))}
      </select>
      <button
        onClick={onRemove}
        className="p-1.5 text-ink-400 hover:text-rose-600 rounded justify-self-end"
        aria-label="Remove"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}

function RemovedUrlsModal({
  modal,
  onClose,
  onConfirm
}: {
  modal: {
    sitemapUrl: string;
    removed: Array<{ id: string; url: string; title: string }>;
  };
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-sm grid place-items-center p-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-cardHover w-full max-w-2xl p-6 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-start gap-3">
            <div className="size-9 rounded-md bg-amber-50 text-amber-700 grid place-items-center shrink-0">
              <AlertTriangle className="size-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-ink-900">
                {modal.removed.length} URL
                {modal.removed.length === 1 ? "" : "s"} no longer in this
                sitemap
              </h2>
              <p className="text-xs text-ink-500 mt-0.5 max-w-md">
                These URLs were imported from this sitemap previously but
                aren&apos;t in it anymore. You probably unpublished or moved
                them. Delete from your library to keep cannibalization checks
                accurate.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-ink-400 hover:text-ink-700 rounded"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto scrollbar-thin border border-ink-200 rounded-md divide-y divide-ink-100">
          {modal.removed.map((r) => (
            <div key={r.id} className="px-3 py-2 text-sm">
              <div className="font-medium text-ink-800 truncate">
                {r.title}
              </div>
              <div className="text-[11px] text-ink-500 font-mono truncate">
                {r.url}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={onClose}>
            Keep them
          </Button>
          <Button variant="primary" onClick={onConfirm}>
            <Check className="size-4" />
            Delete {modal.removed.length}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Tiny CSV helpers ──

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        cur.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        cur.push(field);
        rows.push(cur);
        cur = [];
        field = "";
      } else {
        field += c;
      }
    }
  }
  if (field || cur.length) {
    cur.push(field);
    rows.push(cur);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

function csvEscape(v: string) {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
