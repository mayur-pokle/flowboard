"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Copy,
  Edit2,
  Save,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/Toast";
import { Breadcrumb } from "@/components/discovery/Breadcrumb";
import {
  AI_CITATION_BOX_CLASS
} from "@/components/discovery/tokens";
import { renderMarkdown } from "@/lib/markdown-mini";
import type { QualitySignals } from "@/lib/content-quality";
import { cn } from "@/lib/utils";

interface Opp {
  id: string;
  query: string;
  intent: string | null;
  aiCitationGap: boolean;
  contentMarkdown: string | null;
  contentGeneratedAt: string | null;
  qualitySignals: QualitySignals | null;
  linkedTaskId: string | null;
  status: string;
}

// Progress steps shown during the 15-30s wait. Each step is something
// the system is actually doing, surfaced so the wait feels purposeful.
const PROGRESS_STEPS = [
  "Analysing the brief…",
  "Reading the brand profile + voice…",
  "Drafting the direct-answer lead…",
  "Expanding the outline section by section…",
  "Weaving in internal links…",
  "Checking cannibalization constraints…",
  "Running quality checks…"
];
const STEP_INTERVAL_MS = 2400;

export default function ContentPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [opp, setOpp] = useState<Opp | null>(null);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [editing, setEditing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progressStep, setProgressStep] = useState(0);
  const [provider, setProvider] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [quality, setQuality] = useState<QualitySignals | null>(null);
  const [wordCountTarget, setWordCountTarget] = useState<number>(1800);
  const stepTimer = useRef<NodeJS.Timeout | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/discoveries/${id}`);
      if (!res.ok) throw new Error("Could not load opportunity");
      const json = await res.json();
      setOpp(json.opportunity);
      setContent(json.opportunity.contentMarkdown || "");
      setQuality(json.opportunity.qualitySignals || null);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // First visit + no content yet → auto-generate (kick off the wait UX).
  useEffect(() => {
    if (!loading && opp && !opp.contentMarkdown && !generating) {
      void generateContent();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, opp?.id]);

  function startProgressTicker() {
    setProgressStep(0);
    stopProgressTicker();
    stepTimer.current = setInterval(() => {
      setProgressStep((s) =>
        s < PROGRESS_STEPS.length - 1 ? s + 1 : s
      );
    }, STEP_INTERVAL_MS);
  }
  function stopProgressTicker() {
    if (stepTimer.current) {
      clearInterval(stepTimer.current);
      stepTimer.current = null;
    }
  }
  useEffect(() => () => stopProgressTicker(), []);

  async function generateContent() {
    setGenerating(true);
    startProgressTicker();
    setWarnings([]);
    try {
      const res = await fetch(`/api/discoveries/${id}/content`, {
        method: "POST"
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Generation failed");
      setContent(json.contentMarkdown);
      setQuality(json.quality);
      setWordCountTarget(json.wordCountTarget || 1800);
      setProvider(json.provider);
      setWarnings(json.warnings || []);
      await load(); // refresh opp state (linkedTaskId etc.)
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      stopProgressTicker();
      setProgressStep(PROGRESS_STEPS.length - 1);
      setGenerating(false);
    }
  }

  async function saveContent() {
    setSaving(true);
    try {
      const res = await fetch(`/api/discoveries/${id}/content`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentMarkdown: content })
      });
      const json = await res.json();
      if (!res.ok) throw new Error("Save failed");
      setQuality(json.quality);
      toast("Article saved", "success");
      setEditing(false);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(content);
      toast("Markdown copied", "success");
    } catch {
      toast("Could not access clipboard", "error");
    }
  }

  const usedMockFallback = provider === "mock";
  const wordCount = quality?.wordCount ?? 0;
  const wordCountOk =
    wordCountTarget > 0 &&
    wordCount >= wordCountTarget * 0.85 &&
    wordCount <= wordCountTarget * 1.25;

  const progressPct = useMemo(() => {
    if (!generating) return 100;
    return ((progressStep + 1) / PROGRESS_STEPS.length) * 100;
  }, [generating, progressStep]);

  if (loading || !opp) {
    return (
      <div className="flex-1 grid place-items-center text-sm text-ink-500">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col">
      {/* Header */}
      <div className="px-8 py-4 border-b border-ink-200 bg-white shrink-0">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="text-xs text-ink-500 mb-1">Content</div>
            <h1 className="text-xl font-bold text-ink-900 leading-tight font-mono truncate">
              {opp.query}
            </h1>
          </div>
          <Breadcrumb
            current="content"
            opportunityId={opp.id}
            query={opp.query}
          />
        </div>
      </div>

      {/* Body: two columns */}
      <div className="flex-1 min-h-0 overflow-auto scrollbar-thin">
        <div className="max-w-6xl mx-auto px-8 py-6 grid grid-cols-12 gap-6">
          {/* LEFT — article */}
          <div className="col-span-12 lg:col-span-8 space-y-4">
            {generating ? (
              <ProgressCard
                step={progressStep}
                progressPct={progressPct}
              />
            ) : (
              <div className="card p-0 overflow-hidden">
                <div className="px-4 py-3 border-b border-ink-100 flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-ink-900">
                    Generated article
                  </h2>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" onClick={() => void copyMarkdown()}>
                      <Copy className="size-3.5" />
                      Copy markdown
                    </Button>
                    {editing ? (
                      <Button
                        variant="primary"
                        onClick={() => void saveContent()}
                        disabled={saving}
                      >
                        <Save className="size-3.5" />
                        Save
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={() => setEditing(true)}
                      >
                        <Edit2 className="size-3.5" />
                        Edit
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      onClick={() => void generateContent()}
                      disabled={generating}
                    >
                      <RefreshCw className="size-3.5" />
                      Regenerate
                    </Button>
                  </div>
                </div>
                <div className="p-4">
                  {editing ? (
                    <textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      className="w-full min-h-[640px] font-mono text-xs p-3 border border-ink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-200"
                    />
                  ) : content ? (
                    <div
                      className="prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{
                        __html: renderMarkdown(content)
                      }}
                    />
                  ) : (
                    <div className="text-sm text-ink-500">
                      No content yet — click Regenerate to draft.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Provider warnings (model fallback / rate limit notes). */}
            {warnings.length > 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 space-y-1">
                {warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Offline fallback note — shown VISIBLY when mock was used.
                Users need to know whether they're reading AI output or
                a template. */}
            {usedMockFallback ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-900 flex items-start gap-2">
                <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                <div>
                  <strong>Offline fallback used.</strong> All AI providers
                  were rate-limited or unavailable, so this article was
                  generated from a template. Add a working OpenAI, Gemini,
                  or Anthropic key in Settings → AI providers and click
                  Regenerate for real output.
                </div>
              </div>
            ) : null}

            {/* Footer — primary CTA advances to the Kanban */}
            {opp.linkedTaskId && !generating ? (
              <div className="flex items-center justify-end gap-2 pt-2">
                <Link href="/board">
                  <Button variant="primary">
                    View on Kanban
                    <ArrowRight className="size-4" />
                  </Button>
                </Link>
              </div>
            ) : null}
          </div>

          {/* RIGHT — quality signals */}
          <aside className="col-span-12 lg:col-span-4 space-y-4">
            <div className="card p-4">
              <h3 className="text-xs uppercase tracking-wider text-ink-500 mb-3">
                Quality signals
              </h3>
              <ul className="space-y-2">
                <QualityRow
                  ok={quality?.directAnswer ?? false}
                  label="Direct answer in opening paragraph"
                />
                <QualityRow
                  ok={quality?.comparisonTable ?? false}
                  label="Includes a comparison table"
                  optional
                />
                <QualityRow
                  ok={quality?.cannibalizationOk ?? true}
                  label="No cannibalization with library"
                />
                <QualityRow
                  ok={wordCountOk}
                  label={`Word count ${wordCount.toLocaleString()} (target ${wordCountTarget.toLocaleString()})`}
                />
              </ul>
              {provider ? (
                <div className="mt-3 pt-3 border-t border-ink-100 text-[10px] uppercase tracking-wider text-ink-500">
                  Generated by{" "}
                  <span className="text-ink-700 font-medium">
                    {provider}
                  </span>
                  {opp.contentGeneratedAt
                    ? ` · ${new Date(opp.contentGeneratedAt).toLocaleString()}`
                    : null}
                </div>
              ) : null}
            </div>

            {/* AI citation reminder — same purple as the brief box */}
            {opp.aiCitationGap ? (
              <div
                className={cn(
                  "rounded-xl p-4",
                  AI_CITATION_BOX_CLASS
                )}
              >
                <div className="flex items-start gap-2">
                  <Sparkles className="size-4 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-xs font-semibold mb-1">
                      AI citation worthy
                    </h3>
                    <p className="text-xs opacity-90">
                      Double-check the opening paragraph has the keyword
                      and a clear, quotable answer. AI engines pull from
                      the first two paragraphs.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  );
}

// Progress UI shown during AI generation. Animated bar + rotating step
// labels — each step is something actually happening server-side.
function ProgressCard({
  step,
  progressPct
}: {
  step: number;
  progressPct: number;
}) {
  return (
    <div className="card p-6">
      <div className="flex items-start gap-3 mb-4">
        <Loader2 className="size-5 text-brand-600 animate-spin mt-0.5" />
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-ink-900 mb-0.5">
            Generating content
          </h2>
          <p className="text-xs text-ink-500">
            This usually takes 15–30 seconds. We'll auto-create a Kanban
            task in Done when ready.
          </p>
        </div>
      </div>
      <div className="h-2 bg-ink-100 rounded-full overflow-hidden mb-4">
        <div
          className="h-full bg-brand-600 rounded-full transition-all duration-700 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <ol className="space-y-2">
        {PROGRESS_STEPS.map((label, i) => (
          <li
            key={label}
            className={cn(
              "flex items-center gap-2 text-xs",
              i < step
                ? "text-ink-400"
                : i === step
                ? "text-ink-900 font-medium"
                : "text-ink-300"
            )}
          >
            {i < step ? (
              <CheckCircle2 className="size-3.5 text-emerald-500" />
            ) : i === step ? (
              <Loader2 className="size-3.5 animate-spin text-brand-600" />
            ) : (
              <span className="size-3.5 rounded-full border-2 border-ink-200" />
            )}
            {label}
          </li>
        ))}
      </ol>
    </div>
  );
}

function QualityRow({
  ok,
  label,
  optional
}: {
  ok: boolean;
  label: string;
  optional?: boolean;
}) {
  return (
    <li className="flex items-start gap-2 text-xs">
      {ok ? (
        <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
      ) : optional ? (
        <AlertTriangle className="size-3.5 text-amber-500 shrink-0 mt-0.5" />
      ) : (
        <AlertTriangle className="size-3.5 text-rose-500 shrink-0 mt-0.5" />
      )}
      <span
        className={cn(
          ok ? "text-ink-700" : optional ? "text-amber-900" : "text-rose-900"
        )}
      >
        {label}
      </span>
    </li>
  );
}
