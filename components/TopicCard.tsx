"use client";

import { useState } from "react";
import {
  Eye,
  Plus,
  Trash2,
  X,
  Target,
  TrendingUp,
  Lightbulb,
  AlertTriangle,
  Sparkles,
  ExternalLink
} from "lucide-react";
import type { Topic } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { PriorityBadge, TypeBadge, Badge } from "@/components/ui/Badge";

// Pick a badge tone for a 0-100 score (used for impact + novelty).
function scoreTone(score: number): "success" | "info" | "warn" | "danger" {
  if (score >= 80) return "success";
  if (score >= 60) return "info";
  if (score >= 40) return "warn";
  return "danger";
}

export function TopicCard({
  topic,
  onMove,
  onDelete
}: {
  topic: Topic;
  onMove: () => void;
  onDelete: () => void;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);

  const impact = topic.impactScore ?? topic.priorityScore;
  const novelty = topic.noveltyScore;

  return (
    <div className="card p-5 hover:shadow-cardHover transition">
      {/* 1. Tags row — content tags on the left, score badges on the right */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <TypeBadge value={topic.contentType} />
          <PriorityBadge value={topic.priority} />
          {topic.intent ? (
            <Badge tone="neutral" className="capitalize">
              {topic.intent}
            </Badge>
          ) : null}
          <Badge tone="neutral">Effort: {topic.estimatedEffort}</Badge>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge tone={scoreTone(impact)} className="gap-1">
            <Sparkles className="size-3" />
            Impact {impact}
          </Badge>
          {typeof novelty === "number" ? (
            <Badge tone={scoreTone(novelty)}>Novelty {novelty}</Badge>
          ) : null}
        </div>
      </div>

      {/* 2. Title */}
      <h3 className="text-[17px] font-semibold text-ink-900 leading-snug mb-2">
        {topic.title}
      </h3>

      {/* 3. Description — full text, no clamp; users get the full pitch */}
      <p className="text-sm text-ink-600 leading-relaxed mb-3">
        {topic.whyOpportunity}
      </p>

      {/* Overlap warning, when present */}
      {topic.overlapWithUrl ? (
        <div className="mb-3 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50/60 px-2.5 py-1.5 text-[12px] text-amber-900">
          <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-amber-600" />
          <div className="min-w-0">
            Possible overlap with existing content:{" "}
            <a
              href={topic.overlapWithUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline decoration-amber-400 hover:decoration-amber-700 break-all"
            >
              {topic.overlapWithTitle || topic.overlapWithUrl}
            </a>
            <ExternalLink className="size-3 inline ml-0.5" />
          </div>
        </div>
      ) : null}

      {/* 4. + 5. Target keyword + search intent — meta strip */}
      <div className="flex items-center gap-3 flex-wrap text-xs text-ink-600 mb-4">
        <div className="flex items-center gap-1.5 min-w-0">
          <Target className="size-3.5 shrink-0 text-ink-400" />
          <span className="font-mono">{topic.targetKeyword}</span>
        </div>
        <span className="text-ink-300">·</span>
        <div className="flex items-center gap-1.5 text-ink-500 min-w-0">
          <Lightbulb className="size-3.5 shrink-0 text-ink-400" />
          <span>{topic.searchIntent}</span>
        </div>
      </div>

      {/* 6. CTAs — footer */}
      <div className="flex items-center justify-end gap-2 pt-3 border-t border-ink-100">
        <Button
          variant="ghost"
          onClick={onDelete}
          aria-label="Delete"
          className="!text-ink-400 hover:!text-rose-600"
        >
          <Trash2 className="size-4" />
          Discard
        </Button>
        <Button
          variant="secondary"
          onClick={() => setPreviewOpen(true)}
        >
          <Eye className="size-4" />
          Preview
        </Button>
        <Button
          variant="primary"
          onClick={onMove}
        >
          <Plus className="size-4" />
          Move to Kanban
        </Button>
      </div>

      {previewOpen && (
        <div
          className="fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-sm grid place-items-center p-6"
          onClick={() => setPreviewOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-cardHover w-full max-w-xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <div className="flex gap-2 mb-2 flex-wrap">
                  <TypeBadge value={topic.contentType} />
                  <PriorityBadge value={topic.priority} />
                  {topic.intent ? (
                    <Badge tone="neutral" className="capitalize">
                      {topic.intent}
                    </Badge>
                  ) : null}
                  <Badge tone={scoreTone(impact)}>
                    Impact {impact}/100
                  </Badge>
                  {typeof novelty === "number" ? (
                    <Badge tone={scoreTone(novelty)}>
                      Novelty {novelty}/100
                    </Badge>
                  ) : null}
                </div>
                <h2 className="text-xl font-semibold text-ink-900">
                  {topic.title}
                </h2>
                {topic.overlapWithUrl ? (
                  <div className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50/60 px-2.5 py-1.5 text-[12px] text-amber-900">
                    <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-amber-600" />
                    <div className="min-w-0">
                      May cannibalize an existing page:{" "}
                      <a
                        href={topic.overlapWithUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium underline decoration-amber-400 hover:decoration-amber-700 break-all"
                      >
                        {topic.overlapWithTitle || topic.overlapWithUrl}
                      </a>
                    </div>
                  </div>
                ) : null}
              </div>
              <Button variant="ghost" onClick={() => setPreviewOpen(false)}>
                <X className="size-4" />
              </Button>
            </div>

            <PreviewRow label="Target keyword" icon={Target}>
              <span className="font-mono text-sm">{topic.targetKeyword}</span>
            </PreviewRow>
            <PreviewRow label="Search intent" icon={Lightbulb}>
              {topic.searchIntent}
            </PreviewRow>
            <PreviewRow label="Why this is an opportunity" icon={TrendingUp}>
              {topic.whyOpportunity}
            </PreviewRow>
            {topic.competitorGap && (
              <PreviewRow label="Competitor gap">
                {topic.competitorGap}
              </PreviewRow>
            )}
            {topic.rankingPotential && (
              <PreviewRow label="Ranking potential">
                {topic.rankingPotential}
              </PreviewRow>
            )}
            {topic.businessImpact && (
              <PreviewRow label="Business impact">
                {topic.businessImpact}
              </PreviewRow>
            )}
            <PreviewRow label="Suggested CTA">{topic.suggestedCta}</PreviewRow>
            <PreviewRow label="Estimated effort">
              {topic.estimatedEffort}
            </PreviewRow>

            <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-ink-100">
              <Button variant="secondary" onClick={() => setPreviewOpen(false)}>
                Close
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  onMove();
                  setPreviewOpen(false);
                }}
              >
                <Plus className="size-4" />
                Move to Kanban
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewRow({
  label,
  icon: Icon,
  children
}: {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="py-2.5 border-b border-ink-100 last:border-0">
      <div className="text-[11px] font-medium text-ink-500 uppercase tracking-wide flex items-center gap-1 mb-0.5">
        {Icon ? <Icon className="size-3" /> : null}
        {label}
      </div>
      <div className="text-sm text-ink-800">{children}</div>
    </div>
  );
}
