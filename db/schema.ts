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
