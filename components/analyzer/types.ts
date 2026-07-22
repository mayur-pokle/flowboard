// Types shared across the Topic Analyzer UI. Mirrors the analyzer API
// response shape so components stay decoupled from the Zustand store
// (the analyzer's data lives in its own tables, not the app store).

import type { AnalysisResult } from "@/lib/topic-analyzer";
import type { EnrichmentResult } from "@/lib/topic-enricher";

export type AnalyzerColumn =
  | "draft"
  | "analyzed"
  | "approved"
  | "archived";

export interface AnalyzedTopic {
  id: string;
  title: string;
  targetKeyword: string | null;
  notes: string | null;
  // Optional draft body — when present, the analyzer also runs
  // content-quality checks against it.
  postBody: string | null;
  kanbanColumn: AnalyzerColumn;
  analysis: AnalysisResult | null;
  enrichment: EnrichmentResult | null;
  promotedToTaskId: string | null;
  promotedToDiscoveryId: string | null;
  createdAt: string;
  updatedAt: string;
}

export const COLUMN_ORDER: AnalyzerColumn[] = [
  "draft",
  "analyzed",
  "approved",
  "archived"
];

export const COLUMN_LABEL: Record<AnalyzerColumn, string> = {
  draft: "Draft",
  analyzed: "Analyzed",
  approved: "Approved",
  archived: "Archived"
};

export const COLUMN_TONE: Record<
  AnalyzerColumn,
  "ink" | "violet" | "brand" | "emerald"
> = {
  draft: "ink",
  analyzed: "violet",
  approved: "brand",
  archived: "emerald"
};
