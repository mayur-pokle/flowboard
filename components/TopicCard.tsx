"use client";

import { useState } from "react";
import {
  Eye,
  Plus,
  Trash2,
  X,
  Target,
  TrendingUp,
  Lightbulb
} from "lucide-react";
import type { Topic } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { PriorityBadge, TypeBadge, Badge } from "@/components/ui/Badge";

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

  return (
    <div className="card p-4 hover:shadow-cardHover transition">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <TypeBadge value={topic.contentType} />
            <PriorityBadge value={topic.priority} />
            <Badge tone="neutral">Effort: {topic.estimatedEffort}</Badge>
            <Badge tone="info">{topic.priorityScore}/100</Badge>
          </div>
          <h3 className="text-[15px] font-semibold text-ink-900 leading-snug">
            {topic.title}
          </h3>
          <div className="text-xs text-ink-500 mt-1 flex items-center gap-1.5">
            <Target className="size-3.5" />
            <span className="font-mono">{topic.targetKeyword}</span>
            <span className="text-ink-300">·</span>
            <span>{topic.searchIntent}</span>
          </div>
          <p className="text-sm text-ink-600 mt-2 leading-relaxed line-clamp-2">
            {topic.whyOpportunity}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            onClick={() => setPreviewOpen(true)}
            aria-label="Preview"
          >
            <Eye className="size-4" />
          </Button>
          <Button
            variant="primary"
            onClick={onMove}
            className="!py-1.5 !px-2.5"
          >
            <Plus className="size-4" />
            Move to Kanban
          </Button>
          <Button
            variant="ghost"
            onClick={onDelete}
            aria-label="Delete"
            className="!text-ink-400 hover:!text-rose-600"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
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
                  <Badge tone="info">Score {topic.priorityScore}/100</Badge>
                </div>
                <h2 className="text-xl font-semibold text-ink-900">
                  {topic.title}
                </h2>
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
