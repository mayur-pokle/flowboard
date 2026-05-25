export type ContentType =
  | "Calculator"
  | "Template"
  | "Guide"
  | "Whitepaper"
  | "Checklist"
  | "Framework";

export type Priority = "Low" | "Medium" | "High";
export type Effort = "Low" | "Medium" | "High";
export type Status = "todo" | "in_progress" | "done";

// Structured search intent for filtering & cannibalization checks.
// Topics + keywords + existing content all share this enum.
export type SearchIntentType =
  | "informational"
  | "commercial"
  | "transactional"
  | "navigational";

export interface Topic {
  id: string;
  title: string;
  contentType: ContentType;
  targetKeyword: string;
  searchIntent: string; // free-text descriptor (legacy)
  priority: Priority;
  priorityScore: number; // 0-100
  whyOpportunity: string;
  suggestedCta: string;
  estimatedEffort: Effort;
  competitorGap?: string;
  rankingPotential?: string;
  businessImpact?: string;
  // ── Cannibalization & impact ──
  intent?: SearchIntentType;
  impactScore?: number; // 0-100
  noveltyScore?: number; // 0-100 (100 = totally fresh)
  overlapWithUrl?: string;
  overlapWithTitle?: string;
  createdAt: string;
}

export interface GeneratedContent {
  metaTitle: string;
  metaDescription: string;
  urlSlug: string;
  schemaJsonLd: string;
  body: string;
  internalLinks: string[];
  ctaPlacements: string[];
  faqs: { q: string; a: string }[];
  wordCount: number;
}

export type ContentStatus = "not_started" | "generating" | "completed" | "error";

export interface Task {
  id: string;
  topicId: string;
  topic: Topic;
  status: Status;
  tags: string[];
  contentStatus: ContentStatus;
  content?: GeneratedContent;
  contentVersions?: GeneratedContent[];
  createdAt: string;
  updatedAt: string;
}

// "primary" — beat them directly (heavy weight in prompts).
// "secondary" — referenced for context.
// "watch"     — tracked for gap analysis only.
export type CompetitorTier = "primary" | "secondary" | "watch";

export interface Competitor {
  id: string;
  name: string;
  url: string;
  notes: string;
  tier: CompetitorTier;
}

// ── Keyword bank ──
export type KeywordPriority = "P0" | "P1" | "P2";
export type KeywordStatus =
  | "targeting"
  | "ranking"
  | "won"
  | "abandoned";

export interface Keyword {
  id: string;
  keyword: string;
  priority: KeywordPriority;
  intent: SearchIntentType;
  status: KeywordStatus;
  searchVolume?: number;
  difficulty?: number;
  targetUrl?: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

// ── Existing content library ──
export interface ExistingContent {
  id: string;
  url: string;
  title: string;
  targetKeyword: string;
  intent: SearchIntentType | "";
  publishedDate?: string;
  notes: string;
  createdAt: string;
}

export type PrimaryProvider = "auto" | "openai" | "gemini";

export interface Settings {
  // AI providers + integrations
  openaiKey: string;
  openaiModel: string;
  geminiKey: string;
  geminiModel: string;
  primaryProvider: PrimaryProvider;
  slackWebhook: string;

  // Brand profile
  companyName: string;
  websiteUrl: string;
  brandNiche: string;
  brandAudience: string;
  productDescription: string;
  valueProposition: string;
  brandVoice: string;
  primaryCta: string;
  primaryGeo: string;

  // SEO seed
  seedKeywords: string; // comma-separated
  topicsToAvoid: string; // comma-separated

  // Competitive intel
  competitors: Competitor[];
}

export interface AppState {
  topics: Topic[]; // in the review pool
  deletedTopicHashes: string[]; // memory of "never show again"
  movedTopicHashes: string[]; // memory of topics already moved to board
  tasks: Task[];
  // ── New priority-targeting & cannibalization data ──
  keywords: Keyword[];
  existingContent: ExistingContent[];
  settings: Settings;
  selectedTaskId: string | null;
  lastGeneratedAt: string | null;
}
