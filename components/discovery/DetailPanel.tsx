"use client";

import { useEffect, useState } from "react";
import {
  X,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Copy,
  Edit2,
  Save,
  AlertCircle,
  ExternalLink,
  ArrowRight,
  Undo2,
  Trash2
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/components/Toast";
import {
  scoreTone,
  SCORE_TONE_CLASSES,
  TYPE_LABEL,
  TYPE_BADGE_CLASS,
  PRIORITY_LABEL,
  PRIORITY_BADGE_CLASS,
  SOURCE_LABEL,
  SOURCE_TONE,
  AI_CITATION_BADGE_CLASS,
  AI_CITATION_BOX_CLASS,
  TRENDING_BADGE_CLASS
} from "./tokens";
import type { Opportunity } from "./types";
import type { QualityChecks, CheckStatus } from "@/lib/content-quality";
import { renderMarkdown } from "@/lib/markdown-mini";
import { cn } from "@/lib/utils";
import {
  PipelinePanel,
  type PanelHeaderBadge,
  type PanelTab
} from "@/components/pipeline/PipelinePanel";

type Tab = "brief" | "content" | "quality";

interface Props {
  opportunity: Opportunity;
  onClose: () => void;
  onRefresh: () => void;
  // Optional — only available from the Kanban page. Used to optimize
  // out the panel after destructive actions so the UI stays snappy.
  onDeleted?: (id: string) => void;
}

export function DetailPanel({
  opportunity,
  onClose,
  onRefresh,
  onDeleted
}: Props) {
  const [tab, setTab] = useState<Tab>(
    opportunity.contentMarkdown
      ? "content"
      : opportunity.briefData
      ? "brief"
      : "brief"
  );
  const [briefMd, setBriefMd] = useState(opportunity.briefMarkdown || "");
  // Local copy of briefData — updated immediately when generateBrief
  // returns. We render off this rather than waiting for the props
  // refresh through onRefresh() so the panel paints the brief the
  // moment it's available.
  const [briefDataLocal, setBriefDataLocal] = useState(
    opportunity.briefData
  );
  const [contentMd, setContentMd] = useState(
    opportunity.contentMarkdown || ""
  );
  const [editing, setEditing] = useState<"brief" | "content" | null>(null);
  const [busy, setBusy] = useState<"brief" | "content" | "regen" | null>(null);
  const [quality, setQuality] = useState<QualityChecks | null>(
    opportunity.contentChecks
  );

  useEffect(() => {
    setBriefMd(opportunity.briefMarkdown || "");
    setBriefDataLocal(opportunity.briefData);
    setContentMd(opportunity.contentMarkdown || "");
    setQuality(opportunity.contentChecks);
  }, [
    opportunity.id,
    opportunity.briefMarkdown,
    opportunity.briefData,
    opportunity.contentMarkdown,
    opportunity.contentChecks
  ]);

  // Auto-fire brief generation the moment the panel opens on a card
  // that doesn't have one yet. Brief gen is deterministic + < 2s, so
  // the strategist sees the brief land instead of an empty CTA.
  // Guarded so it only fires once per opportunity.
  const [autoTriedFor, setAutoTriedFor] = useState<string | null>(null);
  useEffect(() => {
    if (!opportunity.id) return;
    if (opportunity.briefData) return;
    if (autoTriedFor === opportunity.id) return;
    setAutoTriedFor(opportunity.id);
    void generateBrief();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunity.id, opportunity.briefData]);

  async function generateBrief() {
    setBusy("brief");
    try {
      const res = await fetch(`/api/discoveries/${opportunity.id}/brief`, {
        method: "POST"
      });
      let json: {
        ok?: boolean;
        error?: string;
        briefMarkdown?: string;
        briefData?: Opportunity["briefData"];
      } = {};
      try {
        json = await res.json();
      } catch {
        // ignore
      }
      if (!res.ok) {
        const detail =
          json.error || (await res.text().catch(() => "")) || res.statusText;
        throw new Error(`Brief generation failed (${res.status}): ${detail}`);
      }
      // Update local render state IMMEDIATELY so the brief appears
      // without waiting for the parent's refetch to round-trip.
      setBriefMd(json.briefMarkdown || "");
      setBriefDataLocal(json.briefData || briefDataLocal);
      toast("Brief generated", "success");
      onRefresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function generateContent() {
    setBusy("content");
    try {
      const res = await fetch(`/api/discoveries/${opportunity.id}/content`, {
        method: "POST"
      });
      let json: {
        ok?: boolean;
        error?: string;
        contentMarkdown?: string;
        provider?: string;
        isTemplate?: boolean;
        warnings?: string[];
        quality?: typeof quality;
      } = {};
      try {
        json = await res.json();
      } catch {
        // ignore — empty response will fall through
      }
      if (!res.ok) {
        // Surface the actual server error so the user knows whether
        // it's a missing key, schema mismatch, or 5xx — not a generic
        // "Content gen failed".
        const detail = json.error || (await res.text().catch(() => "")) || res.statusText;
        throw new Error(`Content generation failed (${res.status}): ${detail}`);
      }
      setContentMd(json.contentMarkdown || "");
      setQuality((json.quality as typeof quality) || null);
      setTab("content");
      if (json.isTemplate) {
        toast(
          "Template returned (no LLM available). Fill in the [WRITE] blocks — set GEMINI_API_KEY / OPENAI_API_KEY for real output.",
          "info"
        );
      } else {
        toast(`Article ready · ${json.provider}`, "success");
      }
      // Surface non-fatal warnings (failed-provider notes) as separate toasts
      // so the user knows which provider in the chain actually ran.
      if (json.warnings && json.warnings.length > 0) {
        for (const w of json.warnings.slice(0, 2)) toast(w, "info");
      }
      onRefresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function saveBrief() {
    setBusy("brief");
    try {
      const res = await fetch(`/api/discoveries/${opportunity.id}/brief`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ briefMarkdown: briefMd })
      });
      if (!res.ok) throw new Error("Save failed");
      toast("Brief saved", "success");
      setEditing(null);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function saveContent() {
    setBusy("content");
    try {
      const res = await fetch(`/api/discoveries/${opportunity.id}/content`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentMarkdown: contentMd })
      });
      const json = await res.json();
      if (!res.ok) throw new Error("Save failed");
      setQuality(json.quality);
      toast("Article saved", "success");
      setEditing(null);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function regenerateContent() {
    if (
      !window.confirm(
        "Regenerate will overwrite the stored draft. Continue?"
      )
    )
      return;
    setBusy("regen");
    try {
      const res = await fetch(`/api/discoveries/${opportunity.id}/content`, {
        method: "POST"
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Regen failed");
      setContentMd(json.contentMarkdown);
      setQuality(json.quality);
      toast(
        json.isTemplate ? "Template overwrite — fill in [WRITE]s" : "Regenerated",
        "success"
      );
      onRefresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(contentMd);
      toast("Markdown copied", "success");
    } catch {
      toast("Could not access clipboard", "error");
    }
  }

  async function moveBack() {
    try {
      const res = await fetch(`/api/discoveries/${opportunity.id}/move-back`, {
        method: "POST"
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Move back failed");
      toast(`Moved back to ${json.kanbanColumn.replace("_", " ")}`, "success");
      onRefresh();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function deletePermanently() {
    if (
      !window.confirm(
        `Permanently delete "${opportunity.query}"? This can't be undone.`
      )
    )
      return;
    try {
      const res = await fetch(`/api/discoveries/${opportunity.id}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error("Delete failed");
      toast("Opportunity deleted", "success");
      onDeleted?.(opportunity.id);
      onClose();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  const tone = scoreTone(opportunity.score);
  const toneCls = SCORE_TONE_CLASSES[tone];
  const breakdown = opportunity.scoreBreakdown;

  // ── Shared PipelinePanel chassis ──
  // Derives all the chassis props (badges, score block, signals,
  // tabs) from the opportunity, then delegates to the shared
  // PipelinePanel. The tab CONTENT (Brief / Content / Quality) still
  // lives in the local BriefTab / ContentTab / QualityTab functions
  // below.
  const targetKw = (() => {
    const tk =
      opportunity.metrics &&
      typeof (opportunity.metrics as Record<string, unknown>)
        .targetKeyword === "string"
        ? ((opportunity.metrics as Record<string, unknown>)
            .targetKeyword as string)
        : "";
    return tk && tk.toLowerCase() !== opportunity.query.toLowerCase()
      ? tk
      : null;
  })();

  const badges: PanelHeaderBadge[] = [
    {
      label: TYPE_LABEL[opportunity.opportunityType],
      className: TYPE_BADGE_CLASS[opportunity.opportunityType]
    },
    {
      label: PRIORITY_LABEL[opportunity.priority],
      className: PRIORITY_BADGE_CLASS[opportunity.priority]
    },
    {
      label: SOURCE_LABEL[opportunity.source] || opportunity.source,
      className: cn(
        SOURCE_TONE[opportunity.source] === "info"
          ? "bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200"
          : SOURCE_TONE[opportunity.source] === "success"
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"
          : SOURCE_TONE[opportunity.source] === "warn"
          ? "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200"
          : SOURCE_TONE[opportunity.source] === "danger"
          ? "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200"
          : "bg-ink-100 text-ink-700 ring-1 ring-inset ring-ink-200",
        "uppercase tracking-wider"
      )
    }
  ];

  const signalsBlock = (
    <>
      {opportunity.trending ? (
        <span
          className={cn(
            "badge text-[10px] inline-flex items-center gap-1",
            TRENDING_BADGE_CLASS
          )}
        >
          <TrendingUp className="size-3" />
          Trending +
          {Math.round(
            ((opportunity.weeklyImpressions -
              opportunity.previousWeekImpressions) /
              Math.max(1, opportunity.previousWeekImpressions)) *
              100
          )}
          % WoW
        </span>
      ) : null}
      {opportunity.aiCitationGap ? (
        <span
          className={cn(
            "badge text-[10px] inline-flex items-center gap-1",
            AI_CITATION_BADGE_CLASS
          )}
        >
          <Sparkles className="size-3" />
          AI citation gap
        </span>
      ) : null}
    </>
  );

  const tabs: PanelTab[] = [
    {
      id: "brief",
      label: "Brief",
      indicator:
        Boolean(briefDataLocal) || briefMd.trim().length > 0 ? (
          <CheckCircle2 className="size-3 text-emerald-500" />
        ) : null,
      render: () => (
        <BriefTab
          opportunity={opportunity}
          briefData={briefDataLocal}
          briefMd={briefMd}
          setBriefMd={setBriefMd}
          editing={editing === "brief"}
          setEditing={(b) => setEditing(b ? "brief" : null)}
          busy={busy === "brief"}
          onGenerate={generateBrief}
          onSave={saveBrief}
          onGoContent={() => {
            setTab("content");
            if (!contentMd) void generateContent();
          }}
          hasBrief={Boolean(briefDataLocal) || briefMd.trim().length > 0}
        />
      )
    },
    {
      id: "content",
      label: "Content",
      indicator: contentMd.trim().length > 0 ? (
        <CheckCircle2 className="size-3 text-emerald-500" />
      ) : null,
      render: () => (
        <ContentTab
          opportunity={opportunity}
          contentMd={contentMd}
          setContentMd={setContentMd}
          editing={editing === "content"}
          setEditing={(b) => setEditing(b ? "content" : null)}
          busy={busy === "content" || busy === "regen"}
          onGenerate={generateContent}
          onRegenerate={regenerateContent}
          onSave={saveContent}
          onCopy={copyMarkdown}
          hasContent={contentMd.trim().length > 0}
          hasBrief={Boolean(briefDataLocal) || briefMd.trim().length > 0}
        />
      )
    },
    {
      id: "quality",
      label: "Quality",
      indicator: quality ? (
        <span
          className={cn(
            "size-1.5 rounded-full inline-block",
            quality.overall === "pass"
              ? "bg-emerald-500"
              : quality.overall === "warning"
              ? "bg-amber-500"
              : "bg-rose-500"
          )}
        />
      ) : null,
      render: () => <QualityTab quality={quality} />
    }
  ];

  const showMoveBack =
    opportunity.kanbanColumn !== "intake" &&
    opportunity.kanbanColumn !== "rejected";

  return (
    <PipelinePanel
      title={opportunity.query}
      subline={
        targetKw ? { label: "Target keyword", value: targetKw } : null
      }
      reason={opportunity.reason}
      badges={badges}
      score={{
        value: opportunity.score,
        label: "Priority",
        priorityLabel: opportunity.priority,
        bars: [
          {
            label: "Search demand",
            value: breakdown?.searchDemand ?? 0,
            max: 20
          },
          {
            label: "Trending velocity",
            value: breakdown?.trendingVelocity ?? 0,
            max: 15
          },
          {
            label: "Competitor gap",
            value: breakdown?.competitorGap ?? 0,
            max: 20
          },
          {
            label: "AI citation gap",
            value: breakdown?.aiCitationGap ?? 0,
            max: 20,
            tone: "aeo"
          },
          {
            label: "Conversion fit",
            value: breakdown?.conversionFit ?? 0,
            max: 15
          },
          {
            label: "Cannibalization clarity",
            value: breakdown?.cannibalizationClarity ?? 0,
            max: 10
          }
        ]
      }}
      signals={signalsBlock}
      tabs={tabs}
      activeTabId={tab}
      onTabChange={(id) => setTab(id as Tab)}
      onMoveBack={showMoveBack ? moveBack : undefined}
      onDelete={deletePermanently}
      onClose={onClose}
    />
  );
}

// Tone / inline Speedometer / inline ScoreBar / inline TabButton
// helpers below this point are no longer rendered (the shared
// PipelinePanel handles the chassis). Kept in the file as dead code
// rather than deleted in case a follow-up needs the visual reference.

// ── Priority speedometer ──
function Speedometer({
  score,
  tone,
  priority
}: {
  score: number;
  tone: "high" | "mid" | "low";
  priority: string;
}) {
  // Semi-circle gauge. Needle angle: 180° = score 100, 0° = score 0.
  const angle = -90 + (score / 100) * 180;
  const toneCls = SCORE_TONE_CLASSES[tone];
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-40 h-24">
        <svg viewBox="0 0 200 110" className="w-full h-full">
          {/* Background arc */}
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="#eef0f4"
            strokeWidth="12"
            strokeLinecap="round"
          />
          {/* Coloured arc segments (red → amber → green) */}
          <path
            d="M 20 100 A 80 80 0 0 1 73 30"
            fill="none"
            stroke="#fda4af"
            strokeWidth="12"
            strokeLinecap="round"
            opacity="0.6"
          />
          <path
            d="M 73 30 A 80 80 0 0 1 127 30"
            fill="none"
            stroke="#fcd34d"
            strokeWidth="12"
            strokeLinecap="round"
            opacity="0.6"
          />
          <path
            d="M 127 30 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="#6ee7b7"
            strokeWidth="12"
            strokeLinecap="round"
            opacity="0.6"
          />
          {/* Needle */}
          <g transform={`rotate(${angle} 100 100)`}>
            <line
              x1="100"
              y1="100"
              x2="100"
              y2="28"
              stroke="#13151c"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <circle cx="100" cy="100" r="5" fill="#13151c" />
          </g>
        </svg>
      </div>
      <div className={cn("text-3xl font-bold tabular-nums leading-none", toneCls.text)}>
        {score}
        <span className="text-base text-ink-400 font-normal"> / 100</span>
      </div>
      <div className="text-[10px] uppercase tracking-wider text-ink-500 mt-1">
        Priority {priority}
      </div>
    </div>
  );
}

function ScoreBar({
  label,
  value,
  max,
  aeo
}: {
  label: string;
  value: number;
  max: number;
  aeo?: boolean;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[11px] text-ink-600">{label}</span>
        <span className="text-[11px] font-semibold text-ink-900 tabular-nums">
          {value}
          <span className="text-ink-400 font-normal"> / {max}</span>
        </span>
      </div>
      <div className="h-1.5 bg-ink-100 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full",
            aeo ? "bg-[#4A4DC9]" : "bg-emerald-500"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-2 text-xs font-medium border-b-2 transition inline-flex items-center",
        active
          ? "border-ink-900 text-ink-900"
          : "border-transparent text-ink-500 hover:text-ink-900"
      )}
    >
      {children}
    </button>
  );
}

// ── Brief tab ──
function BriefTab({
  opportunity,
  briefData,
  briefMd,
  setBriefMd,
  editing,
  setEditing,
  busy,
  onGenerate,
  onSave,
  onGoContent,
  hasBrief
}: {
  opportunity: Opportunity;
  briefData: Opportunity["briefData"];
  briefMd: string;
  setBriefMd: (s: string) => void;
  editing: boolean;
  setEditing: (b: boolean) => void;
  busy: boolean;
  onGenerate: () => void;
  onSave: () => void;
  onGoContent: () => void;
  hasBrief: boolean;
}) {
  if (!hasBrief) {
    // The detail panel auto-fires brief generation on open, so this
    // state is typically the < 2s loading window. Show a skeleton, not
    // an empty CTA — the user shouldn't have to click "Generate" for
    // something that happens automatically.
    return (
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 text-xs text-ink-600">
          <Loader2 className="size-3.5 animate-spin" />
          {busy
            ? "Assembling brief from signals…"
            : "Brief will appear in a moment."}
        </div>
        <div className="space-y-2">
          <div className="h-3 bg-ink-100 rounded animate-pulse w-3/4" />
          <div className="h-3 bg-ink-100 rounded animate-pulse w-full" />
          <div className="h-3 bg-ink-100 rounded animate-pulse w-5/6" />
          <div className="h-3 bg-ink-100 rounded animate-pulse w-1/2" />
          <div className="h-12" />
          <div className="h-3 bg-ink-100 rounded animate-pulse w-2/3" />
          <div className="h-3 bg-ink-100 rounded animate-pulse w-full" />
          <div className="h-3 bg-ink-100 rounded animate-pulse w-4/5" />
        </div>
        {!busy ? (
          <div className="pt-2">
            <Button variant="secondary" onClick={onGenerate}>
              <Sparkles className="size-3.5" />
              Generate now
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  const brief = briefData;
  return (
    <div className="space-y-4">
      {/* Cannibalization warning — BEFORE the brief */}
      {brief?.cannibalization ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 text-xs">
              <div className="font-semibold text-amber-900 mb-1">
                Cannibalization risk — resolution: {brief.cannibalization.resolution}
              </div>
              <p className="text-amber-800 mb-2">
                {brief.cannibalization.resolutionReason}
              </p>
              <ul className="space-y-1">
                {brief.cannibalization.overlappingPages.map((p) => (
                  <li key={p.url}>
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-900 underline inline-flex items-center gap-1"
                    >
                      <ExternalLink className="size-3" />
                      {p.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {/* AI citation angle box (purple) */}
      {brief?.aiCitationAngle ? (
        <div
          className={cn("rounded-lg p-3", AI_CITATION_BOX_CLASS)}
        >
          <div className="flex items-start gap-2">
            <Sparkles className="size-4 shrink-0 mt-0.5" />
            <div className="flex-1 text-xs">
              <div className="font-semibold mb-1">AI citation angle</div>
              {brief.aiCitationAngle.competitorsCited.length > 0 ? (
                <p className="mb-2 opacity-90">
                  AI engines currently cite{" "}
                  <span className="font-mono">
                    {brief.aiCitationAngle.competitorsCited.join(", ")}
                  </span>{" "}
                  for this query — your domain isn't in the answer.
                </p>
              ) : null}
              <ul className="space-y-1 list-disc ml-4 opacity-90">
                {brief.aiCitationAngle.structuralAdvice.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {/* Brief body — markdown view */}
      <div className="border border-ink-200 rounded-lg">
        <div className="px-3 py-2 border-b border-ink-100 flex items-center justify-between">
          <span className="text-xs font-semibold text-ink-900">Brief</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" onClick={onGenerate} disabled={busy}>
              {busy ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <RefreshCw className="size-3" />
              )}
              Regenerate
            </Button>
            {editing ? (
              <Button variant="primary" onClick={onSave} disabled={busy}>
                <Save className="size-3" />
                Save
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <Edit2 className="size-3" />
                Edit
              </Button>
            )}
          </div>
        </div>
        <div className="p-3">
          {editing ? (
            <textarea
              value={briefMd}
              onChange={(e) => setBriefMd(e.target.value)}
              className="w-full min-h-[400px] font-mono text-xs p-3 border border-ink-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
          ) : (
            <div
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{
                __html: renderMarkdown(briefMd || "")
              }}
            />
          )}
        </div>
      </div>

      {/* Primary CTA */}
      <div className="flex justify-end">
        <Button variant="primary" onClick={onGoContent}>
          {opportunity.contentMarkdown ? "View content" : "Generate content"}
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

// ── Content tab ──
function ContentTab({
  opportunity,
  contentMd,
  setContentMd,
  editing,
  setEditing,
  busy,
  onGenerate,
  onRegenerate,
  onSave,
  onCopy,
  hasContent,
  hasBrief
}: {
  opportunity: Opportunity;
  contentMd: string;
  setContentMd: (s: string) => void;
  editing: boolean;
  setEditing: (b: boolean) => void;
  busy: boolean;
  onGenerate: () => void;
  onRegenerate: () => void;
  onSave: () => void;
  onCopy: () => void;
  hasContent: boolean;
  hasBrief: boolean;
}) {
  if (!hasBrief) {
    return (
      <div className="text-center py-12 text-sm text-ink-600">
        Generate the brief first.
      </div>
    );
  }
  if (!hasContent) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-ink-600 mb-4">
          Content uses the per-opportunity-type LLM configured in Settings →
          AI providers. If no key is available, you'll get a template you can
          fill in manually.
        </p>
        <Button variant="primary" onClick={onGenerate} disabled={busy}>
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          Generate content
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="border border-ink-200 rounded-lg">
        <div className="px-3 py-2 border-b border-ink-100 flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs font-semibold text-ink-900">Article</span>
          <div className="flex items-center gap-1 flex-wrap">
            <Button variant="ghost" onClick={onCopy}>
              <Copy className="size-3" />
              Copy
            </Button>
            <Button variant="ghost" onClick={onRegenerate} disabled={busy}>
              {busy ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <RefreshCw className="size-3" />
              )}
              Regenerate
            </Button>
            {editing ? (
              <Button variant="primary" onClick={onSave} disabled={busy}>
                <Save className="size-3" />
                Save
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <Edit2 className="size-3" />
                Edit
              </Button>
            )}
          </div>
        </div>
        <div className="p-3">
          {editing ? (
            <textarea
              value={contentMd}
              onChange={(e) => setContentMd(e.target.value)}
              className="w-full min-h-[480px] font-mono text-xs p-3 border border-ink-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
          ) : (
            <div
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{
                __html: renderMarkdown(contentMd || "")
              }}
            />
          )}
        </div>
      </div>
      <p className="text-xs text-ink-500 leading-relaxed">
        Reopening the content view always shows the stored draft.
        Regeneration overwrites it after confirmation.
      </p>
    </div>
  );
}

// ── Quality checks tab ──
function QualityTab({ quality }: { quality: QualityChecks | null }) {
  if (!quality) {
    return (
      <div className="text-sm text-ink-500 text-center py-12">
        Quality checks appear after content is generated.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <QualityCheckRow check={quality.directAnswerInP1} />
      <QualityCheckRow check={quality.comparisonTable} />
      <QualityCheckRow check={quality.faqSection} />
      <QualityCheckRow check={quality.cannibalizationAvoidance} />
      <QualityCheckRow check={quality.wordCountInRange} />
    </div>
  );
}

function QualityCheckRow({
  check
}: {
  check: { status: CheckStatus; label: string; detail?: string };
}) {
  return (
    <div className="border border-ink-200 rounded-lg p-3 flex items-start gap-2">
      {check.status === "pass" ? (
        <CheckCircle2 className="size-4 text-emerald-500 shrink-0 mt-0.5" />
      ) : check.status === "warning" ? (
        <AlertTriangle className="size-4 text-amber-500 shrink-0 mt-0.5" />
      ) : (
        <AlertCircle className="size-4 text-rose-500 shrink-0 mt-0.5" />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-ink-900">{check.label}</div>
        {check.detail ? (
          <div className="text-[11px] text-ink-600 mt-0.5">{check.detail}</div>
        ) : null}
      </div>
    </div>
  );
}
