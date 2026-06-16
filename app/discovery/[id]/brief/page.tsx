"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  Sparkles,
  RefreshCw,
  ArrowRight,
  Edit2,
  Save,
  ExternalLink,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/components/Toast";
import { Breadcrumb } from "@/components/discovery/Breadcrumb";
import {
  scoreTone,
  SCORE_TONE_CLASSES,
  SOURCE_LABEL,
  SOURCE_TONE,
  INTENT_LABEL,
  INTENT_BADGE_CLASS,
  AI_CITATION_BOX_CLASS
} from "@/components/discovery/tokens";
import { renderMarkdown } from "@/lib/markdown-mini";
import type { Intent, ScoreBreakdown } from "@/lib/opportunity-classifier";
import { cn } from "@/lib/utils";

interface Opp {
  id: string;
  source: string;
  query: string;
  url: string | null;
  metrics: Record<string, number | null> | null;
  score: number;
  scoreBreakdown: ScoreBreakdown | null;
  intent: Intent | null;
  aiCitationGap: boolean;
  status: string;
  reason: string | null;
  briefMarkdown: string | null;
  briefGeneratedAt: string | null;
  contentGeneratedAt: string | null;
  linkedTaskId: string | null;
}

interface BriefResponse {
  briefMarkdown: string;
  briefGeneratedAt: string;
  cannibalization: Array<{
    url: string;
    title: string;
    targetKeyword?: string;
  }>;
  related: Array<{
    url: string;
    title: string;
    targetKeyword?: string;
  }>;
}

export default function BriefPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [opp, setOpp] = useState<Opp | null>(null);
  const [loading, setLoading] = useState(true);
  const [briefMarkdown, setBriefMarkdown] = useState("");
  const [editing, setEditing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cannibalization, setCannibalization] = useState<
    BriefResponse["cannibalization"]
  >([]);
  const [related, setRelated] = useState<BriefResponse["related"]>([]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/discoveries/${id}`);
      if (!res.ok) throw new Error("Could not load opportunity");
      const json = await res.json();
      setOpp(json.opportunity);
      setBriefMarkdown(json.opportunity.briefMarkdown || "");
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

  // First visit + no brief yet → auto-generate so the writer doesn't
  // have to click a button just to see something.
  useEffect(() => {
    if (!loading && opp && !opp.briefMarkdown && !generating) {
      void generateBrief();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, opp?.id]);

  async function generateBrief() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/discoveries/${id}/brief`, {
        method: "POST"
      });
      const json: BriefResponse & { ok: boolean; error?: string } =
        await res.json();
      if (!res.ok) throw new Error(json.error || "Could not generate brief");
      setBriefMarkdown(json.briefMarkdown);
      setCannibalization(json.cannibalization || []);
      setRelated(json.related || []);
      // Refresh opp object so the breadcrumb / status reflects "briefed".
      await load();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setGenerating(false);
    }
  }

  async function saveBrief() {
    setSaving(true);
    try {
      const res = await fetch(`/api/discoveries/${id}/brief`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ briefMarkdown })
      });
      if (!res.ok) throw new Error("Save failed");
      toast("Brief saved", "success");
      setEditing(false);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  const tone = useMemo(
    () => (opp ? scoreTone(opp.score) : "mid"),
    [opp]
  );
  const toneCls = SCORE_TONE_CLASSES[tone];

  if (loading || !opp) {
    return (
      <div className="flex-1 grid place-items-center text-sm text-ink-500">
        Loading brief…
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col">
      {/* Header */}
      <div className="px-8 py-4 border-b border-ink-200 bg-white shrink-0">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="text-xs text-ink-500 mb-1">Brief</div>
            <h1 className="text-xl font-bold text-ink-900 leading-tight font-mono truncate">
              {opp.query}
            </h1>
          </div>
          <Breadcrumb
            current="brief"
            opportunityId={opp.id}
            query={opp.query}
          />
        </div>
      </div>

      {/* Body: two columns */}
      <div className="flex-1 min-h-0 overflow-auto scrollbar-thin">
        <div className="max-w-6xl mx-auto px-8 py-6 grid grid-cols-12 gap-6">
          {/* LEFT — writer column */}
          <div className="col-span-12 lg:col-span-8 space-y-4">
            {/* Cannibalization warning — BEFORE the CTA. Damage from
                publishing cannibalizing content is hard to undo. */}
            {cannibalization.length > 0 ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="size-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <h2 className="text-sm font-semibold text-amber-900 mb-1">
                      Cannibalization risk
                    </h2>
                    <p className="text-xs text-amber-800 mb-2">
                      These published pages already target overlapping intent.
                      Update them instead, or differentiate this piece
                      clearly before generating content.
                    </p>
                    <ul className="space-y-1">
                      {cannibalization.slice(0, 5).map((c) => (
                        <li key={c.url} className="text-xs">
                          <a
                            href={c.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-amber-900 underline inline-flex items-center gap-1"
                          >
                            <ExternalLink className="size-3" />
                            {c.title}
                          </a>
                          {c.targetKeyword ? (
                            <span className="ml-2 font-mono text-amber-700">
                              {c.targetKeyword}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ) : null}

            {/* AI citation angle box — purple, mirrors the badge color. */}
            {opp.aiCitationGap ? (
              <div
                className={cn(
                  "rounded-xl p-4",
                  AI_CITATION_BOX_CLASS
                )}
              >
                <div className="flex items-start gap-3">
                  <Sparkles className="size-5 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <h2 className="text-sm font-semibold mb-1">
                      AI citation angle
                    </h2>
                    <p className="text-xs mb-2 opacity-90">
                      This query is the shape AI engines (Perplexity, AI
                      Overviews, ChatGPT) answer directly. To earn citations:
                    </p>
                    <ul className="text-xs space-y-1 list-disc ml-5 opacity-90">
                      <li>
                        Lead with a direct answer in the first 2 paragraphs.
                      </li>
                      <li>
                        Add a summary box at the top with the headline answer.
                      </li>
                      <li>
                        Cite specific numbers, not generic claims.
                      </li>
                      <li>
                        Use unambiguous H2s that match follow-up questions.
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Brief markdown — edit / preview */}
            <div className="card p-0 overflow-hidden">
              <div className="px-4 py-3 border-b border-ink-100 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-ink-900">
                  Writer's brief
                </h2>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => void generateBrief()}
                    disabled={generating}
                  >
                    {generating ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="size-3.5" />
                    )}
                    Regenerate
                  </Button>
                  {editing ? (
                    <Button
                      variant="primary"
                      onClick={() => void saveBrief()}
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
                </div>
              </div>
              <div className="p-4">
                {generating ? (
                  <div className="text-sm text-ink-500 inline-flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    Assembling brief from signals…
                  </div>
                ) : editing ? (
                  <textarea
                    value={briefMarkdown}
                    onChange={(e) => setBriefMarkdown(e.target.value)}
                    className="w-full min-h-[500px] font-mono text-xs p-3 border border-ink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-200"
                  />
                ) : (
                  <div
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{
                      __html: renderMarkdown(briefMarkdown || "")
                    }}
                  />
                )}
              </div>
            </div>

            {/* Primary CTA — advances the funnel */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="primary"
                onClick={() =>
                  router.push(`/discovery/${opp.id}/content`)
                }
                disabled={!briefMarkdown.trim()}
              >
                Generate content
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>

          {/* RIGHT — strategist sidebar */}
          <aside className="col-span-12 lg:col-span-4 space-y-4">
            {/* Score block — key numbers at a glance */}
            <div className="card p-4">
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="text-xs uppercase tracking-wider text-ink-500">
                  Opportunity score
                </h3>
                <span
                  className={cn(
                    "text-2xl font-bold tabular-nums",
                    toneCls.text
                  )}
                >
                  {opp.score}
                  <span className="text-sm text-ink-400 font-normal">
                    /100
                  </span>
                </span>
              </div>
              {opp.scoreBreakdown ? (
                <div className="space-y-2">
                  <SidebarBar
                    label="GSC velocity"
                    value={opp.scoreBreakdown.gscVelocity}
                    max={30}
                  />
                  <SidebarBar
                    label="Competitor gap"
                    value={opp.scoreBreakdown.competitorGap}
                    max={30}
                  />
                  <SidebarBar
                    label="AI citation gap"
                    value={opp.scoreBreakdown.aiCitationGap}
                    max={25}
                    aeo
                  />
                  <SidebarBar
                    label="Conversion fit"
                    value={opp.scoreBreakdown.conversions}
                    max={15}
                  />
                </div>
              ) : (
                <div className="text-xs text-ink-500">
                  Breakdown will appear after the next sync.
                </div>
              )}
            </div>

            {/* Signal badges */}
            <div className="card p-4">
              <h3 className="text-xs uppercase tracking-wider text-ink-500 mb-3">
                Signals
              </h3>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge
                  tone={SOURCE_TONE[opp.source] || "neutral"}
                  className="uppercase tracking-wider"
                >
                  {SOURCE_LABEL[opp.source] || opp.source}
                </Badge>
                {opp.intent ? (
                  <span
                    className={cn(
                      "badge",
                      INTENT_BADGE_CLASS[opp.intent]
                    )}
                  >
                    {INTENT_LABEL[opp.intent]}
                  </span>
                ) : null}
                {opp.aiCitationGap ? (
                  <span
                    className={cn(
                      "badge inline-flex items-center gap-1",
                      AI_CITATION_BOX_CLASS
                    )}
                  >
                    <Sparkles className="size-3" />
                    AI citation gap
                  </span>
                ) : null}
              </div>
              {opp.reason ? (
                <p className="text-xs text-ink-600 mt-3 leading-relaxed">
                  {opp.reason}
                </p>
              ) : null}
            </div>

            {/* Source metrics */}
            {opp.metrics ? (
              <div className="card p-4">
                <h3 className="text-xs uppercase tracking-wider text-ink-500 mb-3">
                  Source metrics
                </h3>
                <SidebarMetrics metrics={opp.metrics} />
              </div>
            ) : null}

            {/* Internal links suggestion */}
            {related.length > 0 ? (
              <div className="card p-4">
                <h3 className="text-xs uppercase tracking-wider text-ink-500 mb-3">
                  Internal links to weave in
                </h3>
                <ul className="space-y-2">
                  {related.slice(0, 6).map((r) => (
                    <li key={r.url}>
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-brand-700 hover:underline inline-flex items-start gap-1 leading-snug"
                      >
                        <ExternalLink className="size-3 mt-0.5 shrink-0" />
                        <span>{r.title}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  );
}

function SidebarBar({
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
        <span className="text-xs text-ink-600">{label}</span>
        <span className="text-xs font-semibold text-ink-900 tabular-nums">
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

function SidebarMetrics({
  metrics
}: {
  metrics: Record<string, number | null>;
}) {
  const rows: Array<{ label: string; value: string }> = [];
  if (typeof metrics.impressions === "number") {
    rows.push({
      label: "Impressions",
      value: metrics.impressions.toLocaleString()
    });
  }
  if (typeof metrics.clicks === "number") {
    rows.push({ label: "Clicks", value: metrics.clicks.toLocaleString() });
  }
  if (typeof metrics.ctr === "number") {
    rows.push({
      label: "CTR",
      value: `${(metrics.ctr * 100).toFixed(1)}%`
    });
  }
  if (typeof metrics.position === "number") {
    rows.push({
      label: "Avg position",
      value: `#${metrics.position.toFixed(1)}`
    });
  }
  if (typeof metrics.volume === "number") {
    rows.push({
      label: "Monthly volume",
      value: metrics.volume.toLocaleString()
    });
  }
  if (typeof metrics.difficulty === "number") {
    rows.push({
      label: "KD",
      value: String(metrics.difficulty)
    });
  }
  if (rows.length === 0)
    return <div className="text-xs text-ink-500">—</div>;
  return (
    <dl className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="flex items-baseline justify-between">
          <dt className="text-xs text-ink-600">{r.label}</dt>
          <dd className="text-xs font-semibold text-ink-900 tabular-nums">
            {r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
