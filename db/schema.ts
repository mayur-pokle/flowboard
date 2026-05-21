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
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  createdByUserId: text("createdByUserId").references(() => users.id, {
    onDelete: "set null"
  })
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
  createdByUserId: text("createdByUserId").references(() => users.id, {
    onDelete: "set null"
  })
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
  geminiModel: text("geminiModel").default("gemini-1.5-flash-latest").notNull(),
  lastGeneratedAt: timestamp("lastGeneratedAt", { mode: "date" }),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull()
});

export const competitors = pgTable("competitors", {
  id: text("id").primaryKey(),
  name: text("name").default("").notNull(),
  url: text("url").default("").notNull(),
  notes: text("notes").default("").notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull()
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
