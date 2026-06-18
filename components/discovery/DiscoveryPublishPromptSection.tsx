"use client";

import { useEffect, useMemo, useState } from "react";
import { PublishPromptCard } from "@/components/PublishPromptCard";
import {
  buildPublishPrompt,
  deriveMetaDescription,
  slugify,
  MAX_INTERLINK_CANDIDATES,
  type PublishInput
} from "@/lib/publish-prompt";
import type { Opportunity } from "./types";

// ── Opportunity-shaped wrapper ───────────────────────────────────────
//
// Builds the publish prompt for an AI Discovery opportunity. The
// opportunity carries different fields than an AI Resources task —
// no pre-baked metaTitle/metaDescription/urlSlug — so this wrapper
// derives sensible defaults at render time before feeding the shared
// buildPublishPrompt.
//
// Only renders when contentMarkdown exists (you can't publish nothing).

interface LibraryEntry {
  url: string;
  title: string;
  targetKeyword?: string;
}

interface SettingsLite {
  companyName?: string;
  brandNiche?: string;
}

export function DiscoveryPublishPromptSection({
  opportunity
}: {
  opportunity: Opportunity;
}) {
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [brand, setBrand] = useState<SettingsLite>({});

  // Lightweight fetch — we don't drag the full app store into the
  // Discovery panel. /api/existing-content + /api/settings already exist
  // and are cheap. Cached for the panel's lifetime.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [ecRes, settingsRes] = await Promise.all([
          fetch("/api/existing-content").then((r) => r.json()),
          fetch("/api/settings").then((r) => r.json())
        ]);
        if (cancelled) return;
        const ec = ecRes.existingContent || [];
        setLibrary(
          ec
            .filter((e: LibraryEntry) => Boolean(e.url) && Boolean(e.title))
            .slice(0, MAX_INTERLINK_CANDIDATES)
        );
        const s = settingsRes.settings || {};
        setBrand({
          companyName: s.companyName,
          brandNiche: s.brandNiche
        });
      } catch {
        // Fail silently — the prompt still works without an interlink set.
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const input = useMemo<PublishInput | null>(() => {
    if (!opportunity.contentMarkdown) return null;

    // Article TITLE: opportunity.query holds the proposed article
    // headline (for AI-gap rows) or the search query (legacy GSC rows).
    // Either way it works as the publish title.
    const title = opportunity.query;

    // Target keyword from metrics if AI gap row, otherwise just query.
    const metricsBag =
      (opportunity.metrics as Record<string, unknown> | null) || {};
    const targetKeyword =
      typeof metricsBag.targetKeyword === "string" &&
      (metricsBag.targetKeyword as string).trim()
        ? (metricsBag.targetKeyword as string).trim()
        : opportunity.query;

    // Map opportunityType + intent to a more reader-friendly content type.
    const contentType =
      opportunity.opportunityType === "refresh"
        ? "Refresh"
        : opportunity.opportunityType === "community"
        ? "Community piece"
        : opportunity.intent === "commercial"
        ? "Comparison guide"
        : opportunity.intent === "transactional"
        ? "Landing page"
        : "Guide";

    // Pull SEO metadata from the briefData when available; fall back
    // to derived defaults so the prompt always has values.
    const brief = opportunity.briefData;
    const metaTitle = title.length <= 60 ? title : title.slice(0, 57) + "…";
    const metaDescription = deriveMetaDescription(
      opportunity.contentMarkdown,
      brief?.intentExplanation || opportunity.reason || ""
    );
    const urlSlug = slugify(title) || slugify(targetKeyword);
    const ctaPlacements =
      brief?.ctaRecommendation ? [brief.ctaRecommendation] : undefined;

    return {
      title,
      targetKeyword,
      contentType,
      intent: opportunity.intent || undefined,
      metaTitle,
      metaDescription,
      urlSlug,
      body: opportunity.contentMarkdown,
      ctaPlacements,
      brandName: brand.companyName || brand.brandNiche || "this brand",
      interlinkCandidates: library
    };
  }, [opportunity, library, brand]);

  if (!input) return null;
  const prompt = buildPublishPrompt(input);

  return (
    <PublishPromptCard
      prompt={prompt}
      candidateCount={input.interlinkCandidates.length}
    />
  );
}
