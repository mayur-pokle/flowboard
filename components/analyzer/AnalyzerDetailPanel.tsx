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
  RefreshCw
} from "lucide-react";
import { toast } from "@/components/Toast";
import { Button } from "@/components/ui/Button";
import {
  PipelinePanel,
  type PanelHeaderBadge,
  type PanelTab
} from "@/components/pipeline/PipelinePanel";
import { renderMarkdown } from "@/lib/markdown-mini";
import { cn } from "@/lib/utils";
import type { AnalyzedTopic } from "./types";

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
    "overview" | "brief" | "enrichment" | "actions"
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
          "No LLM key configured — set GEMINI_API_KEY / OPENAI_API_KEY in env to enrich.",
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
          `Already promoted to ${destination === "discovery" ? "AI Discovery" : "AI Resources"}.`,
          "info"
        );
      } else {
        toast(
          `Promoted to ${destination === "discovery" ? "AI Discovery — Intake" : "AI Resources — Ideas"}.`,
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

  async function deleteTopic() {
    if (!window.confirm(`Delete "${topic.title}"? This can't be undone.`)) return;
    try {
      const res = await fetch(`/api/analyzer/${topic.id}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error("Delete failed");
      onDeleted(topic.id);
      onClose();
      toast("Topic deleted", "info");
    } catch (err) {
      toast((err as Error).message, "error");
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
        label: "→ AI Discovery",
        className:
          "bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200"
      });
    }
    if (topic.promotedToTaskId) {
      out.push({
        label: "→ AI Resources",
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
    {
      id: "enrichment",
      label: "Enrichment",
      indicator:
        enrichment && enrichment.provider !== "unavailable" ? (
          <CheckCircle2 className="size-3 text-emerald-500" />
        ) : null,
      render: () => renderEnrichment()
    },
    {
      id: "actions",
      label: "Actions",
      render: () => renderActions()
    }
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
    return (
      <div className="space-y-4">
        {/* Recommendation banner */}
        <div className={cn("rounded-lg border p-3", recTone.wrap)}>
          <div className="flex items-start gap-2">
            {recTone.icon}
            <div className="flex-1">
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
            </div>
          </div>
        </div>

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
            <ul className="text-xs space-y-1">
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

        {/* Alternate headlines */}
        <Section title="Alternate headlines">
          <ul className="text-xs space-y-1 list-disc ml-4 text-ink-700">
            {analysis.alternateHeadlines.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
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

  function renderEnrichment() {
    if (!enrichment) {
      return (
        <div className="text-center py-8">
          <p className="text-sm text-ink-600 mb-3">
            The deterministic analysis is done. Enrich with Gemini to add
            alternate headlines, competitor gap read, community signals,
            and AI citation insights.
          </p>
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
            No LLM provider available
          </div>
          <p>
            Set <code>GEMINI_API_KEY</code>, <code>OPENAI_API_KEY</code>,
            or <code>ANTHROPIC_API_KEY</code> in Vercel env and retry.
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
                <div className="text-[10px] uppercase tracking-wider text-ink-500 mt-2 mb-1">
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

  function renderActions() {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-ink-200 p-3">
          <div className="text-xs font-semibold text-ink-900 mb-1">
            Promote to a working surface
          </div>
          <p className="text-[11px] text-ink-600 mb-3">
            Send this analyzed topic to AI Discovery (Intake column) or
            AI Resources (Ideas column) once you're ready to commit
            production time.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={() => promote("discovery")}
              disabled={!canPromote || promoting !== null}
              loading={promoting === "discovery"}
            >
              <ArrowUpRight className="size-3.5" />
              Send to AI Discovery
            </Button>
            <Button
              variant="secondary"
              onClick={() => promote("resources")}
              disabled={!canPromote || promoting !== null}
              loading={promoting === "resources"}
            >
              <ArrowUpRight className="size-3.5" />
              Send to AI Resources
            </Button>
          </div>
          {topic.promotedToDiscoveryId ? (
            <div className="text-[11px] text-emerald-700 mt-2 inline-flex items-center gap-1">
              <CheckCircle2 className="size-3" />
              Already in AI Discovery — Intake.
            </div>
          ) : null}
          {topic.promotedToTaskId ? (
            <div className="text-[11px] text-emerald-700 mt-2 inline-flex items-center gap-1">
              <CheckCircle2 className="size-3" />
              Already in AI Resources — Ideas.
            </div>
          ) : null}
        </div>

        <div className="rounded-md border border-ink-200 p-3">
          <div className="text-xs font-semibold text-ink-900 mb-1">
            Move on the Kanban
          </div>
          <p className="text-[11px] text-ink-600 mb-3">
            Change the column this topic sits in.
          </p>
          <div className="flex flex-wrap gap-2">
            {(["draft", "analyzed", "approved", "archived"] as const).map(
              (c) => (
                <button
                  key={c}
                  onClick={async () => {
                    try {
                      const res = await fetch(`/api/analyzer/${topic.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ kanbanColumn: c })
                      });
                      if (!res.ok) throw new Error("Move failed");
                      toast(`Moved to ${c}`, "success");
                      onRefresh();
                    } catch (err) {
                      toast((err as Error).message, "error");
                    }
                  }}
                  className={cn(
                    "h-7 px-2 rounded-md text-xs font-medium transition ring-1 ring-inset",
                    topic.kanbanColumn === c
                      ? "bg-ink-900 text-white ring-ink-900"
                      : "bg-white text-ink-700 ring-ink-200 hover:bg-ink-50"
                  )}
                >
                  {c}
                </button>
              )
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
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
        setTab(id as "overview" | "brief" | "enrichment" | "actions")
      }
      onDelete={deleteTopic}
      onClose={onClose}
    />
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
      <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-2 font-semibold">
        {title}
      </div>
      {children}
    </div>
  );
}
