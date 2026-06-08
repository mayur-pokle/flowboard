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

// ── Live Pages ──
// Lifecycle states for a published / about-to-publish page.
export type LivePageStatus =
  | "scheduled"
  | "published"
  | "updating"
  | "needs_refresh"
  | "retired";

export interface LivePage {
  id: string;
  taskId?: string;
  topicSnapshot?: Topic;

  title: string;
  url: string;
  metaTitle: string;
  metaDescription: string;
  targetKeyword: string;
  searchIntent: string; // free-text, may match SearchIntentType
  contentType: ContentType;

  status: LivePageStatus;
  publishDate?: string;
  lastReviewedDate?: string;
  owner: string;

  monthlyTraffic?: number;
  rankingPosition?: number;
  searchVolume?: number;
  keywordDifficulty?: number;
  backlinks?: number;
  conversions?: number;

  notes: string;
  tags: string[];

  createdAt: string;
  updatedAt: string;
}

// ── Task comments ──
export interface TaskComment {
  id: string;
  taskId: string;
  body: string;
  authorEmail: string;
  authorName: string;
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
  // Sitemap this row was imported from (if any). Drives the Refresh button.
  sourceSitemapUrl?: string;
  // Set once the title has been fetched live (vs. derived from URL path).
  enrichedAt?: string;
  createdAt: string;
}

export type PrimaryProvider =
  | "auto"
  | "openai"
  | "gemini"
  | "anthropic";

export interface Settings {
  // AI providers + integrations
  openaiKey: string;
  openaiModel: string;
  geminiKey: string;
  geminiModel: string;
  anthropicKey: string;
  anthropicModel: string;
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
  // ── Live Pages: post-publish SEO tracking ──
  livePages: LivePage[];
  settings: Settings;
  selectedTaskId: string | null;
  lastGeneratedAt: string | null;
}
