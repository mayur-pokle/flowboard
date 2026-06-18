"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import type { Task } from "@/lib/types";
import { PublishPromptCard } from "@/components/PublishPromptCard";
import {
  buildPublishPrompt,
  MAX_INTERLINK_CANDIDATES,
  type PublishInput
} from "@/lib/publish-prompt";

// ── Task-shaped wrapper ──────────────────────────────────────────────
//
// Maps an AI Resources task → PublishInput → renders the shared
// PublishPromptCard. The opportunity-shaped equivalent lives in
// components/discovery/DiscoveryPublishPromptSection.tsx and feeds the
// same builder so both surfaces produce structurally identical prompts.

export function PublishPromptSection({ task }: { task: Task }) {
  const existingContent = useStore((s) => s.existingContent);
  const settings = useStore((s) => s.settings);

  const input = useMemo<PublishInput | null>(() => {
    if (!task.content) return null;
    const c = task.content;
    return {
      title: task.topic.title,
      targetKeyword: task.topic.targetKeyword,
      contentType: task.topic.contentType,
      intent: task.topic.intent,
      metaTitle: c.metaTitle,
      metaDescription: c.metaDescription,
      urlSlug: c.urlSlug,
      body: c.body,
      faqs: c.faqs,
      ctaPlacements: c.ctaPlacements,
      schemaJsonLd: c.schemaJsonLd,
      brandName:
        settings.companyName || settings.brandNiche || "this brand",
      interlinkCandidates: existingContent
        .filter((e) => Boolean(e.url) && Boolean(e.title))
        .slice(0, MAX_INTERLINK_CANDIDATES)
        .map((e) => ({
          url: e.url,
          title: e.title,
          targetKeyword: e.targetKeyword
        }))
    };
  }, [task, settings, existingContent]);

  if (!input) return null;
  const prompt = buildPublishPrompt(input);

  return (
    <PublishPromptCard
      prompt={prompt}
      candidateCount={input.interlinkCandidates.length}
    />
  );
}
