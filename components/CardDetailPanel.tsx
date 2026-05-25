"use client";

import { useEffect, useState } from "react";
import {
  X,
  Sparkles,
  Copy,
  Download,
  Trash2,
  RefreshCw,
  Plus,
  Loader2,
  CheckCircle2,
  History,
  ChevronDown,
  ChevronRight,
  Pencil,
  MessageSquare
} from "lucide-react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/Button";
import { PriorityBadge, TypeBadge, Badge } from "@/components/ui/Badge";
import { toast } from "@/components/Toast";
import { copyToClipboard, formatDate } from "@/lib/utils";
import type { GeneratedContent, Priority, Status, Task } from "@/lib/types";
import { ContentEditor } from "@/components/ContentEditor";
import { CommentsSection } from "@/components/CommentsSection";

const STATUS_LABELS: Record<Status, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done"
};
const PRIORITIES: Priority[] = ["Low", "Medium", "High"];

export function CardDetailPanel({ task }: { task: Task }) {
  const settings = useStore((s) => s.settings);
  const setTaskStatus = useStore((s) => s.setTaskStatus);
  const setTaskPriority = useStore((s) => s.setTaskPriority);
  const addTaskTag = useStore((s) => s.addTaskTag);
  const removeTaskTag = useStore((s) => s.removeTaskTag);
  const setTaskContentStatus = useStore((s) => s.setTaskContentStatus);
  const setTaskContent = useStore((s) => s.setTaskContent);
  const selectTask = useStore((s) => s.selectTask);
  const deleteTask = useStore((s) => s.deleteTask);

  const [tagInput, setTagInput] = useState("");
  const [autoGenAttempted, setAutoGenAttempted] = useState(false);
  const [editingContent, setEditingContent] = useState(false);
  const commentCount = useStore(
    (s) => (s.commentsByTaskId[task.id] || []).length
  );

  // Auto-generate content the first time a task hits the board (if no content yet).
  useEffect(() => {
    if (
      task.contentStatus === "not_started" &&
      !autoGenAttempted &&
      task.status !== "done"
    ) {
      setAutoGenAttempted(true);
      handleGenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  async function handleGenerate() {
    setTaskContentStatus(task.id, "generating");
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };
      if (settings.openaiModel)
        headers["x-openai-model"] = settings.openaiModel;
      if (settings.geminiModel)
        headers["x-gemini-model"] = settings.geminiModel;
      if (settings.primaryProvider)
        headers["x-primary-provider"] = settings.primaryProvider;
      const res = await fetch("/api/generate-content", {
        method: "POST",
        headers,
        body: JSON.stringify({
          topic: task.topic,
          brandNiche: settings.brandNiche,
          brandAudience: settings.brandAudience,
          companyName: settings.companyName,
          websiteUrl: settings.websiteUrl,
          productDescription: settings.productDescription,
          valueProposition: settings.valueProposition,
          brandVoice: settings.brandVoice,
          primaryCta: settings.primaryCta,
          primaryGeo: settings.primaryGeo,
          competitors: settings.competitors
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Content generation failed");
      const content: GeneratedContent = data.content;
      setTaskContent(task.id, content);

      const warnings: string[] = Array.isArray(data.warnings)
        ? data.warnings
        : [];
      for (const w of warnings) toast(w, "error");

      const triedAnyKey =
        data.keysSeen?.openai || data.keysSeen?.gemini || false;
      const providerLabel =
        data.provider === "mock"
          ? triedAnyKey
            ? " (mock fallback — see error)"
            : " (mock)"
          : ` via ${data.provider}`;
      toast(
        `Content generated (${content.wordCount} words)${providerLabel}`,
        warnings.length ? "info" : "success"
      );
    } catch (err) {
      setTaskContentStatus(task.id, "error");
      toast((err as Error).message, "error");
    }
  }

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-[640px] bg-white border-l border-ink-200 shadow-panel flex flex-col">
      {/* Header */}
      <div className="px-6 h-14 flex items-center justify-between border-b border-ink-200 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <TypeBadge value={task.topic.contentType} />
          <span className="text-xs text-ink-500 truncate">
            Updated {formatDate(task.updatedAt)}
          </span>
        </div>
        <Button
          variant="ghost"
          onClick={() => selectTask(null)}
          aria-label="Close panel"
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-auto scrollbar-thin">
        {/* Title */}
        <div className="px-6 py-5 border-b border-ink-100">
          <h1 className="text-xl font-semibold text-ink-900 leading-snug">
            {task.topic.title}
          </h1>
          <div className="text-xs text-ink-500 mt-1.5 font-mono">
            {task.topic.targetKeyword}
          </div>
        </div>

        {/* Overview */}
        <Section title="Overview">
          <Field label="Status">
            <select
              value={task.status}
              onChange={(e) =>
                setTaskStatus(task.id, e.target.value as Status)
              }
              className="input !w-auto !py-1.5"
            >
              {(["todo", "in_progress", "done"] as Status[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Priority">
            <div className="flex items-center gap-2">
              <select
                value={task.topic.priority}
                onChange={(e) =>
                  setTaskPriority(task.id, e.target.value as Priority)
                }
                className="input !w-auto !py-1.5"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <Badge tone="info">{task.topic.priorityScore}/100</Badge>
            </div>
          </Field>
          <Field label="Search intent">{task.topic.searchIntent}</Field>
          <Field label="Suggested CTA">{task.topic.suggestedCta}</Field>
          <Field label="Estimated effort">{task.topic.estimatedEffort}</Field>
          <Field label="Tags">
            <div className="flex items-center gap-1 flex-wrap">
              {task.tags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => removeTaskTag(task.id, tag)}
                  className="badge bg-ink-100 text-ink-700 ring-1 ring-inset ring-ink-200 hover:bg-rose-50 hover:text-rose-700 hover:ring-rose-200"
                  title="Click to remove"
                >
                  {tag}
                  <X className="size-2.5" />
                </button>
              ))}
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && tagInput.trim()) {
                    e.preventDefault();
                    addTaskTag(task.id, tagInput.trim());
                    setTagInput("");
                  }
                }}
                placeholder="Add tag…"
                className="input !w-32 !py-1 !px-2 text-xs"
              />
            </div>
          </Field>
        </Section>

        {/* Opportunity intelligence */}
        <Section title="Opportunity intelligence">
          <Field label="Why this matters">{task.topic.whyOpportunity}</Field>
          {task.topic.competitorGap ? (
            <Field label="Competitor gap">{task.topic.competitorGap}</Field>
          ) : null}
          {task.topic.rankingPotential ? (
            <Field label="Ranking potential">{task.topic.rankingPotential}</Field>
          ) : null}
          {task.topic.businessImpact ? (
            <Field label="Business impact">{task.topic.businessImpact}</Field>
          ) : null}
        </Section>

        {/* Content generation status */}
        <Section title="Content generation">
          <ContentStatusRow
            status={task.contentStatus}
            onGenerate={handleGenerate}
            wordCount={task.content?.wordCount}
          />
        </Section>

        {/* Generated content */}
        {task.content ? (
          <Section
            title={editingContent ? "Editing content" : "Generated content"}
            right={
              editingContent ? null : (
                <Button
                  variant="secondary"
                  onClick={() => setEditingContent(true)}
                  className="!py-1 !px-2 text-xs"
                >
                  <Pencil className="size-3.5" />
                  Edit
                </Button>
              )
            }
          >
            {editingContent ? (
              <ContentEditor
                content={task.content}
                onSave={async (next) => {
                  await setTaskContent(task.id, next);
                  setEditingContent(false);
                }}
                onCancel={() => setEditingContent(false)}
              />
            ) : (
              <>
                <div className="text-xs text-ink-500 mb-3">
                  {task.content.wordCount.toLocaleString()} words ·{" "}
                  {task.content.faqs.length} FAQs ·{" "}
                  {task.content.internalLinks.length} internal-link suggestions
                </div>
                <div className="grid gap-2 mb-3">
                  <ReadField label="URL slug">
                    <code className="text-xs bg-ink-100 px-2 py-1 rounded font-mono">
                      /blog/{task.content.urlSlug}
                    </code>
                  </ReadField>
                  <ReadField label="SEO title">
                    {task.content.metaTitle}
                  </ReadField>
                  <ReadField label="Meta description">
                    {task.content.metaDescription}
                  </ReadField>
                </div>
                <div className="prose-body card p-5 max-h-[480px] overflow-auto scrollbar-thin">
                  <RenderMarkdown text={task.content.body} />
                </div>

                {task.content.ctaPlacements.length > 0 && (
                  <CollapsibleField label="CTA placements">
                    <ul className="text-sm text-ink-700 space-y-1.5 list-disc pl-5">
                      {task.content.ctaPlacements.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </CollapsibleField>
                )}

                {task.content.internalLinks.length > 0 && (
                  <CollapsibleField label="Internal-link suggestions">
                    <ul className="text-sm text-ink-700 space-y-1.5 list-disc pl-5">
                      {task.content.internalLinks.map((l, i) => (
                        <li key={i}>{l}</li>
                      ))}
                    </ul>
                  </CollapsibleField>
                )}

                {task.content.faqs.length > 0 && (
                  <CollapsibleField
                    label={`FAQs (${task.content.faqs.length})`}
                  >
                    <div className="space-y-3">
                      {task.content.faqs.map((f, i) => (
                        <div key={i}>
                          <div className="text-sm font-semibold text-ink-900">
                            {f.q}
                          </div>
                          <div className="text-sm text-ink-700 mt-0.5">
                            {f.a}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CollapsibleField>
                )}

                <CollapsibleField
                  label="Schema markup (JSON-LD)"
                  defaultOpen={false}
                >
                  <pre className="bg-ink-900 text-ink-100 p-3 rounded text-[11px] overflow-auto max-h-64 scrollbar-thin font-mono leading-relaxed">
                    {task.content.schemaJsonLd}
                  </pre>
                </CollapsibleField>

                {task.contentVersions && task.contentVersions.length > 0 ? (
                  <CollapsibleField
                    label={`Previous versions (${task.contentVersions.length})`}
                    icon={History}
                    defaultOpen={false}
                  >
                    <ul className="text-xs text-ink-500 space-y-1">
                      {task.contentVersions.map((v, i) => (
                        <li key={i}>
                          v{task.contentVersions!.length - i} ·{" "}
                          {v.wordCount.toLocaleString()} words · {v.metaTitle}
                        </li>
                      ))}
                    </ul>
                  </CollapsibleField>
                ) : null}
              </>
            )}
          </Section>
        ) : null}

        {/* Comments / remarks */}
        <Section
          title="Comments"
          right={
            commentCount > 0 ? (
              <Badge tone="neutral" className="gap-1">
                <MessageSquare className="size-3" />
                {commentCount}
              </Badge>
            ) : null
          }
        >
          <CommentsSection taskId={task.id} />
        </Section>
      </div>

      {/* Actions footer */}
      <div className="px-6 py-3 border-t border-ink-200 bg-white shrink-0 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            loading={task.contentStatus === "generating"}
            onClick={handleGenerate}
          >
            {task.content ? (
              <>
                <RefreshCw className="size-4" />
                Regenerate
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                Generate content
              </>
            )}
          </Button>
          {task.content ? (
            <>
              <Button
                variant="secondary"
                onClick={async () => {
                  await copyToClipboard(task.content!.body);
                  toast("Copied markdown to clipboard", "success");
                }}
              >
                <Copy className="size-4" />
                Copy
              </Button>
              <Button
                variant="secondary"
                onClick={() => exportToDocs(task)}
              >
                <Download className="size-4" />
                Export
              </Button>
            </>
          ) : null}
        </div>
        <Button
          variant="ghost"
          onClick={() => {
            if (confirm("Delete this task? This cannot be undone.")) {
              deleteTask(task.id);
              selectTask(null);
              toast("Task deleted", "info");
            }
          }}
          className="!text-rose-600 hover:!bg-rose-50"
        >
          <Trash2 className="size-4" />
          Delete
        </Button>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
  right
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="px-6 py-5 border-b border-ink-100">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
          {title}
        </h2>
        {right}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function ReadField({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 items-start">
      <div className="text-xs text-ink-500 pt-1.5">{label}</div>
      <div className="text-sm text-ink-800 min-w-0">{children}</div>
    </div>
  );
}

function Field({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 items-start">
      <div className="text-xs text-ink-500 pt-1.5">{label}</div>
      <div className="text-sm text-ink-800 min-w-0">{children}</div>
    </div>
  );
}

function CollapsibleField({
  label,
  children,
  defaultOpen = true,
  icon: Icon
}: {
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs font-medium text-ink-700 hover:text-ink-900"
      >
        {open ? (
          <ChevronDown className="size-3.5" />
        ) : (
          <ChevronRight className="size-3.5" />
        )}
        {Icon ? <Icon className="size-3.5" /> : null}
        {label}
      </button>
      {open ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}

function ContentStatusRow({
  status,
  onGenerate,
  wordCount
}: {
  status: Task["contentStatus"];
  onGenerate: () => void;
  wordCount?: number;
}) {
  if (status === "generating") {
    return (
      <div className="flex items-center gap-2 text-sm text-ink-700">
        <Loader2 className="size-4 animate-spin text-brand-600" />
        Generating long-form SEO content (this can take 10-30 seconds with live AI)…
      </div>
    );
  }
  if (status === "completed") {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-700">
        <CheckCircle2 className="size-4" />
        Content ready ({wordCount?.toLocaleString() ?? "—"} words)
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="flex items-center gap-2 text-sm text-rose-700">
        Generation failed.{" "}
        <button
          onClick={onGenerate}
          className="underline hover:no-underline ml-1"
        >
          Retry
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-sm text-ink-700">
      <Plus className="size-4" />
      Not started.{" "}
      <button
        onClick={onGenerate}
        className="underline hover:no-underline ml-1"
      >
        Generate now
      </button>
    </div>
  );
}

// Lightweight markdown renderer (we control inputs, so a small subset is enough).
function RenderMarkdown({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const out: React.ReactNode[] = [];
  let i = 0;
  let listBuf: string[] = [];
  let listType: "ul" | "ol" | null = null;

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

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.startsWith("# ")) {
      flushList();
      out.push(<h1 key={i}>{renderInline(line.slice(2))}</h1>);
    } else if (line.startsWith("## ")) {
      flushList();
      out.push(<h2 key={i}>{renderInline(line.slice(3))}</h2>);
    } else if (line.startsWith("### ")) {
      flushList();
      out.push(<h3 key={i}>{renderInline(line.slice(4))}</h3>);
    } else if (/^\s*[-*]\s+/.test(line)) {
      if (listType === "ol") flushList();
      listType = "ul";
      listBuf.push(line.replace(/^\s*[-*]\s+/, ""));
    } else if (/^\s*\d+\.\s+/.test(line)) {
      if (listType === "ul") flushList();
      listType = "ol";
      listBuf.push(line.replace(/^\s*\d+\.\s+/, ""));
    } else if (line.trim() === "") {
      flushList();
    } else {
      flushList();
      out.push(<p key={i}>{renderInline(line)}</p>);
    }
    i++;
  }
  flushList();
  return <>{out}</>;
}

function renderInline(s: string): React.ReactNode {
  // Bold **x** and inline code `x`
  const parts: React.ReactNode[] = [];
  let rest = s;
  let key = 0;
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`)/;
  while (rest.length) {
    const m = rest.match(re);
    if (!m) {
      parts.push(rest);
      break;
    }
    const idx = m.index ?? 0;
    if (idx > 0) parts.push(rest.slice(0, idx));
    if (m[2] !== undefined) {
      parts.push(<strong key={key++}>{m[2]}</strong>);
    } else if (m[3] !== undefined) {
      parts.push(
        <code
          key={key++}
          className="bg-ink-100 px-1 py-0.5 rounded text-[12px] font-mono"
        >
          {m[3]}
        </code>
      );
    }
    rest = rest.slice(idx + m[0].length);
  }
  return <>{parts}</>;
}

function exportToDocs(task: Task) {
  if (!task.content) return;
  const c = task.content;
  const md = [
    `# ${task.topic.title}`,
    "",
    `> Meta title: ${c.metaTitle}`,
    `> Meta description: ${c.metaDescription}`,
    `> URL slug: /blog/${c.urlSlug}`,
    `> Target keyword: ${task.topic.targetKeyword}`,
    "",
    "---",
    "",
    c.body,
    "",
    "## FAQs",
    "",
    ...c.faqs.map((f) => `**${f.q}**\n\n${f.a}\n`),
    "",
    "## Internal-link suggestions",
    ...c.internalLinks.map((l) => `- ${l}`),
    "",
    "## CTA placements",
    ...c.ctaPlacements.map((l) => `- ${l}`),
    "",
    "## JSON-LD schema",
    "",
    "```json",
    c.schemaJsonLd,
    "```"
  ].join("\n");
  const blob = new Blob([md], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${c.urlSlug || "content"}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast("Exported to .md (Google Docs can import this)", "success");
}
