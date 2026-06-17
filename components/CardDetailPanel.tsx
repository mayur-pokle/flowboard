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
  MessageSquare,
  Globe,
  TrendingUp,
  TrendingDown,
  Minus,
  ExternalLink as ExternalLinkIcon,
  AlertTriangle
} from "lucide-react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/Button";
import { PriorityBadge, TypeBadge, Badge } from "@/components/ui/Badge";
import { toast } from "@/components/Toast";
import { copyToClipboard, formatDate } from "@/lib/utils";
import type { GeneratedContent, Priority, Status, Task } from "@/lib/types";
import { ContentEditor } from "@/components/ContentEditor";
import { CommentsSection } from "@/components/CommentsSection";
import { PublishPromptSection } from "@/components/PublishPromptSection";
import {
  PipelinePanel,
  type PanelHeaderBadge,
  type PanelTab
} from "@/components/pipeline/PipelinePanel";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<Status, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done"
};
const PRIORITIES: Priority[] = ["Low", "Medium", "High"];

const PRIORITY_BADGE_CLASS: Record<Priority, string> = {
  High: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200",
  Medium: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200",
  Low: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"
};

const TYPE_BADGE_CLASS: Record<string, string> = {
  Calculator: "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200",
  Template: "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200",
  Guide: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200",
  Whitepaper: "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200",
  Checklist: "bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-200",
  Framework: "bg-fuchsia-50 text-fuchsia-700 ring-1 ring-inset ring-fuchsia-200"
};

// Convert task.topic.priority to a 0-100 score for the speedometer.
function priorityToScore(p: Priority): number {
  if (p === "High") return 85;
  if (p === "Medium") return 60;
  return 30;
}

export function CardDetailPanel({ task }: { task: Task }) {
  const settings = useStore((s) => s.settings);
  const setTaskStatus = useStore((s) => s.setTaskStatus);
  const setTaskPriority = useStore((s) => s.setTaskPriority);
  const addTaskTag = useStore((s) => s.addTaskTag);
  const removeTaskTag = useStore((s) => s.removeTaskTag);
  const setTaskContentStatus = useStore((s) => s.setTaskContentStatus);
  const setTaskContent = useStore((s) => s.setTaskContent);
  const setTaskPublishedUrl = useStore((s) => s.setTaskPublishedUrl);
  const fetchTaskPerformance = useStore((s) => s.fetchTaskPerformance);
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
      if (settings.anthropicModel)
        headers["x-anthropic-model"] = settings.anthropicModel;
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

  // ── Tab state ──
  // Defaults to Content when a draft exists (most users open the panel
  // to inspect the draft). Otherwise lands on Overview.
  const [activeTab, setActiveTab] = useState<
    "overview" | "content" | "performance" | "comments"
  >(task.content ? "content" : "overview");

  // ── Panel chassis props ──
  const badges: PanelHeaderBadge[] = [
    {
      label: task.topic.contentType,
      className:
        TYPE_BADGE_CLASS[task.topic.contentType] ||
        "bg-ink-100 text-ink-700 ring-1 ring-inset ring-ink-200"
    },
    {
      label: task.topic.priority,
      className: PRIORITY_BADGE_CLASS[task.topic.priority]
    },
    {
      label: STATUS_LABELS[task.status],
      className: "bg-ink-100 text-ink-700 ring-1 ring-inset ring-ink-200"
    }
  ];

  const speedometerValue = priorityToScore(task.topic.priority);
  const impact = task.topic.impactScore ?? task.topic.priorityScore;
  const novelty = task.topic.noveltyScore ?? 100;
  const cannibalizationClarity = task.topic.overlapWithUrl ? 4 : 10;

  // Signals row (under the score block) — mirror the Discovery surface.
  const signalsBlock = (
    <>
      {task.contentStatus === "completed" ? (
        <span className="badge text-[10px] inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200">
          <CheckCircle2 className="size-3" />
          Draft ready
        </span>
      ) : null}
      {task.contentStatus === "generating" ? (
        <span className="badge text-[10px] inline-flex items-center gap-1 bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200">
          <Loader2 className="size-3 animate-spin" />
          Generating
        </span>
      ) : null}
      {task.topic.overlapWithUrl ? (
        <span
          className="badge text-[10px] inline-flex items-center gap-1 bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200"
          title={task.topic.overlapWithTitle || task.topic.overlapWithUrl}
        >
          <AlertTriangle className="size-3" />
          Cannibalization risk
        </span>
      ) : null}
    </>
  );

  // ── Tab definitions ──
  const tabs: PanelTab[] = [
    {
      id: "overview",
      label: "Overview",
      render: () => renderOverviewTab()
    },
    {
      id: "content",
      label: "Content",
      indicator: task.content ? (
        <CheckCircle2 className="size-3 text-emerald-500" />
      ) : null,
      render: () => renderContentTab()
    },
    {
      id: "performance",
      label: "Performance",
      indicator: task.publishedUrlMetrics ? (
        <CheckCircle2 className="size-3 text-emerald-500" />
      ) : null,
      render: () => renderPerformanceTab()
    },
    {
      id: "comments",
      label: "Comments",
      indicator:
        commentCount > 0 ? (
          <span className="text-[10px] bg-ink-100 text-ink-700 rounded-full px-1.5 tabular-nums">
            {commentCount}
          </span>
        ) : null,
      render: () => renderCommentsTab()
    }
  ];

  // ── Tab render functions ──
  function renderOverviewTab() {
    return (
      <div className="space-y-4">
        <Field label="Status">
          <select
            value={task.status}
            onChange={(e) => setTaskStatus(task.id, e.target.value as Status)}
            className="input !w-auto !py-2"
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
              className="input !w-auto !py-2"
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
                <X className="size-3" />
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

        {/* Opportunity intelligence — moved under Overview */}
        <div className="pt-3 border-t border-ink-100 space-y-3">
          <h3 className="text-[10px] uppercase tracking-wider text-ink-500">
            Opportunity intelligence
          </h3>
          <Field label="Why this matters">{task.topic.whyOpportunity}</Field>
          {task.topic.competitorGap ? (
            <Field label="Competitor gap">{task.topic.competitorGap}</Field>
          ) : null}
          {task.topic.rankingPotential ? (
            <Field label="Ranking potential">
              {task.topic.rankingPotential}
            </Field>
          ) : null}
          {task.topic.businessImpact ? (
            <Field label="Business impact">{task.topic.businessImpact}</Field>
          ) : null}
        </div>

        <div className="pt-3 border-t border-ink-100 text-[11px] text-ink-500">
          Updated {formatDate(task.updatedAt)}
        </div>
      </div>
    );
  }

  function renderContentTab() {
    return (
      <div className="space-y-4">
        <ContentStatusRow
          status={task.contentStatus}
          onGenerate={handleGenerate}
          wordCount={task.content?.wordCount}
        />

        {/* Primary actions */}
        <div className="flex items-center gap-2 flex-wrap">
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
              <Button variant="secondary" onClick={() => exportToDocs(task)}>
                <Download className="size-4" />
                Export
              </Button>
            </>
          ) : null}
        </div>

        {/* Generated content body */}
        {task.content ? (
          <div
            className={cn(
              "border border-ink-200 rounded-lg p-3 bg-ink-50/40",
              editingContent && "p-0 bg-white"
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-ink-900">
                {editingContent ? "Editing content" : "Generated content"}
              </span>
              {!editingContent ? (
                <Button
                  variant="secondary"
                  onClick={() => setEditingContent(true)}
                  className="!py-1 !px-2 text-xs"
                >
                  <Pencil className="size-4" />
                  Edit
                </Button>
              ) : null}
            </div>
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
                  {(task.content.wordCount ?? 0).toLocaleString()} words ·{" "}
                  {(task.content.faqs ?? []).length} FAQs ·{" "}
                  {(task.content.internalLinks ?? []).length} internal-link suggestions
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
                <div className="prose-body card p-4 max-h-[480px] overflow-auto scrollbar-thin">
                  <RenderMarkdown text={task.content.body} />
                </div>

                {(task.content.ctaPlacements ?? []).length > 0 && (
                  <CollapsibleField label="CTA placements">
                    <ul className="text-base text-ink-700 space-y-2 list-disc pl-5">
                      {(task.content.ctaPlacements ?? []).map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </CollapsibleField>
                )}

                {(task.content.internalLinks ?? []).length > 0 && (
                  <CollapsibleField label="Internal-link suggestions">
                    <ul className="text-base text-ink-700 space-y-2 list-disc pl-5">
                      {(task.content.internalLinks ?? []).map((l, i) => (
                        <li key={i}>{l}</li>
                      ))}
                    </ul>
                  </CollapsibleField>
                )}

                {(task.content.faqs ?? []).length > 0 && (
                  <CollapsibleField
                    label={`FAQs (${(task.content.faqs ?? []).length})`}
                  >
                    <div className="space-y-3">
                      {(task.content.faqs ?? []).map((f, i) => (
                        <div key={i}>
                          <div className="text-base font-semibold text-ink-900">
                            {f.q}
                          </div>
                          <div className="text-base text-ink-700 mt-1">
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
                  <pre className="bg-ink-900 text-ink-100 p-3 rounded text-xs overflow-auto max-h-64 scrollbar-thin font-mono leading-relaxed">
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
          </div>
        ) : null}
      </div>
    );
  }

  function renderPerformanceTab() {
    return (
      <div className="space-y-4">
        <PerformanceSection
          task={task}
          onUrlChange={(url) => setTaskPublishedUrl(task.id, url)}
          onRefresh={async () => {
            try {
              const res = await fetchTaskPerformance(task.id);
              toast(
                res.hasData
                  ? "Performance refreshed from GSC"
                  : "No GSC data found for this URL yet — it may take a few days after publishing.",
                res.hasData ? "success" : "info"
              );
            } catch (err) {
              toast((err as Error).message, "error");
            }
          }}
        />
        {task.content ? (
          <div className="pt-4 border-t border-ink-100">
            <PublishPromptSection task={task} />
          </div>
        ) : null}
      </div>
    );
  }

  function renderCommentsTab() {
    return <CommentsSection taskId={task.id} />;
  }

  // ── Shared chassis ──
  return (
    <PipelinePanel
      title={task.topic.title}
      subline={{ label: "kw", value: task.topic.targetKeyword }}
      badges={badges}
      score={{
        value: speedometerValue,
        label: "Priority",
        priorityLabel: task.topic.priority,
        bars: [
          { label: "Impact", value: impact, max: 100 },
          {
            label: "Novelty",
            value: novelty,
            max: 100,
            tone: novelty >= 70 ? "good" : "warn"
          },
          { label: "Priority score", value: task.topic.priorityScore, max: 100 },
          {
            label: "Cannibalization clarity",
            value: cannibalizationClarity,
            max: 10,
            tone: cannibalizationClarity >= 7 ? "good" : "warn"
          }
        ]
      }}
      signals={signalsBlock}
      tabs={tabs}
      activeTabId={activeTab}
      onTabChange={(id) =>
        setActiveTab(id as "overview" | "content" | "performance" | "comments")
      }
      onClose={() => selectTask(null)}
      onDelete={() => {
        if (confirm("Delete this task? This cannot be undone.")) {
          deleteTask(task.id);
          selectTask(null);
          toast("Task deleted", "info");
        }
      }}
    />
  );
}

function PerformanceSection({
  task,
  onUrlChange,
  onRefresh
}: {
  task: Task;
  onUrlChange: (url: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(task.publishedUrl || "");
  const [refreshing, setRefreshing] = useState(false);
  // Sync local draft when the task changes externally.
  if (
    draft !== (task.publishedUrl || "") &&
    document.activeElement?.tagName !== "INPUT"
  ) {
    setDraft(task.publishedUrl || "");
  }

  const metrics = task.publishedUrlMetrics;
  const hasMetrics =
    Boolean(metrics) &&
    (metrics!.current.impressions > 0 || metrics!.previous.impressions > 0);

  return (
    <>
      <Field label="Published URL">
        <div className="flex items-center gap-2">
          <Globe
            className={
              "size-4 shrink-0 " +
              (draft ? "text-brand-600" : "text-ink-300")
            }
          />
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (draft.trim() !== (task.publishedUrl || ""))
                onUrlChange(draft);
            }}
            placeholder="https://your-site.com/blog/article-slug"
            className="input text-sm font-mono"
          />
          {task.publishedUrl ? (
            <a
              href={task.publishedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-ink-400 hover:text-brand-700 rounded shrink-0"
              aria-label="Open URL in new tab"
            >
              <ExternalLinkIcon className="size-4" />
            </a>
          ) : null}
        </div>
      </Field>

      {!task.publishedUrl ? (
        <div className="text-xs text-ink-500 italic">
          Add the live URL once the article publishes to track its GSC
          performance directly in this card.
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-xs text-ink-500">
              {metrics?.fetchedAt ? (
                <>
                  Last refreshed{" "}
                  <span title={new Date(metrics.fetchedAt).toLocaleString()}>
                    {timeAgo(metrics.fetchedAt)}
                  </span>{" "}
                  · last 28d vs previous 28d
                </>
              ) : (
                "Not fetched yet"
              )}
            </div>
            <Button
              variant="secondary"
              onClick={async () => {
                setRefreshing(true);
                try {
                  await onRefresh();
                } finally {
                  setRefreshing(false);
                }
              }}
              loading={refreshing}
              className="!py-1.5"
            >
              <RefreshCw className="size-4" />
              Refresh data
            </Button>
          </div>

          {hasMetrics ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MetricCard
                label="Impressions"
                current={metrics!.current.impressions}
                previous={metrics!.previous.impressions}
                format={(n) => n.toLocaleString()}
                higherIsBetter
              />
              <MetricCard
                label="Clicks"
                current={metrics!.current.clicks}
                previous={metrics!.previous.clicks}
                format={(n) => n.toLocaleString()}
                higherIsBetter
              />
              <MetricCard
                label="Avg position"
                current={metrics!.current.position}
                previous={metrics!.previous.position}
                format={(n) => (n ? n.toFixed(1) : "—")}
                // Lower position number = better rank
                higherIsBetter={false}
              />
              <MetricCard
                label="CTR"
                current={metrics!.current.ctr}
                previous={metrics!.previous.ctr}
                format={(n) => `${(n * 100).toFixed(2)}%`}
                higherIsBetter
              />
            </div>
          ) : metrics ? (
            <div className="text-xs text-ink-500 italic">
              GSC has no data for this URL in either window yet. Newly
              published pages can take a few days to appear.
            </div>
          ) : null}
        </>
      )}
    </>
  );
}

function MetricCard({
  label,
  current,
  previous,
  format,
  higherIsBetter
}: {
  label: string;
  current: number;
  previous: number;
  format: (n: number) => string;
  higherIsBetter: boolean;
}) {
  const delta = current - previous;
  const pct =
    previous === 0
      ? current === 0
        ? 0
        : 100
      : (delta / previous) * 100;
  const isImprovement = higherIsBetter ? delta > 0 : delta < 0;
  const isDegradation = higherIsBetter ? delta < 0 : delta > 0;
  const Trend = delta === 0 ? Minus : isImprovement ? TrendingUp : TrendingDown;
  const trendColor = isImprovement
    ? "text-emerald-700 bg-emerald-50 ring-emerald-200"
    : isDegradation
    ? "text-rose-700 bg-rose-50 ring-rose-200"
    : "text-ink-600 bg-ink-50 ring-ink-200";
  return (
    <div className="rounded-md border border-ink-200 bg-white p-3">
      <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-1">
        {label}
      </div>
      <div className="text-xl font-semibold text-ink-900 tabular-nums">
        {format(current)}
      </div>
      <div
        className={
          "inline-flex items-center gap-1 mt-2 px-1.5 py-0.5 rounded text-[10px] font-medium ring-1 ring-inset " +
          trendColor
        }
      >
        <Trend className="size-3" />
        {delta === 0
          ? "no change"
          : `${pct > 0 ? "+" : ""}${pct.toFixed(0)}%`}
      </div>
    </div>
  );
}

// Tiny relative-time helper. Kept local because the CommentsSection has
// the same util — small, not worth a shared lib.
function timeAgo(iso: string): string {
  try {
    const diff = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(iso).toLocaleDateString();
  } catch {
    return "—";
  }
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
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">
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
      <div className="text-xs text-ink-500 pt-2">{label}</div>
      <div className="text-base text-ink-800 min-w-0">{children}</div>
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
      <div className="text-xs text-ink-500 pt-2">{label}</div>
      <div className="text-base text-ink-800 min-w-0">{children}</div>
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
          <ChevronDown className="size-4" />
        ) : (
          <ChevronRight className="size-4" />
        )}
        {Icon ? <Icon className="size-4" /> : null}
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
      <div className="flex items-center gap-2 text-base text-ink-700">
        <Loader2 className="size-4 animate-spin text-brand-600" />
        Generating long-form SEO content (this can take 10-30 seconds with live AI)…
      </div>
    );
  }
  if (status === "completed") {
    return (
      <div className="flex items-center gap-2 text-base text-emerald-700">
        <CheckCircle2 className="size-4" />
        Content ready ({wordCount?.toLocaleString() ?? "—"} words)
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="flex items-center gap-2 text-base text-rose-700">
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
    <div className="flex items-center gap-2 text-base text-ink-700">
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
          className="bg-ink-100 px-1 py-1 rounded text-[12px] font-mono"
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
