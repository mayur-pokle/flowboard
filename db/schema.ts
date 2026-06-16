import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  primaryKey,
  boolean
} from "drizzle-orm/pg-core";
import type { AdapterAccount } from "next-auth/adapters";

// ───────────────────────── NextAuth tables ─────────────────────────
// Standard schema required by @auth/drizzle-adapter (NextAuth v4).

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique().notNull(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  // Role gives the option to add admins later; default "member".
  role: text("role").default("member").notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull()
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccount["type"]>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state")
  },
  (acct) => ({
    compoundKey: primaryKey({
      columns: [acct.provider, acct.providerAccountId]
    })
  })
);

export const sessions = pgTable("sessions", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull()
});

export const verificationTokens = pgTable(
  "verificationTokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull()
  },
  (vt) => ({
    compoundKey: primaryKey({ columns: [vt.identifier, vt.token] })
  })
);

// ───────────────────────── Workspace tables ─────────────────────────
// Single shared workspace — no workspaceId column needed for v1.

export const topics = pgTable("topics", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  contentType: text("contentType").notNull(),
  targetKeyword: text("targetKeyword").notNull(),
  searchIntent: text("searchIntent").notNull(),
  priority: text("priority").notNull(),
  priorityScore: integer("priorityScore").notNull(),
  whyOpportunity: text("whyOpportunity").notNull(),
  suggestedCta: text("suggestedCta").notNull(),
  estimatedEffort: text("estimatedEffort").notNull(),
  competitorGap: text("competitorGap"),
  rankingPotential: text("rankingPotential"),
  businessImpact: text("businessImpact"),
  // ── Cannibalization & impact scoring ──
  // Structured intent ("informational" | "commercial" | "transactional" | "navigational").
  // Separate from searchIntent (which is a free-text description) so we can filter.
  intent: text("intent"),
  // 0-100 — AI's confidence this topic will move the needle (search demand x brand fit x white space).
  impactScore: integer("impactScore"),
  // 0-100 — embedding-based score vs. existing content library + accepted topics.
  // 100 = totally novel, 0 = identical to something we already have.
  noveltyScore: integer("noveltyScore"),
  // If we found a near-duplicate in the existing library, store its URL + title.
  overlapWithUrl: text("overlapWithUrl"),
  overlapWithTitle: text("overlapWithTitle"),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  // No FK reference here so credentials-auth users (which aren't written to
  // the users table on every sign-in) can still create topics.
  createdByUserId: text("createdByUserId")
});

// "Never show again" memory — stable hash of (title + keyword).
export const deletedTopicHashes = pgTable("deletedTopicHashes", {
  hash: text("hash").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull()
});

export const movedTopicHashes = pgTable("movedTopicHashes", {
  hash: text("hash").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull()
});

// Kanban cards. Each task snapshots its source topic so we can keep
// rendering the card even after the topic row is purged.
export const tasks = pgTable("tasks", {
  id: text("id").primaryKey(),
  topicId: text("topicId"), // nullable — source topic may be deleted
  topicSnapshot: jsonb("topicSnapshot").notNull(),
  status: text("status").notNull().default("todo"),
  contentStatus: text("contentStatus").notNull().default("not_started"),
  content: jsonb("content"),
  contentVersions: jsonb("contentVersions"),
  tags: text("tags").array().notNull().default([]),
  // Once the article is live, the team fills in the URL here. Used to
  // pull GSC performance data into the card so they can see how the
  // piece is actually doing without leaving Flowboard.
  publishedUrl: text("publishedUrl"),
  // Cached snapshot of the last GSC performance fetch — current + prev
  // 28d windows so we can render deltas instantly. Refreshed on demand
  // by the user clicking "Refresh data" on the card. Shape:
  //   { current: {impressions, clicks, ctr, position},
  //     previous: {impressions, clicks, ctr, position},
  //     fetchedAt: ISO string }
  publishedUrlMetrics: jsonb("publishedUrlMetrics"),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
  // No FK — see note on topics.createdByUserId.
  createdByUserId: text("createdByUserId")
});

// Shared workspace settings — singleton row keyed by id = 'workspace'.
export const settings = pgTable("settings", {
  id: text("id").primaryKey(),
  companyName: text("companyName").default("").notNull(),
  websiteUrl: text("websiteUrl").default("").notNull(),
  brandNiche: text("brandNiche").default("").notNull(),
  brandAudience: text("brandAudience").default("").notNull(),
  productDescription: text("productDescription").default("").notNull(),
  valueProposition: text("valueProposition").default("").notNull(),
  brandVoice: text("brandVoice").default("").notNull(),
  primaryCta: text("primaryCta").default("").notNull(),
  primaryGeo: text("primaryGeo").default("").notNull(),
  seedKeywords: text("seedKeywords").default("").notNull(),
  topicsToAvoid: text("topicsToAvoid").default("").notNull(),
  // Models — overridable per-workspace (server env still wins).
  openaiModel: text("openaiModel").default("gpt-4o-mini").notNull(),
  geminiModel: text("geminiModel").default("gemini-2.0-flash").notNull(),
  anthropicModel: text("anthropicModel")
    .default("claude-haiku-4-5")
    .notNull(),
  // "auto" tries OpenAI → Gemini → Anthropic. Pinned values use that
  // provider only (no fallback). Mock is the final fallback.
  primaryProvider: text("primaryProvider").default("auto").notNull(),
  // ── Per opportunity-type LLM mapping (Discovery content gen) ──
  // Each opportunity type uses its own provider + instructions. The
  // spec defaults to New→OpenAI / Refresh→Anthropic / Community→Gemini
  // but the strategist can re-map. Empty instructions = use brand
  // voice + product context only.
  newOppProvider: text("newOppProvider").default("openai").notNull(),
  newOppInstructions: text("newOppInstructions").default("").notNull(),
  refreshOppProvider: text("refreshOppProvider")
    .default("anthropic")
    .notNull(),
  refreshOppInstructions: text("refreshOppInstructions")
    .default("")
    .notNull(),
  communityOppProvider: text("communityOppProvider")
    .default("gemini")
    .notNull(),
  communityOppInstructions: text("communityOppInstructions")
    .default("")
    .notNull(),
  lastGeneratedAt: timestamp("lastGeneratedAt", { mode: "date" }),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull()
});

export const competitors = pgTable("competitors", {
  id: text("id").primaryKey(),
  name: text("name").default("").notNull(),
  url: text("url").default("").notNull(),
  notes: text("notes").default("").notNull(),
  // "primary" | "secondary" | "watch" — controls how heavily the AI weights
  // this competitor in prompts. Primary = beat them directly; Watch = track only.
  tier: text("tier").default("secondary").notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull()
});

// ───────────────────────── Keyword bank ─────────────────────────
// First-class entity (independent of topics) for priority targeting.

export const keywords = pgTable("keywords", {
  id: text("id").primaryKey(),
  keyword: text("keyword").notNull(),
  // "P0" (must-target) | "P1" (nice-to-have) | "P2" (watchlist)
  priority: text("priority").default("P1").notNull(),
  // "informational" | "commercial" | "transactional" | "navigational"
  intent: text("intent").default("informational").notNull(),
  // "targeting" | "ranking" | "won" | "abandoned"
  status: text("status").default("targeting").notNull(),
  // Optional manual entry. We don't fetch this from a SERP API in v1.
  searchVolume: integer("searchVolume"),
  difficulty: integer("difficulty"),
  // Once published, the URL we ended up targeting it with.
  targetUrl: text("targetUrl"),
  notes: text("notes").default("").notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull()
});

// ───────────────────────── Existing content library ─────────────────────────
// Everything we've already published. Used for cannibalization checks.

export const existingContent = pgTable("existingContent", {
  id: text("id").primaryKey(),
  url: text("url").notNull(),
  title: text("title").notNull(),
  targetKeyword: text("targetKeyword").default("").notNull(),
  // Optional intent tag; aligns with keyword.intent values.
  intent: text("intent").default("").notNull(),
  publishedDate: timestamp("publishedDate", { mode: "date" }),
  notes: text("notes").default("").notNull(),
  // Cached embedding (jsonb-encoded array of numbers) so we don't recompute
  // for every generation. Null until first embedding pass.
  embedding: jsonb("embedding"),
  // When this row was imported via sitemap, the URL of that sitemap.
  // Lets the Refresh button know what to re-fetch and what to diff against.
  sourceSitemapUrl: text("sourceSitemapUrl"),
  // Set when the title has been fetched live from the page (vs. derived
  // from the URL path on first import). Null = title is auto-derived and
  // can be improved by the "Enrich titles" button.
  enrichedAt: timestamp("enrichedAt", { mode: "date" }),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull()
});

// ───────────────────────── Task comments ─────────────────────────
// Per-task discussion thread. Used by the content team to leave remarks,
// review notes, blockers, etc. Comments are workspace-shared (no DMs).

export const taskComments = pgTable("taskComments", {
  id: text("id").primaryKey(),
  taskId: text("taskId").notNull(),
  body: text("body").notNull(),
  authorEmail: text("authorEmail").default("").notNull(),
  authorName: text("authorName").default("").notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull()
});

// ───────────────────────── Source integrations ─────────────────────────
// Per-source connection config + encrypted credentials. One row per source
// (gsc, semrush, ahrefs, ga4, …) for the singleton workspace. Encrypted
// blob is AES-256-GCM ciphertext + IV + auth tag, base64-encoded.

export const sourceConfigs = pgTable("sourceConfigs", {
  // Source name acts as the primary key — there's only ever one config
  // per source per workspace.
  name: text("name").primaryKey(),
  // "connected" | "disconnected" | "error"
  status: text("status").default("disconnected").notNull(),
  // Encrypted JSON: tokens for OAuth sources, raw API key for key-auth.
  encryptedCredentials: text("encryptedCredentials"),
  // Free-form metadata: selected GSC property URL, SEMrush domain, etc.
  metadata: jsonb("metadata"),
  // Last error message (if status === "error"), for diagnostics.
  lastError: text("lastError"),
  lastSyncedAt: timestamp("lastSyncedAt", { mode: "date" }),
  connectedAt: timestamp("connectedAt", { mode: "date" }),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull()
});

// ── Discovered opportunities ──
// Rows pulled from external sources (GSC queries, competitor keywords,
// backlink targets). Each row is a "thing the user might want to write
// about or refresh", scored 0-100 by combining demand + opportunity gap.

export const discoveredOpportunities = pgTable("discoveredOpportunities", {
  id: text("id").primaryKey(),
  // Where this row came from. Matches sourceConfigs.name.
  source: text("source").notNull(),
  // The query string / keyword the opportunity is about.
  query: text("query").notNull(),
  // For GSC: the page that already ranks for this query (if any).
  url: text("url"),
  // Raw metrics from the source — kept as jsonb so adding new fields per
  // source doesn't require a migration.
  metrics: jsonb("metrics"),
  // 0-100 priority score. Higher = more worth attention.
  score: integer("score").default(0).notNull(),
  // Sub-score breakdown that adds up to `score`. Stored so the UI can
  // explain WHY this is 85 not 60 — the bare number alone creates no
  // trust. Shape: { gscVelocity, competitorGap, aiCitationGap, conversions }.
  scoreBreakdown: jsonb("scoreBreakdown"),
  // Detected search intent — "commercial" | "informational" |
  // "transactional" | "navigational". Drives content type recommendation
  // on the Brief page.
  intent: text("intent"),
  // True if our heuristic thinks AI engines (Perplexity, Google AI
  // Overviews, ChatGPT) are likely citing competitors but not us for this
  // query. Renders as the purple AEO/GEO badge across all three screens.
  aiCitationGap: boolean("aiCitationGap").default(false).notNull(),
  // CRM-style pipeline status. "new" → just discovered. "triaging" →
  // strategist reviewing. "briefed" → brief generated. "in_progress" →
  // content being written. "published" → article live. "archived" →
  // dismissed/won't pursue. Replaces the older 3-state model but stays
  // backwards-compatible with old "moved"/"dismissed" rows.
  status: text("status").default("new").notNull(),
  // Optional one-liner explaining WHY this scored high (UI tooltip).
  reason: text("reason"),
  // If user moved this to Kanban, the resulting task id.
  movedToTaskId: text("movedToTaskId"),
  // Stable dedup key per source so re-syncs UPSERT instead of duplicating.
  // e.g. "gsc::sc-domain:acme.com::month-end close software"
  dedupKey: text("dedupKey").notNull().unique(),
  // ── Brief + content (the CRM workflow) ──
  // Deterministically generated brief markdown. Saved here so the brief
  // page is instant on every revisit. Regenerable on demand.
  briefMarkdown: text("briefMarkdown"),
  briefGeneratedAt: timestamp("briefGeneratedAt", { mode: "date" }),
  // AI-generated article. Auto-creates a Kanban task in Done when first
  // produced — see linkedTaskId below.
  contentMarkdown: text("contentMarkdown"),
  contentGeneratedAt: timestamp("contentGeneratedAt", { mode: "date" }),
  // Quality signals computed after content generation. Shape:
  //   { directAnswer: boolean, comparisonTable: boolean,
  //     cannibalizationOk: boolean, wordCount: number,
  //     wordCountTarget: number }
  qualitySignals: jsonb("qualitySignals"),
  // The Kanban task this opportunity was promoted to (set on first
  // Generate Content success). Lets the UI deep-link from a card to its
  // task and back.
  linkedTaskId: text("linkedTaskId"),
  // ── Demand-capture pipeline (Discovery kanban) ──
  // Which column the card is in.
  // "intake" → just discovered, waiting on accept/reject
  // "new" → accepted, brief generating/generated
  // "in_progress" → content generating/generated
  // "done" → reviewed, archived
  // "rejected" → soft-deleted (recoverable in session, permanent after)
  kanbanColumn: text("kanbanColumn").default("intake").notNull(),
  // What kind of opportunity this is. Drives which LLM + instructions
  // are used for content generation.
  // "new" → first-time keyword target (GSC/SEMrush/Ahrefs gaps)
  // "refresh" → existing page losing ground (refresh detector)
  // "community" → AI-citation gap or competitor velocity signal
  opportunityType: text("opportunityType").default("new").notNull(),
  // P0/P1/P2 — derived from total score on save.
  priority: text("priority").default("P1").notNull(),
  // Trending = week-over-week impression growth > 20%. Computed during
  // GSC sync; static for sample/non-GSC sources.
  trending: boolean("trending").default(false).notNull(),
  weeklyImpressions: integer("weeklyImpressions").default(0).notNull(),
  previousWeekImpressions: integer("previousWeekImpressions")
    .default(0)
    .notNull(),
  // Competitors ranking for this query (used in brief gap analysis).
  competitorUrls: jsonb("competitorUrls"),
  // 0-100 — averaged across SEMrush + Ahrefs gap data when available.
  competitorGapScore: integer("competitorGapScore").default(0).notNull(),
  // Domains the AI Citations Tracker has seen cited for this query.
  aiCitationsCited: jsonb("aiCitationsCited"),
  // Existing pages we detect cannibalizing this query (URL + title).
  cannibalizingPages: jsonb("cannibalizingPages"),
  // Structured brief payload. Shape — see lib/brief-generator.ts
  // BriefData type. Stored on save so re-opening is instant.
  briefData: jsonb("briefData"),
  // Quality checks from the content generation pipeline. Shape —
  // see lib/content-quality.ts QualityChecks type.
  contentChecks: jsonb("contentChecks"),
  // Flagged when the row was inserted by the sample-data seeder.
  // Shown in the dismissible "sample data mode" banner on the board.
  isSample: boolean("isSample").default(false).notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull()
});

// Flag to know if the workspace has ever been seeded from a browser
// snapshot, so we don't re-migrate on every sign-in.
export const meta = pgTable("meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull()
});

export type DbTopic = typeof topics.$inferSelect;
export type DbTask = typeof tasks.$inferSelect;
export type DbSettings = typeof settings.$inferSelect;
export type DbCompetitor = typeof competitors.$inferSelect;
export type DbKeyword = typeof keywords.$inferSelect;
export type DbExistingContent = typeof existingContent.$inferSelect;
export type DbTaskComment = typeof taskComments.$inferSelect;
export type DbSourceConfig = typeof sourceConfigs.$inferSelect;
export type DbDiscoveredOpportunity =
  typeof discoveredOpportunities.$inferSelect;
