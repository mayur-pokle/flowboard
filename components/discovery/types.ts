// Shared Opportunity type for the Discovery surface — mirrors what
// /api/discoveries returns. Kept in components/ so both the page and
// the detail panel can import without crossing layers.

import type {
  Intent,
  OpportunityType,
  Priority,
  ScoreBreakdown
} from "@/lib/opportunity-classifier";
import type { BriefData } from "@/lib/brief-generator";
import type { QualityChecks } from "@/lib/content-quality";
import type { KanbanColumn } from "./tokens";

export interface Opportunity {
  id: string;
  source: string;
  query: string;
  url: string | null;
  metrics: {
    impressions?: number;
    clicks?: number;
    ctr?: number;
    position?: number;
    volume?: number;
    difficulty?: number;
  } | null;
  score: number;
  scoreBreakdown: ScoreBreakdown | null;
  intent: Intent | null;
  aiCitationGap: boolean;
  kanbanColumn: KanbanColumn | "rejected";
  opportunityType: OpportunityType;
  priority: Priority;
  trending: boolean;
  weeklyImpressions: number;
  previousWeekImpressions: number;
  competitorUrls: string[];
  competitorGapScore: number;
  aiCitationsCited: string[];
  cannibalizingPages: Array<{ url: string; title: string }>;
  briefData: BriefData | null;
  briefMarkdown?: string | null;
  contentChecks: QualityChecks | null;
  contentMarkdown?: string | null;
  isSample: boolean;
  reason: string | null;
  linkedTaskId: string | null;
  briefGeneratedAt: string | null;
  contentGeneratedAt: string | null;
  status?: string;
}
