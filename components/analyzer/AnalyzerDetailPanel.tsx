"use client";

import { useState, useMemo } from "react";
import {
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  ArrowUpRight,
  RefreshCw,
  ArrowRight
} from "lucide-react";
import { toast } from "@/components/Toast";
import { Button } from "@/components/ui/Button";
import {
  PipelinePanel,
  type PanelHeaderBadge,
  type PanelTab
} from "@/components/pipeline/PipelinePanel";
import { renderMarkdown } from "@/lib/markdown-mini";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { LLMStepper } from "@/components/ui/LLMStepper";
import { ConfidenceTag } from "@/components/ui/ConfidenceTag";
import { cn } from "@/lib/utils";
import {
  COLUMN_LABEL,
  COLUMN_ORDER,
  type AnalyzedTopic,
  type AnalyzerColumn
} from "./types";

interface Props {
  topic: AnalyzedTopic;
  onClose: () => void;
  onRefresh: () => void;
  onDeleted: (id: string) => void;
}

export function AnalyzerDetailPanel({
  topic,
  onClose,
  onRefresh,
  onDeleted
}: Props) {
  const [tab, setTab] = useState<
    "overview" | "brief" | "draft" | "enrichment"
  >("overview");
  const [enriching, setEnriching] = useState(false);
  const [promoting, setPromoting] = useState<
    "discovery" | "resources" | null
  >(null);

  const analysis = topic.analysis;
  const enrichment = topic.enrichment;
  const canPromote = Boolean(analysis) && topic.kanbanColumn !== "archived";

  async function runEnrichment() {
    setEnriching(true);
    try {
      const res = await fetch(`/api/analyzer/${topic.id}/enrich`, {
        method: "POST"
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Enrichment failed");
      if (json.enrichment?.provider === "unavailable") {
        toast(
          "No AI provider configured. Add a key in Settings to enable enrichment.",
          "info"
        );
      } else {
        toast(
          `Enriched via ${json.enrichment.provider}`,
          "success"
        );
      }
      onRefresh();
      setTab("enrichment");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setEnriching(false);
    }
  }

  async function promote(destination: "discovery" | "resources") {
    setPromoting(destination);
    try {
      const res = await fetch(`/api/analyzer/${topic.id}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Promotion failed");
      if (json.alreadyPromoted) {
        toast(
          `Already promoted to ${destination === "discovery" ? "Opportunities" : "Content"}.`,
          "info"
        );
      } else {
        toast(
          `Promoted to ${destination === "discovery" ? "Opportunities — Intake" : "Content — Ideas"}.`,
          "success"
        );
      }
      onRefresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setPromoting(null);
    }
  }

  // Delete flow uses ConfirmModal instead of window.confirm — modal
  // provides focus trap, escape handling, and loading state during the
  // DELETE round-trip.
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  function requestDelete() {
    setConfirmDeleteOpen(true);
  }
  async function performDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/analyzer/${topic.id}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error("Delete failed");
      onDeleted(topic.id);
      setConfirmDeleteOpen(false);
      onClose();
      toast("Topic deleted", "info");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setDeleting(false);
    }
  }

  // Swap the topic's title to one of the analyzer's alternate headlines.
  // Fires a PATCH and refreshes the row so the score / brief render
  // updates against the new title on next open. We don't re-analyze
  // here — the strategist is choosing a headline, not asking for a
  // second opinion.
  const [swappingHeadline, setSwappingHeadline] = useState<number | null>(null);
  async function useHeadline(idx: number, headline: string) {
    if (headline === topic.title) return;
    setSwappingHeadline(idx);
    try {
      const res = await fetch(`/api/analyzer/${topic.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: headline })
      });
      if (!res.ok) throw new Error("Could not update title");
      toast("Title updated — re-analyze if you want a fresh score.", "success");
      onRefresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSwappingHeadline(null);
    }
  }

  // ── Panel chassis props ──

  const badges: PanelHeaderBadge[] = useMemo(() => {
    if (!analysis) return [];
    const out: PanelHeaderBadge[] = [
      {
        label: analysis.playbookLabel,
        className:
          "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200"
      },
      {
        label: analysis.priorityTier.code,
        className:
          analysis.priorityTier.code === "P0" ||
          analysis.priorityTier.code === "P1"
            ? "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200"
            : "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200"
      },
      {
        label: analysis.intent,
        className: "bg-ink-100 text-ink-700 ring-1 ring-inset ring-ink-200"
      }
    ];
    if (analysis.aiCitationGap) {
      out.push({
        label: "AI citation gap",
        className: "bg-[#EEEEFD] text-[#4A4DC9] ring-1 ring-inset ring-[#D5D6FF]"
      });
    }
    if (topic.promotedToDiscoveryId) {
      out.push({
        label: "→ Opportunities",
        className:
          "bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200"
      });
    }
    if (topic.promotedToTaskId) {
      out.push({
        label: "→ Content",
        className:
          "bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200"
      });
    }
    return out;
  }, [analysis, topic.promotedToDiscoveryId, topic.promotedToTaskId]);

  const scoreBlock = analysis
    ? {
        value: Math.round(analysis.score * 10) / 10,
        label: "Priority",
        tierLabel: analysis.priorityTier.label,
        subtext: `Backend score: ${analysis.score.toFixed(1)}`,
        headline: "Analyzer priority speedometer",
        bars: [
          {
            label: "AI Query Volume",
            value: analysis.scoreBreakdown.searchDemand,
            max: 20,
            showTenScale: true,
            description:
              "How often this topic is likely asked in AI systems."
          },
          {
            label: "Answer Likelihood",
            value: analysis.scoreBreakdown.trendingVelocity,
            max: 15,
            showTenScale: true,
            description:
              "Chance AI returns a synthesized answer instead of links."
          },
          {
            label: "Commercial / Solution Intent",
            value: analysis.scoreBreakdown.competitorGap,
            max: 20,
            showTenScale: true,
            description:
              "How close this query is to solution evaluation and purchase."
          },
          {
            label: "AI Citation Gap",
            value: Math.min(15, analysis.scoreBreakdown.aiCitationGap),
            max: 15,
            tone: "aeo" as const,
            showTenScale: true,
            description:
              "How often competitors are cited while your brand is not."
          },
          {
            label: "Authority Leverage",
            value: analysis.scoreBreakdown.conversionFit,
            max: 15,
            showTenScale: true,
            description:
              "How much existing authority can support ranking/citation."
          },
          {
            label: "Content Coverage Gap",
            value:
              analysis.scoreBreakdown.cannibalizationClarity <= 10
                ? Math.round(
                    (analysis.scoreBreakdown.cannibalizationClarity / 10) * 15
                  )
                : Math.min(
                    15,
                    analysis.scoreBreakdown.cannibalizationClarity
                  ),
            max: 15,
            showTenScale: true,
            description:
              "How much useful structured content is missing today."
          }
        ]
      }
    : null;

  // Draft tab only appears when a post body was submitted. Its status
  // dot mirrors the overall quality check verdict — green pass, amber
  // warning, red fail — so the strategist sees the state before
  // opening the tab.
  const hasDraft = Boolean(topic.postBody && topic.postBody.trim());
  const draftQuality = analysis?.draftQuality ?? null;
  const draftDotColor = draftQuality
    ? draftQuality.checks.overall === "pass"
      ? "bg-emerald-500"
      : draftQuality.checks.overall === "warning"
      ? "bg-amber-500"
      : "bg-rose-500"
    : null;

  const tabs: PanelTab[] = [
    {
      id: "overview",
      label: "Overview",
      render: () => renderOverview()
    },
    {
      id: "brief",
      label: "Brief",
      indicator: analysis?.brief ? (
        <CheckCircle2 className="size-3 text-emerald-500" />
      ) : null,
      render: () => renderBrief()
    },
    ...(hasDraft
      ? [
          {
            id: "draft",
            label: "Draft",
            indicator: draftDotColor ? (
              <span
                className={cn(
                  "size-1.5 rounded-full inline-block",
                  draftDotColor
                )}
              />
            ) : null,
            render: () => renderDraft()
          } as PanelTab
        ]
      : []),
    {
      id: "enrichment",
      label: "Enrichment",
      indicator:
        enrichment && enrichment.provider !== "unavailable" ? (
          <CheckCircle2 className="size-3 text-emerald-500" />
        ) : null,
      render: () => renderEnrichment()
    }
    // Actions tab removed — promote buttons now live inline on the
    // Overview verdict banner, and column-move lives in the header
    // dropdown (rendered separately below via `columnMenu`).
  ];

  function renderOverview() {
    if (!analysis) {
      return (
        <div className="text-sm text-ink-500 py-8 text-center">
          Analysis is not yet available for this topic.
        </div>
      );
    }
    const rec = analysis.recommendation;
    const recTone =
      rec.verdict === "proceed"
        ? {
            wrap: "bg-emerald-50 border-emerald-200 text-emerald-900",
            icon: <CheckCircle2 className="size-4 text-emerald-600" />
          }
        : rec.verdict === "refine"
        ? {
            wrap: "bg-amber-50 border-amber-200 text-amber-900",
            icon: <AlertTriangle className="size-4 text-amber-600" />
          }
        : {
            wrap: "bg-rose-50 border-rose-200 text-rose-900",
            icon: <AlertCircle className="size-4 text-rose-600" />
          };
    // Inline action controls on the verdict banner — closes the
    // workflow loop so the strategist can promote without hunting
    // through tabs. "Reconsider" doesn't get action buttons; the
    // recommendation is to not promote.
    const showInlineActions =
      canPromote && (rec.verdict === "proceed" || rec.verdict === "refine");
    const inlineActionTone =
      rec.verdict === "proceed"
        ? {
            primary:
              "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600",
            secondary:
              "bg-white hover:bg-emerald-50 text-emerald-800 border-emerald-300"
          }
        : {
            primary:
              "bg-amber-600 hover:bg-amber-700 text-white border-amber-600",
            secondary:
              "bg-white hover:bg-amber-50 text-amber-800 border-amber-300"
          };

    // Draft-quality inline strip — surfaces failed checks on Overview so
    // the strategist doesn't miss them just because the Draft tab isn't
    // active.
    const draftStrip = draftQuality
      ? (() => {
          const rows: {
            check: {
              status: "pass" | "warning" | "fail";
              label: string;
            };
          }[] = [
            { check: draftQuality.checks.directAnswerInP1 },
            { check: draftQuality.checks.comparisonTable },
            { check: draftQuality.checks.faqSection },
            { check: draftQuality.checks.cannibalizationAvoidance },
            { check: draftQuality.checks.wordCountInRange }
          ];
          const passing = rows.filter((r) => r.check.status === "pass").length;
          const failed = rows.filter((r) => r.check.status === "fail");
          const overall = draftQuality.checks.overall;
          const tone =
            overall === "pass"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : overall === "warning"
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-rose-200 bg-rose-50 text-rose-900";
          const icon =
            overall === "pass" ? (
              <CheckCircle2 className="size-3.5 text-emerald-600" />
            ) : overall === "warning" ? (
              <AlertTriangle className="size-3.5 text-amber-600" />
            ) : (
              <AlertCircle className="size-3.5 text-rose-600" />
            );
          return { rows, passing, failed, tone, icon };
        })()
      : null;

    return (
      <div className="space-y-4">
        {/* Column-picker chip — replaces the old Actions tab's "Move on
            the Kanban" section. Sits at the top so column change is
            always one click away, no matter which tab is active later
            (the chip is Overview-only for now, but it's the most-used
            tab; can promote to the header later). */}
        <div className="flex items-center gap-2 flex-wrap text-[11px]">
          <span className="uppercase tracking-wider text-ink-500">
            Column
          </span>
          <div className="inline-flex items-center gap-1 rounded-md bg-ink-100 p-0.5">
            {COLUMN_ORDER.map((c) => {
              const isActive = topic.kanbanColumn === c;
              const isLoading = movingColumn === c;
              return (
                <button
                  key={c}
                  onClick={() => moveColumn(c)}
                  disabled={movingColumn !== null}
                  aria-current={isActive ? "true" : undefined}
                  className={cn(
                    "h-6 px-2 rounded text-[11px] font-medium transition inline-flex items-center gap-1 focus-ring disabled:opacity-60",
                    isActive
                      ? "bg-white text-ink-900 shadow-sm"
                      : "text-ink-600 hover:text-ink-900"
                  )}
                >
                  {isLoading ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : null}
                  {COLUMN_LABEL[c]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Recommendation banner */}
        <div className={cn("rounded-lg border p-3", recTone.wrap)}>
          <div className="flex items-start gap-2">
            {recTone.icon}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wider mb-1">
                Recommendation · {rec.verdict}
              </div>
              <p className="text-xs leading-relaxed">{rec.summary}</p>
              {rec.nextSteps.length > 0 ? (
                <ul className="text-xs mt-2 space-y-1 list-disc ml-4">
                  {rec.nextSteps.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              ) : null}
              {showInlineActions ? (
                <div className="flex items-center gap-2 flex-wrap mt-3">
                  <button
                    onClick={() => promote("discovery")}
                    disabled={promoting !== null || Boolean(topic.promotedToDiscoveryId)}
                    className={cn(
                      "h-7 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1 border transition disabled:opacity-60 disabled:cursor-not-allowed",
                      inlineActionTone.primary
                    )}
                  >
                    {promoting === "discovery" ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <ArrowUpRight className="size-3" />
                    )}
                    {topic.promotedToDiscoveryId
                      ? "In Opportunities"
                      : "Send to Opportunities"}
                  </button>
                  <button
                    onClick={() => promote("resources")}
                    disabled={promoting !== null || Boolean(topic.promotedToTaskId)}
                    className={cn(
                      "h-7 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1 border transition disabled:opacity-60 disabled:cursor-not-allowed",
                      inlineActionTone.secondary
                    )}
                  >
                    {promoting === "resources" ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <ArrowUpRight className="size-3" />
                    )}
                    {topic.promotedToTaskId
                      ? "In Content"
                      : "Send to Content"}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Draft quality inline strip — only when a draft was submitted.
            Click jumps to the Draft tab for the full breakdown. */}
        {draftStrip ? (
          <button
            onClick={() => setTab("draft")}
            className={cn(
              "w-full text-left rounded-lg border p-3 flex items-start gap-2 transition hover:shadow-sm",
              draftStrip.tone
            )}
          >
            {draftStrip.icon}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <div className="text-xs font-semibold">
                  Draft quality · {draftStrip.passing}/5 checks passing
                </div>
                <div className="text-[10px] uppercase tracking-wider inline-flex items-center gap-0.5 opacity-80">
                  Open Draft
                  <ArrowRight className="size-3" />
                </div>
              </div>
              {draftStrip.failed.length > 0 ? (
                <div className="text-[11px] mt-1 leading-relaxed">
                  Failing:{" "}
                  {draftStrip.failed.map((r, i) => (
                    <span key={i}>
                      {i > 0 ? ", " : ""}
                      <span className="font-medium">{r.check.label}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] mt-1 opacity-80">
                  All quality signals look clean.
                </div>
              )}
            </div>
          </button>
        ) : null}

        {/* Cannibalization */}
        <Section title="Cannibalization risk">
          <div className="mb-2 text-xs">
            <span
              className={cn(
                "badge",
                analysis.cannibalization.verdict === "clear"
                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"
                  : analysis.cannibalization.verdict === "review"
                  ? "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200"
                  : "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200"
              )}
            >
              {analysis.cannibalization.verdict}
            </span>
            <span className="ml-2 text-ink-600">
              {analysis.cannibalization.reason}
            </span>
          </div>
          {analysis.cannibalization.matches.length > 0 ? (
            <ul className="space-y-2">
              {analysis.cannibalization.matches.map((m) => (
                <li
                  key={m.url}
                  className="text-xs border border-ink-200 rounded-md p-2"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={cn(
                        "badge text-[10px]",
                        m.severity === "high"
                          ? "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200"
                          : m.severity === "medium"
                          ? "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200"
                          : "bg-ink-100 text-ink-700 ring-1 ring-inset ring-ink-200"
                      )}
                    >
                      {m.severity}
                    </span>
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-700 hover:underline inline-flex items-center gap-1 truncate"
                    >
                      <ExternalLink className="size-3" />
                      {m.title}
                    </a>
                  </div>
                  <div className="text-ink-600">{m.reason}</div>
                </li>
              ))}
            </ul>
          ) : null}
        </Section>

        {/* Competitor coverage */}
        <Section title="Competitor coverage">
          <p className="text-xs text-ink-700 mb-2">
            {analysis.competitorCoverage.ownershipAngle}
          </p>
          {analysis.competitorCoverage.likelyCoveredBy.length > 0 ? (
            <ul className="text-xs space-y-1 mb-3">
              {analysis.competitorCoverage.likelyCoveredBy.map((c) => (
                <li key={c.url}>
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-700 hover:underline inline-flex items-center gap-1"
                  >
                    <ExternalLink className="size-3" />
                    {c.name || c.url}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}

          {/* Coverage links — up to 8 direct search / article URLs
              that surface real competitor articles on this topic.
              When Gemini enrichment has run, its known-article URLs
              take pride of place; otherwise the deterministic
              search-URL candidates render. Both kinds are honest —
              the search links are guaranteed to work, the AI-suggested
              article links are labeled so the strategist verifies. */}
          {enrichment?.articleLinks && enrichment.articleLinks.length > 0 ? (
            <div className="rounded-md border border-brand-200 bg-brand-50/40 p-3 mb-2">
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <div className="text-[11px] font-semibold text-brand-900 inline-flex items-center gap-1">
                  <Sparkles className="size-3" aria-hidden />
                  Articles covering this topic
                </div>
                <ConfidenceTag level="ai-suggested" />
              </div>
              <ul className="space-y-1.5">
                {enrichment.articleLinks.slice(0, 8).map((a, i) => (
                  <li key={i} className="text-xs">
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-700 hover:underline inline-flex items-start gap-1 leading-snug"
                    >
                      <ExternalLink className="size-3 mt-0.5 shrink-0" />
                      <span>
                        <span className="font-medium">{a.title}</span>
                        {a.publisher ? (
                          <span className="text-ink-500 font-normal ml-1">
                            · {a.publisher}
                          </span>
                        ) : null}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {analysis.competitorCoverage.candidateLinks.length > 0 ? (
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                <div className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">
                  {enrichment?.articleLinks && enrichment.articleLinks.length > 0
                    ? "More — search competitor sites"
                    : "Search competitor sites for this topic"}
                </div>
                <ConfidenceTag level="verified" label="Search URLs" />
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {analysis.competitorCoverage.candidateLinks
                  .slice(0, 8)
                  .map((l, i) => (
                    <li key={i}>
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          "text-[11px] rounded-md px-2 py-1.5 border inline-flex items-center gap-1.5 truncate w-full transition",
                          l.kind === "site-search"
                            ? "border-ink-200 bg-white hover:bg-ink-50 text-ink-700"
                            : "border-brand-200 bg-brand-50/40 hover:bg-brand-50 text-brand-800"
                        )}
                      >
                        <ExternalLink className="size-3 shrink-0" />
                        <span className="truncate">{l.label}</span>
                      </a>
                    </li>
                  ))}
              </ul>
              {!enrichment?.articleLinks ||
              enrichment.articleLinks.length === 0 ? (
                <div className="text-[10px] text-ink-500 mt-1.5">
                  Tip: run <strong>Enrich with Gemini</strong> in the
                  Enrichment tab to see actual article URLs Gemini knows
                  about.
                </div>
              ) : null}
            </div>
          ) : null}
        </Section>

        {/* AEO angle */}
        {analysis.aeoAngle ? (
          <Section title="AI citation angle">
            <p className="text-xs text-ink-700 mb-2">
              {analysis.aeoAngle.citationWorthy
                ? "This topic is citation-worthy for AI engines."
                : "AI citation upside is modest — invest more if it fits the AEO playbook."}
            </p>
            <ul className="text-xs space-y-1 list-disc ml-4 text-ink-700">
              {analysis.aeoAngle.structuralAdvice.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
            <div className="mt-2 rounded-md bg-[#F5F5FE] ring-1 ring-inset ring-[#D5D6FF] p-2 text-xs text-[#4A4DC9]">
              <div className="text-[10px] uppercase tracking-wider mb-1">
                Example opening paragraph
              </div>
              {analysis.aeoAngle.exampleOpeningParagraph}
            </div>
          </Section>
        ) : null}

        {/* Alternate headlines — each row has a "Use this" click that
            swaps the topic's title. Cheap, satisfying interaction that
            makes the suggestions actually usable. */}
        <Section title="Alternate headlines">
          <ul className="space-y-1.5">
            {analysis.alternateHeadlines.map((h, i) => {
              const isCurrent = h === topic.title;
              return (
                <li
                  key={i}
                  className="text-xs border border-ink-200 rounded-md p-2 flex items-start gap-2 group"
                >
                  <span className="flex-1 min-w-0 text-ink-800 leading-snug">
                    {h}
                    {isCurrent ? (
                      <span className="ml-2 text-[10px] text-emerald-700 inline-flex items-center gap-0.5">
                        <CheckCircle2 className="size-3" />
                        Current title
                      </span>
                    ) : null}
                  </span>
                  {!isCurrent ? (
                    <button
                      onClick={() => useHeadline(i, h)}
                      disabled={swappingHeadline !== null}
                      className="text-[10px] font-medium text-brand-700 hover:text-brand-900 hover:bg-brand-50 rounded px-1.5 py-0.5 inline-flex items-center gap-0.5 shrink-0 disabled:opacity-50"
                    >
                      {swappingHeadline === i ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : null}
                      Use this
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Section>

        {topic.notes ? (
          <Section title="Your notes">
            <p className="text-xs text-ink-700 whitespace-pre-wrap">
              {topic.notes}
            </p>
          </Section>
        ) : null}
      </div>
    );
  }

  function renderBrief() {
    if (!analysis) {
      return (
        <div className="text-sm text-ink-500 py-8 text-center">
          Analysis is not yet available.
        </div>
      );
    }
    return (
      <div
        className="prose prose-sm max-w-none"
        dangerouslySetInnerHTML={{
          __html: renderMarkdown(analysis.briefMarkdown || "")
        }}
      />
    );
  }

  function renderDraft() {
    if (!topic.postBody || !draftQuality) {
      return (
        <div className="text-sm text-ink-500 py-8 text-center">
          No draft submitted with this topic.
        </div>
      );
    }
    const overall = draftQuality.checks.overall;
    const overallTone =
      overall === "pass"
        ? "bg-emerald-50 border-emerald-200 text-emerald-900"
        : overall === "warning"
        ? "bg-amber-50 border-amber-200 text-amber-900"
        : "bg-rose-50 border-rose-200 text-rose-900";
    return (
      <div className="space-y-4">
        {/* Overall verdict */}
        <div className={cn("rounded-lg border p-3", overallTone)}>
          <div className="text-xs font-semibold uppercase tracking-wider mb-1">
            Draft check · {overall}
          </div>
          <p className="text-xs leading-relaxed">{draftQuality.summary}</p>
        </div>

        {/* Individual checks */}
        <Section title="Quality signals">
          <ul className="space-y-2">
            <QualityRow check={draftQuality.checks.directAnswerInP1} />
            <QualityRow check={draftQuality.checks.comparisonTable} />
            <QualityRow check={draftQuality.checks.faqSection} />
            <QualityRow check={draftQuality.checks.cannibalizationAvoidance} />
            <QualityRow check={draftQuality.checks.wordCountInRange} />
          </ul>
        </Section>

        {/* H2 outline */}
        {draftQuality.h2Outline.length > 0 ? (
          <Section title="Draft outline">
            <ol className="text-xs space-y-1 list-decimal ml-4 text-ink-700">
              {draftQuality.h2Outline.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ol>
          </Section>
        ) : null}

        {/* Body preview */}
        <Section title="Draft preview">
          <div
            className="prose prose-sm max-w-none text-ink-800 border border-ink-200 rounded-md p-3 bg-ink-50/40 max-h-[420px] overflow-auto scrollbar-thin"
            dangerouslySetInnerHTML={{
              __html: renderMarkdown(topic.postBody)
            }}
          />
        </Section>
      </div>
    );
  }

  function renderEnrichment() {
    if (!enrichment) {
      return (
        <div className="text-center py-8">
          <p className="text-sm text-ink-600 mb-3">
            The deterministic analysis is done. Enrich with Gemini to add
            alternate headlines, competitor gap read, community signals,
            and AI citation insights.
          </p>
          {enriching ? (
            <div className="mb-3 text-left">
              <LLMStepper
                title="Enriching this topic with Gemini"
                steps={[
                  "Sharpening the target keyword…",
                  "Searching for competitor articles on this topic…",
                  "Reading community + AI-engine phrasings…",
                  "Extracting citation-worthy angles…",
                  "Composing the enrichment payload…"
                ]}
                tone="violet"
                ariaLabel="Enrichment in progress"
              />
            </div>
          ) : null}
          <Button
            variant="primary"
            onClick={runEnrichment}
            disabled={enriching}
          >
            {enriching ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            {enriching ? "Enriching…" : "Enrich with Gemini"}
          </Button>
        </div>
      );
    }
    if (enrichment.provider === "unavailable") {
      return (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <div className="font-semibold mb-1">
            No AI provider available
          </div>
          <p>
            Connect Gemini, OpenAI, or Anthropic in{" "}
            <a
              href="/settings/api"
              className="underline font-medium hover:text-amber-950"
            >
              Settings
            </a>
            {" "}and try again.
          </p>
          <div className="mt-3">
            <Button
              variant="secondary"
              onClick={runEnrichment}
              disabled={enriching}
            >
              <RefreshCw className="size-3.5" />
              Retry
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between text-[11px] text-ink-500">
          <span>Enriched via {enrichment.provider}</span>
          <button
            onClick={runEnrichment}
            disabled={enriching}
            className="inline-flex items-center gap-1 text-ink-600 hover:text-ink-900"
          >
            <RefreshCw className="size-3" />
            Re-run
          </button>
        </div>

        {enrichment.alternateHeadlines.length > 0 ? (
          <Section title="Alternate headlines">
            <ul className="text-xs space-y-1 list-disc ml-4 text-ink-700">
              {enrichment.alternateHeadlines.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          </Section>
        ) : null}

        {enrichment.competitorSummary ? (
          <Section title="Competitor coverage read">
            <p className="text-xs text-ink-700 leading-relaxed">
              {enrichment.competitorSummary}
            </p>
            {enrichment.competitorGaps.length > 0 ? (
              <>
                <div className="text-[11px] uppercase tracking-wider text-ink-700 mt-3 mb-1.5 font-semibold">
                  Gaps we can own
                </div>
                <ul className="text-xs space-y-1 list-disc ml-4 text-ink-700">
                  {enrichment.competitorGaps.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </Section>
        ) : null}

        {enrichment.articleLinks && enrichment.articleLinks.length > 0 ? (
          <Section title="Articles covering this topic">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <ConfidenceTag level="ai-suggested" />
              <span className="text-[10px] text-ink-500">
                Sourced from Gemini&apos;s training knowledge, not a live
                crawl. Verify each link before citing.
              </span>
            </div>
            <ul className="space-y-1.5">
              {enrichment.articleLinks.slice(0, 8).map((a, i) => (
                <li key={i} className="text-xs">
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-700 hover:underline inline-flex items-start gap-1 leading-snug"
                  >
                    <ExternalLink className="size-3 mt-0.5 shrink-0" />
                    <span>
                      <span className="font-medium">{a.title}</span>
                      {a.publisher ? (
                        <span className="text-ink-500 font-normal ml-1">
                          · {a.publisher}
                        </span>
                      ) : null}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {enrichment.communityAngles.length > 0 ? (
          <Section title="Community + AI-engine phrasings">
            <ul className="text-xs space-y-1 list-disc ml-4 text-ink-700">
              {enrichment.communityAngles.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </Section>
        ) : null}

        {enrichment.aiCitationInsights.length > 0 ? (
          <Section title="AI citation insights">
            <ul className="text-xs space-y-1 list-disc ml-4 text-ink-700">
              {enrichment.aiCitationInsights.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </Section>
        ) : null}

        {enrichment.warnings.length > 0 ? (
          <div className="text-[11px] text-ink-500">
            {enrichment.warnings.map((w, i) => (
              <div key={i}>· {w}</div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  // Column-move helper — used by the header dropdown. Replaces the old
  // Actions tab. Firing a PATCH updates the row; parent refreshes.
  const [movingColumn, setMovingColumn] = useState<AnalyzerColumn | null>(
    null
  );
  async function moveColumn(next: AnalyzerColumn) {
    if (next === topic.kanbanColumn) return;
    setMovingColumn(next);
    try {
      const res = await fetch(`/api/analyzer/${topic.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kanbanColumn: next })
      });
      if (!res.ok) throw new Error("Move failed");
      toast(`Moved to ${COLUMN_LABEL[next]}`, "success");
      onRefresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setMovingColumn(null);
    }
  }

  return (
    <>
    <PipelinePanel
      title={topic.title}
      subline={
        topic.targetKeyword
          ? { label: "Target keyword", value: topic.targetKeyword }
          : null
      }
      reason={analysis?.recommendation.summary || null}
      badges={badges}
      score={scoreBlock}
      tabs={tabs}
      activeTabId={tab}
      onTabChange={(id) =>
        setTab(
          id as "overview" | "brief" | "draft" | "enrichment"
        )
      }
      onDelete={requestDelete}
      onClose={onClose}
    />
    <ConfirmModal
      open={confirmDeleteOpen}
      title="Delete this topic?"
      message="This will permanently remove the analysis, brief, any enrichment, and draft body attached to this topic. Promoted copies in Opportunities or Content are not affected."
      preview={topic.title}
      confirmLabel="Delete permanently"
      tone="danger"
      loading={deleting}
      onConfirm={performDelete}
      onCancel={() => (deleting ? null : setConfirmDeleteOpen(false))}
    />
  </>
  );
}

function Section({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      {/* Section headings on Overview + Enrichment tabs — larger and
          darker so they anchor each block clearly. Uses ink-900 for
          the darkest tone in the palette and text-sm (14px) sizing
          which stands out against the panel's 12px body copy. */}
      <h3 className="text-sm font-semibold text-ink-900 mb-2 tracking-tight">
        {title}
      </h3>
      {children}
    </div>
  );
}

// Renders one row of the draft quality check panel. Same pattern as
// the Discovery panel's QualityCheckRow, kept local so the analyzer
// doesn't reach into another surface's components.
function QualityRow({
  check
}: {
  check: {
    status: "pass" | "warning" | "fail";
    label: string;
    detail?: string;
  };
}) {
  return (
    <li className="border border-ink-200 rounded-md p-2 flex items-start gap-2">
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
    </li>
  );
}
