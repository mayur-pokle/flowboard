"use client";

import { useEffect, useRef, useState } from "react";
import {
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  Bold,
  Italic,
  Quote,
  List,
  ListOrdered,
  Link as LinkIcon,
  Code,
  Code2,
  Pilcrow,
  Eye,
  Pencil,
  Save,
  X,
  Plus,
  Trash2
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/components/Toast";
import type { GeneratedContent } from "@/lib/types";

// ───────────────────────────────────────────────────────────────────
// ContentEditor — handles the full editable content payload:
//   - SEO fields (metaTitle, metaDescription, urlSlug)
//   - Body markdown (toolbar + Edit/Preview)
//   - FAQs (add/edit/remove)
//   - Internal links (add/remove)
//   - CTA placements (add/remove)
//
// Local state is buffered so partial edits aren't pushed until "Save".
// "Cancel" reverts to the prop.
// ───────────────────────────────────────────────────────────────────

interface Props {
  content: GeneratedContent;
  onSave: (next: GeneratedContent) => Promise<void> | void;
  onCancel: () => void;
}

export function ContentEditor({ content, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState<GeneratedContent>(content);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Keep draft in sync if the underlying content changes externally
  // (e.g. regenerate while editor open). Reset to fresh content.
  useEffect(() => {
    setDraft(content);
  }, [content]);

  function update<K extends keyof GeneratedContent>(
    key: K,
    value: GeneratedContent[K]
  ) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function applyToolbar(action: ToolbarAction) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = ta.value.slice(0, start);
    const sel = ta.value.slice(start, end);
    const after = ta.value.slice(end);
    const { replacement, cursorOffset } = action(sel);
    const next = before + replacement + after;
    update("body", next);
    // Re-focus and position cursor after the inserted text.
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + cursorOffset;
      ta.setSelectionRange(pos, pos);
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      // Recompute word count from the latest body before saving.
      const wordCount = draft.body
        .replace(/[#>*`_\-+]/g, " ")
        .split(/\s+/)
        .filter(Boolean).length;
      await onSave({ ...draft, wordCount });
      toast("Content saved", "success");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* SEO header fields */}
      <div className="grid gap-3">
        <Field label="SEO title">
          <input
            className="input text-sm"
            value={draft.metaTitle}
            onChange={(e) => update("metaTitle", e.target.value)}
            maxLength={70}
          />
          <CharCount value={draft.metaTitle.length} max={60} />
        </Field>
        <Field label="Meta description">
          <textarea
            className="input min-h-[64px] text-sm"
            value={draft.metaDescription}
            onChange={(e) => update("metaDescription", e.target.value)}
            maxLength={180}
          />
          <CharCount value={draft.metaDescription.length} max={160} />
        </Field>
        <Field label="URL slug">
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-500 font-mono">/blog/</span>
            <input
              className="input text-sm font-mono"
              value={draft.urlSlug}
              onChange={(e) =>
                update(
                  "urlSlug",
                  e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, "-")
                    .replace(/-+/g, "-")
                    .replace(/^-|-$/g, "")
                )
              }
            />
          </div>
        </Field>
      </div>

      {/* Body — toolbar + textarea or preview */}
      <div className="border border-ink-200 rounded-md overflow-hidden">
        <div className="flex items-center justify-between border-b border-ink-200 bg-ink-50/40">
          {/* Edit/Preview tabs */}
          <div className="flex">
            <TabButton
              active={tab === "edit"}
              onClick={() => setTab("edit")}
              icon={Pencil}
              label="Edit"
            />
            <TabButton
              active={tab === "preview"}
              onClick={() => setTab("preview")}
              icon={Eye}
              label="Preview"
            />
          </div>
          <div className="text-[11px] text-ink-500 pr-3">
            {wordCount(draft.body)} words
          </div>
        </div>

        {/* Toolbar (only shown in edit mode) */}
        {tab === "edit" ? (
          <Toolbar onAction={applyToolbar} />
        ) : null}

        {tab === "edit" ? (
          <textarea
            ref={textareaRef}
            value={draft.body}
            onChange={(e) => update("body", e.target.value)}
            className="block w-full px-4 py-3 text-sm font-mono leading-relaxed bg-white text-ink-900 focus:outline-none scrollbar-thin"
            style={{ minHeight: 400, resize: "vertical" }}
            spellCheck
          />
        ) : (
          <div className="px-4 py-3 bg-white prose-body max-h-[600px] overflow-auto scrollbar-thin">
            <RenderMarkdown text={draft.body} />
          </div>
        )}
      </div>

      {/* CTA placements */}
      <StringArrayEditor
        label="CTA placements"
        items={draft.ctaPlacements}
        onChange={(v) => update("ctaPlacements", v)}
        placeholder="e.g. Top: 'Try the calculator' — primary button above the fold"
      />

      {/* Internal links */}
      <StringArrayEditor
        label="Internal-link suggestions"
        items={draft.internalLinks}
        onChange={(v) => update("internalLinks", v)}
        placeholder="e.g. Pricing page (anchor: 'pricing')"
      />

      {/* FAQs */}
      <FaqEditor faqs={draft.faqs} onChange={(v) => update("faqs", v)} />

      {/* JSON-LD schema */}
      <Field label="Schema markup (JSON-LD)">
        <textarea
          className="input min-h-[120px] text-xs font-mono"
          value={draft.schemaJsonLd}
          onChange={(e) => update("schemaJsonLd", e.target.value)}
          spellCheck={false}
        />
      </Field>

      {/* Footer actions */}
      <div className="flex justify-end gap-2 pt-2 border-t border-ink-100">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          <X className="size-4" />
          Cancel
        </Button>
        <Button variant="primary" onClick={handleSave} loading={saving}>
          <Save className="size-4" />
          Save changes
        </Button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Toolbar
// ───────────────────────────────────────────────────────────────────

type ToolbarAction = (selection: string) => {
  replacement: string;
  cursorOffset: number;
};

function prefixLine(prefix: string): ToolbarAction {
  return (sel) => {
    const text = sel || "Heading";
    return {
      replacement: `${prefix}${text}`,
      cursorOffset: prefix.length + text.length
    };
  };
}

function wrap(left: string, right: string, fallback: string): ToolbarAction {
  return (sel) => {
    const text = sel || fallback;
    return {
      replacement: `${left}${text}${right}`,
      cursorOffset: left.length + text.length + right.length
    };
  };
}

function prefixEachLine(prefix: string, fallback: string): ToolbarAction {
  return (sel) => {
    const lines = (sel || fallback).split(/\r?\n/);
    const out = lines.map((l) => `${prefix}${l}`).join("\n");
    return { replacement: out, cursorOffset: out.length };
  };
}

function orderedList(): ToolbarAction {
  return (sel) => {
    const lines = (sel || "First item\nSecond item\nThird item").split(/\r?\n/);
    const out = lines.map((l, i) => `${i + 1}. ${l}`).join("\n");
    return { replacement: out, cursorOffset: out.length };
  };
}

function linkAction(): ToolbarAction {
  return (sel) => {
    const text = sel || "link text";
    const replacement = `[${text}](https://)`;
    // Position cursor inside the URL so user can type it.
    return { replacement, cursorOffset: replacement.length - 1 };
  };
}

const TOOLBAR_GROUPS: Array<
  Array<{
    title: string;
    icon: React.ComponentType<{ className?: string }>;
    action: ToolbarAction;
  }>
> = [
  [
    { title: "Heading 1", icon: Heading1, action: prefixLine("# ") },
    { title: "Heading 2", icon: Heading2, action: prefixLine("## ") },
    { title: "Heading 3", icon: Heading3, action: prefixLine("### ") },
    { title: "Heading 4", icon: Heading4, action: prefixLine("#### ") },
    { title: "Heading 5", icon: Heading5, action: prefixLine("##### ") },
    { title: "Heading 6", icon: Heading6, action: prefixLine("###### ") },
    { title: "Paragraph", icon: Pilcrow, action: (sel) => ({
      replacement: sel || "Paragraph",
      cursorOffset: (sel || "Paragraph").length
    }) }
  ],
  [
    { title: "Bold", icon: Bold, action: wrap("**", "**", "bold text") },
    { title: "Italic", icon: Italic, action: wrap("*", "*", "italic text") },
    { title: "Inline code", icon: Code, action: wrap("`", "`", "code") }
  ],
  [
    {
      title: "Quote",
      icon: Quote,
      action: prefixEachLine("> ", "Insightful quote")
    },
    {
      title: "Bulleted list",
      icon: List,
      action: prefixEachLine("- ", "First item\nSecond item\nThird item")
    },
    {
      title: "Numbered list",
      icon: ListOrdered,
      action: orderedList()
    }
  ],
  [
    { title: "Link", icon: LinkIcon, action: linkAction() },
    {
      title: "Code block",
      icon: Code2,
      action: wrap("```\n", "\n```", "// code")
    }
  ]
];

function Toolbar({
  onAction
}: {
  onAction: (action: ToolbarAction) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 border-b border-ink-200 bg-white">
      {TOOLBAR_GROUPS.map((group, gi) => (
        <div
          key={gi}
          className="flex items-center gap-0.5 border-r border-ink-200 pr-1.5 mr-1 last:border-r-0 last:pr-0 last:mr-0"
        >
          {group.map((btn) => {
            const Icon = btn.icon;
            return (
              <button
                key={btn.title}
                type="button"
                onClick={() => onAction(btn.action)}
                title={btn.title}
                className="p-1.5 text-ink-600 hover:bg-ink-100 hover:text-ink-900 rounded"
              >
                <Icon className="size-4" />
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex items-center gap-1.5 px-3 py-2 -mb-px border-b-2 text-xs " +
        (active
          ? "border-brand-600 text-brand-700 bg-white font-medium"
          : "border-transparent text-ink-500 hover:text-ink-800")
      }
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}

// ───────────────────────────────────────────────────────────────────
// Helpers / sub-components
// ───────────────────────────────────────────────────────────────────

function Field({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-ink-700 mb-1 block">
        {label}
      </label>
      {children}
    </div>
  );
}

function CharCount({ value, max }: { value: number; max: number }) {
  const over = value > max;
  return (
    <div
      className={`text-[10px] mt-1 ${
        over ? "text-rose-600" : "text-ink-500"
      }`}
    >
      {value} / {max}
      {over ? " — over recommended length" : ""}
    </div>
  );
}

function StringArrayEditor({
  label,
  items,
  onChange,
  placeholder
}: {
  label: string;
  items: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [newItem, setNewItem] = useState("");

  return (
    <Field label={label}>
      <div className="space-y-1.5">
        {items.length === 0 ? (
          <div className="text-xs text-ink-500 italic">None yet.</div>
        ) : (
          items.map((it, idx) => (
            <div key={idx} className="flex gap-2 items-start">
              <textarea
                className="input text-sm min-h-[36px] py-1.5"
                value={it}
                onChange={(e) => {
                  const next = [...items];
                  next[idx] = e.target.value;
                  onChange(next);
                }}
              />
              <button
                type="button"
                onClick={() =>
                  onChange(items.filter((_, i) => i !== idx))
                }
                className="p-1.5 text-ink-400 hover:text-rose-600 rounded shrink-0 mt-1"
                aria-label="Remove"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))
        )}
        <div className="flex gap-2 items-start">
          <input
            className="input text-sm"
            placeholder={placeholder}
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newItem.trim()) {
                e.preventDefault();
                onChange([...items, newItem.trim()]);
                setNewItem("");
              }
            }}
          />
          <Button
            variant="secondary"
            onClick={() => {
              if (newItem.trim()) {
                onChange([...items, newItem.trim()]);
                setNewItem("");
              }
            }}
            className="!py-1.5"
          >
            <Plus className="size-4" />
            Add
          </Button>
        </div>
      </div>
    </Field>
  );
}

function FaqEditor({
  faqs,
  onChange
}: {
  faqs: { q: string; a: string }[];
  onChange: (next: { q: string; a: string }[]) => void;
}) {
  return (
    <Field label={`FAQs (${faqs.length})`}>
      <div className="space-y-3">
        {faqs.length === 0 ? (
          <div className="text-xs text-ink-500 italic">None yet.</div>
        ) : (
          faqs.map((f, idx) => (
            <div
              key={idx}
              className="rounded-md border border-ink-200 bg-ink-50/40 p-3"
            >
              <div className="flex items-center justify-between mb-1.5">
                <Badge tone="neutral">FAQ {idx + 1}</Badge>
                <button
                  type="button"
                  onClick={() => onChange(faqs.filter((_, i) => i !== idx))}
                  className="p-1 text-ink-400 hover:text-rose-600 rounded"
                  aria-label="Remove FAQ"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              <input
                className="input text-sm font-medium mb-2"
                value={f.q}
                placeholder="Question"
                onChange={(e) => {
                  const next = [...faqs];
                  next[idx] = { ...f, q: e.target.value };
                  onChange(next);
                }}
              />
              <textarea
                className="input text-sm min-h-[64px]"
                value={f.a}
                placeholder="Answer"
                onChange={(e) => {
                  const next = [...faqs];
                  next[idx] = { ...f, a: e.target.value };
                  onChange(next);
                }}
              />
            </div>
          ))
        )}
        <Button
          variant="secondary"
          onClick={() => onChange([...faqs, { q: "", a: "" }])}
        >
          <Plus className="size-4" />
          Add FAQ
        </Button>
      </div>
    </Field>
  );
}

// ───────────────────────────────────────────────────────────────────
// Markdown renderer (preview)
// Mirrors the one in CardDetailPanel.tsx — kept here so the editor's
// preview tab works standalone. Extended to also handle blockquotes
// since the toolbar exposes them.
// ───────────────────────────────────────────────────────────────────

function RenderMarkdown({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const out: React.ReactNode[] = [];
  let i = 0;
  let listBuf: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let quoteBuf: string[] = [];
  let codeBuf: string[] = [];
  let inCode = false;

  function flushList() {
    if (listBuf.length === 0) return;
    if (listType === "ol") {
      out.push(
        <ol key={`l-${i}`}>
          {listBuf.map((li, j) => (
            <li key={j}>{renderInline(li)}</li>
          ))}
        </ol>
      );
    } else {
      out.push(
        <ul key={`l-${i}`}>
          {listBuf.map((li, j) => (
            <li key={j}>{renderInline(li)}</li>
          ))}
        </ul>
      );
    }
    listBuf = [];
    listType = null;
  }

  function flushQuote() {
    if (quoteBuf.length === 0) return;
    out.push(
      <blockquote key={`q-${i}`}>
        {quoteBuf.map((q, j) => (
          <p key={j}>{renderInline(q)}</p>
        ))}
      </blockquote>
    );
    quoteBuf = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.startsWith("```")) {
      flushList();
      flushQuote();
      if (inCode) {
        out.push(
          <pre key={`c-${i}`}>
            <code>{codeBuf.join("\n")}</code>
          </pre>
        );
        codeBuf = [];
        inCode = false;
      } else {
        inCode = true;
      }
      i++;
      continue;
    }
    if (inCode) {
      codeBuf.push(rawLine);
      i++;
      continue;
    }

    if (line.startsWith("###### ")) {
      flushList();
      flushQuote();
      out.push(<h6 key={i}>{renderInline(line.slice(7))}</h6>);
    } else if (line.startsWith("##### ")) {
      flushList();
      flushQuote();
      out.push(<h5 key={i}>{renderInline(line.slice(6))}</h5>);
    } else if (line.startsWith("#### ")) {
      flushList();
      flushQuote();
      out.push(<h4 key={i}>{renderInline(line.slice(5))}</h4>);
    } else if (line.startsWith("### ")) {
      flushList();
      flushQuote();
      out.push(<h3 key={i}>{renderInline(line.slice(4))}</h3>);
    } else if (line.startsWith("## ")) {
      flushList();
      flushQuote();
      out.push(<h2 key={i}>{renderInline(line.slice(3))}</h2>);
    } else if (line.startsWith("# ")) {
      flushList();
      flushQuote();
      out.push(<h1 key={i}>{renderInline(line.slice(2))}</h1>);
    } else if (line.startsWith("> ")) {
      flushList();
      quoteBuf.push(line.slice(2));
    } else if (/^\s*[-*]\s+/.test(line)) {
      flushQuote();
      if (listType === "ol") flushList();
      listType = "ul";
      listBuf.push(line.replace(/^\s*[-*]\s+/, ""));
    } else if (/^\s*\d+\.\s+/.test(line)) {
      flushQuote();
      if (listType === "ul") flushList();
      listType = "ol";
      listBuf.push(line.replace(/^\s*\d+\.\s+/, ""));
    } else if (line.trim() === "") {
      flushList();
      flushQuote();
    } else {
      flushList();
      flushQuote();
      out.push(<p key={i}>{renderInline(line)}</p>);
    }
    i++;
  }
  flushList();
  flushQuote();
  if (inCode && codeBuf.length) {
    out.push(
      <pre key={`c-end`}>
        <code>{codeBuf.join("\n")}</code>
      </pre>
    );
  }
  return <>{out}</>;
}

function renderInline(s: string): React.ReactNode {
  // Bold **x**, italic *x*, inline code `x`, links [text](url)
  const parts: React.ReactNode[] = [];
  let rest = s;
  let key = 0;
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/;
  while (rest.length) {
    const m = rest.match(re);
    if (!m) {
      parts.push(rest);
      break;
    }
    const idx = m.index ?? 0;
    if (idx > 0) parts.push(rest.slice(0, idx));
    if (m[2] !== undefined) parts.push(<strong key={key++}>{m[2]}</strong>);
    else if (m[3] !== undefined) parts.push(<em key={key++}>{m[3]}</em>);
    else if (m[4] !== undefined)
      parts.push(
        <code
          key={key++}
          className="bg-ink-100 px-1 py-0.5 rounded text-[12px] font-mono"
        >
          {m[4]}
        </code>
      );
    else if (m[5] !== undefined && m[6] !== undefined)
      parts.push(
        <a
          key={key++}
          href={m[6]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-700 underline hover:no-underline"
        >
          {m[5]}
        </a>
      );
    rest = rest.slice(idx + m[0].length);
  }
  return <>{parts}</>;
}

function wordCount(text: string) {
  return text
    .replace(/[#>*`_\-+]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .length.toLocaleString();
}
