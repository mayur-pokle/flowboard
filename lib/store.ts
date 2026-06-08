"use client";

import { create } from "zustand";
import type {
  AppState,
  Competitor,
  ExistingContent,
  GeneratedContent,
  Keyword,
  LivePage,
  Settings,
  Status,
  Task,
  TaskComment,
  Topic
} from "./types";
import { topicHash, uid } from "./utils";

// ─────────────────────────────────────────────────────────────────────
// API-backed Zustand store.
//
// Reads are cached in-memory; mutations are write-through (optimistic
// update first, then POST/PATCH/DELETE to the API; on error we revert).
// localStorage is no longer the source of truth — that's the DB.
//
// localStorage is still used for one thing only: holding the "I've
// completed the one-time migration" flag, so we don't re-attempt it on
// every load.
// ─────────────────────────────────────────────────────────────────────

interface Store extends AppState {
  // Lifecycle
  hydrated: boolean;
  hydrate: () => Promise<void>;

  // Topics
  addTopics: (topics: Topic[]) => Promise<{ added: number; skipped: number }>;
  deleteTopic: (id: string) => Promise<void>;
  moveTopicToBoard: (id: string) => Promise<Task | null>;

  // Tasks
  setTaskStatus: (id: string, status: Status) => Promise<void>;
  setTaskPriority: (id: string, priority: Topic["priority"]) => Promise<void>;
  addTaskTag: (id: string, tag: string) => Promise<void>;
  removeTaskTag: (id: string, tag: string) => Promise<void>;
  setTaskContentStatus: (
    id: string,
    contentStatus: Task["contentStatus"]
  ) => Promise<void>;
  setTaskContent: (id: string, content: GeneratedContent) => Promise<void>;
  selectTask: (id: string | null) => void;
  deleteTask: (id: string) => Promise<void>;

  // Settings
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  addCompetitor: (
    c: Omit<Competitor, "id" | "tier"> & { tier?: Competitor["tier"] }
  ) => Promise<void>;
  updateCompetitor: (
    id: string,
    patch: Partial<Omit<Competitor, "id">>
  ) => Promise<void>;
  removeCompetitor: (id: string) => Promise<void>;

  // Keywords
  addKeyword: (
    k: Omit<Keyword, "id" | "createdAt" | "updatedAt">
  ) => Promise<void>;
  updateKeyword: (
    id: string,
    patch: Partial<Omit<Keyword, "id" | "createdAt" | "updatedAt">>
  ) => Promise<void>;
  removeKeyword: (id: string) => Promise<void>;

  // Existing content
  addExistingContent: (
    c: Omit<ExistingContent, "id" | "createdAt">
  ) => Promise<void>;
  updateExistingContent: (
    id: string,
    patch: Partial<Omit<ExistingContent, "id" | "createdAt">>
  ) => Promise<void>;
  removeExistingContent: (id: string) => Promise<void>;
  importSitemap: (sitemapUrl: string) => Promise<{
    imported: number;
    skipped: number;
    sampled: number;
    truncated?: boolean;
    sitemapUrl?: string;
  }>;
  refreshSitemap: (sitemapUrl: string) => Promise<{
    added: number;
    removed: Array<{ id: string; url: string; title: string }>;
    sampled: number;
    truncated?: boolean;
    sitemapUrl?: string;
  }>;
  enrichTitles: (ids: string[]) => Promise<{
    processed: number;
    enriched: number;
    failed: number;
  }>;
  bulkDeleteExistingContent: (ids: string[]) => Promise<void>;

  // ── Live Pages ──
  addLivePage: (
    p: Partial<Omit<LivePage, "id" | "createdAt" | "updatedAt">> & {
      title: string;
    }
  ) => Promise<void>;
  updateLivePage: (
    id: string,
    patch: Partial<Omit<LivePage, "id" | "createdAt" | "updatedAt">>
  ) => Promise<void>;
  removeLivePage: (id: string) => Promise<void>;
  reloadLivePages: () => Promise<void>;

  // Task comments — loaded on demand per task.
  commentsByTaskId: Record<string, TaskComment[]>;
  loadTaskComments: (taskId: string) => Promise<void>;
  addTaskComment: (taskId: string, body: string) => Promise<void>;
  updateTaskComment: (
    taskId: string,
    commentId: string,
    body: string
  ) => Promise<void>;
  deleteTaskComment: (taskId: string, commentId: string) => Promise<void>;

  // Bookkeeping
  setLastGeneratedAt: (iso: string) => Promise<void>;

  // Server-configured providers (read-only — set by Vercel env)
  serverConfigured: {
    openaiKey: boolean;
    geminiKey: boolean;
    anthropicKey: boolean;
    slackWebhook: boolean;
  };
}

const defaultSettings: Settings = {
  // AI / integrations — these are server-only now; client values are unused.
  openaiKey: "",
  openaiModel: "gpt-4o-mini",
  geminiKey: "",
  geminiModel: "gemini-2.0-flash",
  anthropicKey: "",
  anthropicModel: "claude-haiku-4-5",
  primaryProvider: "auto",
  slackWebhook: "",

  // Brand profile (DB-backed, shared)
  companyName: "",
  websiteUrl: "",
  brandNiche: "B2B SaaS for finance teams",
  brandAudience: "CFOs, controllers, and finance ops leaders at startups",
  productDescription: "",
  valueProposition: "",
  brandVoice: "Professional, helpful, and direct — no fluff",
  primaryCta: "Book a 20-min demo",
  primaryGeo: "United States",

  seedKeywords: "",
  topicsToAvoid: "",
  competitors: []
};

const initialState: AppState = {
  topics: [],
  deletedTopicHashes: [],
  movedTopicHashes: [],
  tasks: [],
  keywords: [],
  existingContent: [],
  livePages: [],
  settings: defaultSettings,
  selectedTaskId: null,
  lastGeneratedAt: null
};

async function api<T>(
  url: string,
  init?: RequestInit & { json?: unknown }
): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined)
  };
  if (init?.json !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(url, {
    ...init,
    headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string })?.error || `Request failed: ${res.status}`
    );
  }
  return (await res.json()) as T;
}

export const useStore = create<Store>()((set, get) => ({
  ...initialState,
  hydrated: false,
  serverConfigured: {
    openaiKey: false,
    geminiKey: false,
    anthropicKey: false,
    slackWebhook: false
  },
  commentsByTaskId: {},

  // ───────── Comments ─────────
  loadTaskComments: async (taskId) => {
    try {
      const { comments } = await api<{ comments: TaskComment[] }>(
        `/api/tasks/${taskId}/comments`
      );
      set((s) => ({
        commentsByTaskId: { ...s.commentsByTaskId, [taskId]: comments }
      }));
    } catch (err) {
      console.error("[store] loadTaskComments failed:", err);
    }
  },

  addTaskComment: async (taskId, body) => {
    const text = body.trim();
    if (!text) return;
    const { comment } = await api<{ comment: TaskComment }>(
      `/api/tasks/${taskId}/comments`,
      { method: "POST", json: { body: text } }
    );
    set((s) => ({
      commentsByTaskId: {
        ...s.commentsByTaskId,
        [taskId]: [...(s.commentsByTaskId[taskId] || []), comment]
      }
    }));
  },

  updateTaskComment: async (taskId, commentId, body) => {
    const text = body.trim();
    if (!text) return;
    const prev = get().commentsByTaskId[taskId] || [];
    const now = new Date().toISOString();
    set((s) => ({
      commentsByTaskId: {
        ...s.commentsByTaskId,
        [taskId]: prev.map((c) =>
          c.id === commentId ? { ...c, body: text, updatedAt: now } : c
        )
      }
    }));
    try {
      await api(`/api/tasks/${taskId}/comments/${commentId}`, {
        method: "PATCH",
        json: { body: text }
      });
    } catch (err) {
      set((s) => ({
        commentsByTaskId: { ...s.commentsByTaskId, [taskId]: prev }
      }));
      throw err;
    }
  },

  deleteTaskComment: async (taskId, commentId) => {
    const prev = get().commentsByTaskId[taskId] || [];
    set((s) => ({
      commentsByTaskId: {
        ...s.commentsByTaskId,
        [taskId]: prev.filter((c) => c.id !== commentId)
      }
    }));
    try {
      await api(`/api/tasks/${taskId}/comments/${commentId}`, {
        method: "DELETE"
      });
    } catch (err) {
      set((s) => ({
        commentsByTaskId: { ...s.commentsByTaskId, [taskId]: prev }
      }));
      throw err;
    }
  },

  hydrate: async () => {
    try {
      const [topicsRes, tasksRes, settingsRes, kwRes, ecRes, lpRes] =
        await Promise.all([
          api<{
            topics: Topic[];
            deletedTopicHashes: string[];
            movedTopicHashes: string[];
          }>("/api/topics"),
          api<{ tasks: Task[] }>("/api/tasks"),
          api<{
            settings: Settings & {
              id: string;
              lastGeneratedAt: string | null;
              competitors: Competitor[];
            };
            serverConfigured: Store["serverConfigured"];
          }>("/api/settings"),
          api<{ keywords: Keyword[] }>("/api/keywords"),
          api<{ existingContent: ExistingContent[] }>(
            "/api/existing-content"
          ),
          api<{ livePages: LivePage[] }>("/api/live-pages")
        ]);
      const s = settingsRes.settings;
      set({
        topics: topicsRes.topics,
        deletedTopicHashes: topicsRes.deletedTopicHashes,
        movedTopicHashes: topicsRes.movedTopicHashes,
        tasks: tasksRes.tasks,
        keywords: kwRes.keywords || [],
        existingContent: ecRes.existingContent || [],
        livePages: lpRes.livePages || [],
        settings: {
          ...defaultSettings,
          companyName: s.companyName,
          websiteUrl: s.websiteUrl,
          brandNiche: s.brandNiche,
          brandAudience: s.brandAudience,
          productDescription: s.productDescription,
          valueProposition: s.valueProposition,
          brandVoice: s.brandVoice,
          primaryCta: s.primaryCta,
          primaryGeo: s.primaryGeo,
          seedKeywords: s.seedKeywords,
          topicsToAvoid: s.topicsToAvoid,
          openaiModel: s.openaiModel,
          geminiModel: s.geminiModel,
          anthropicModel:
            (s as unknown as { anthropicModel?: string }).anthropicModel ||
            "claude-haiku-4-5",
          primaryProvider:
            (s as unknown as { primaryProvider?: string }).primaryProvider ===
              "openai" ||
            (s as unknown as { primaryProvider?: string }).primaryProvider ===
              "gemini"
              ? ((s as unknown as { primaryProvider: "openai" | "gemini" })
                  .primaryProvider as "openai" | "gemini")
              : "auto",
          // Normalize each competitor's tier (legacy rows may be missing it).
          competitors: (s.competitors || []).map((c) => ({
            ...c,
            tier:
              c.tier === "primary" ||
              c.tier === "secondary" ||
              c.tier === "watch"
                ? c.tier
                : "secondary"
          }))
        },
        lastGeneratedAt: s.lastGeneratedAt,
        serverConfigured: settingsRes.serverConfigured,
        hydrated: true
      });
    } catch (err) {
      console.error("[store] hydrate failed:", err);
      // Still mark hydrated so UI doesn't block forever; show empty state.
      set({ hydrated: true });
    }
  },

  // ───────── Topics ─────────
  addTopics: async (incoming) => {
    const result = await api<{ added: number; skipped: number }>(
      "/api/topics",
      { method: "POST", json: { topics: incoming } }
    );
    // Refetch topics + memory to pick up new state.
    const refreshed = await api<{
      topics: Topic[];
      deletedTopicHashes: string[];
      movedTopicHashes: string[];
    }>("/api/topics");
    set({
      topics: refreshed.topics,
      deletedTopicHashes: refreshed.deletedTopicHashes,
      movedTopicHashes: refreshed.movedTopicHashes
    });
    return result;
  },

  deleteTopic: async (id) => {
    const prev = get().topics;
    const removed = prev.find((t) => t.id === id);
    // Optimistic
    set({ topics: prev.filter((t) => t.id !== id) });
    try {
      await api<{ ok: boolean; hash?: string }>(`/api/topics/${id}`, {
        method: "DELETE"
      });
      if (removed) {
        const h = topicHash(removed.title, removed.targetKeyword);
        set((s) => ({
          deletedTopicHashes: Array.from(new Set([...s.deletedTopicHashes, h]))
        }));
      }
    } catch (err) {
      set({ topics: prev });
      throw err;
    }
  },

  moveTopicToBoard: async (id) => {
    const prev = get().topics;
    const topic = prev.find((t) => t.id === id);
    if (!topic) return null;
    // Optimistic: remove from pool
    set({ topics: prev.filter((t) => t.id !== id) });
    try {
      const result = await api<{ taskId: string; hash: string }>(
        `/api/topics/${id}/move-to-board`,
        { method: "POST" }
      );
      // Refetch tasks to get the new card; tasks GET is small.
      const { tasks: rows } = await api<{ tasks: Task[] }>("/api/tasks");
      const created = rows.find((t) => t.id === result.taskId) || null;
      set((s) => ({
        tasks: rows,
        movedTopicHashes: Array.from(new Set([...s.movedTopicHashes, result.hash]))
      }));
      return created;
    } catch (err) {
      set({ topics: prev });
      throw err;
    }
  },

  // ───────── Tasks ─────────
  setTaskStatus: async (id, status) => {
    const prev = get().tasks;
    const wasNotDone =
      prev.find((t) => t.id === id)?.status !== "done";
    set({
      tasks: prev.map((t) =>
        t.id === id
          ? { ...t, status, updatedAt: new Date().toISOString() }
          : t
      )
    });
    try {
      await api(`/api/tasks/${id}`, {
        method: "PATCH",
        json: { status }
      });
      // Server auto-seeds a Live Page when a task hits "done" for the
      // first time. Refresh livePages so the user sees it immediately.
      if (status === "done" && wasNotDone) {
        void get().reloadLivePages();
      }
    } catch (err) {
      set({ tasks: prev });
      throw err;
    }
  },

  setTaskPriority: async (id, priority) => {
    const prev = get().tasks;
    set({
      tasks: prev.map((t) =>
        t.id === id
          ? {
              ...t,
              topic: { ...t.topic, priority },
              updatedAt: new Date().toISOString()
            }
          : t
      )
    });
    try {
      await api(`/api/tasks/${id}`, {
        method: "PATCH",
        json: { priority }
      });
    } catch (err) {
      set({ tasks: prev });
      throw err;
    }
  },

  addTaskTag: async (id, tag) => {
    const t = tag.trim();
    if (!t) return;
    const prev = get().tasks;
    const target = prev.find((x) => x.id === id);
    if (!target || target.tags.includes(t)) return;
    const newTags = [...target.tags, t];
    set({
      tasks: prev.map((x) =>
        x.id === id
          ? { ...x, tags: newTags, updatedAt: new Date().toISOString() }
          : x
      )
    });
    try {
      await api(`/api/tasks/${id}`, {
        method: "PATCH",
        json: { tags: newTags }
      });
    } catch (err) {
      set({ tasks: prev });
      throw err;
    }
  },

  removeTaskTag: async (id, tag) => {
    const prev = get().tasks;
    const target = prev.find((x) => x.id === id);
    if (!target) return;
    const newTags = target.tags.filter((x) => x !== tag);
    set({
      tasks: prev.map((x) =>
        x.id === id
          ? { ...x, tags: newTags, updatedAt: new Date().toISOString() }
          : x
      )
    });
    try {
      await api(`/api/tasks/${id}`, {
        method: "PATCH",
        json: { tags: newTags }
      });
    } catch (err) {
      set({ tasks: prev });
      throw err;
    }
  },

  setTaskContentStatus: async (id, contentStatus) => {
    const prev = get().tasks;
    set({
      tasks: prev.map((t) =>
        t.id === id
          ? { ...t, contentStatus, updatedAt: new Date().toISOString() }
          : t
      )
    });
    try {
      await api(`/api/tasks/${id}`, {
        method: "PATCH",
        json: { contentStatus }
      });
    } catch (err) {
      set({ tasks: prev });
      throw err;
    }
  },

  setTaskContent: async (id, content) => {
    const prev = get().tasks;
    const target = prev.find((t) => t.id === id);
    if (!target) return;
    const versions = target.contentVersions ? [...target.contentVersions] : [];
    if (target.content) versions.unshift(target.content);
    set({
      tasks: prev.map((t) =>
        t.id === id
          ? {
              ...t,
              content,
              contentVersions: versions.slice(0, 5),
              contentStatus: "completed",
              updatedAt: new Date().toISOString()
            }
          : t
      )
    });
    try {
      await api(`/api/tasks/${id}`, {
        method: "PATCH",
        json: { content, contentStatus: "completed" }
      });
    } catch (err) {
      set({ tasks: prev });
      throw err;
    }
  },

  selectTask: (id) => set({ selectedTaskId: id }),

  deleteTask: async (id) => {
    const prev = get().tasks;
    set({
      tasks: prev.filter((t) => t.id !== id),
      selectedTaskId: get().selectedTaskId === id ? null : get().selectedTaskId
    });
    try {
      await api(`/api/tasks/${id}`, { method: "DELETE" });
    } catch (err) {
      set({ tasks: prev });
      throw err;
    }
  },

  // ───────── Settings ─────────
  updateSettings: async (patch) => {
    const prev = get().settings;
    set({ settings: { ...prev, ...patch } });
    try {
      // Only persist the DB-backed fields. Keys are read-only on the client.
      const serverPatch: Record<string, unknown> = {};
      for (const k of [
        "companyName",
        "websiteUrl",
        "brandNiche",
        "brandAudience",
        "productDescription",
        "valueProposition",
        "brandVoice",
        "primaryCta",
        "primaryGeo",
        "seedKeywords",
        "topicsToAvoid",
        "openaiModel",
        "geminiModel",
        "anthropicModel",
        "primaryProvider"
      ] as const) {
        if (patch[k] !== undefined) serverPatch[k] = patch[k];
      }
      if (Object.keys(serverPatch).length > 0) {
        await api("/api/settings", { method: "PATCH", json: serverPatch });
      }
    } catch (err) {
      set({ settings: prev });
      throw err;
    }
  },

  addCompetitor: async (c) => {
    const prev = get().settings.competitors;
    const tier: Competitor["tier"] = c.tier || "secondary";
    try {
      const { id } = await api<{ id: string }>("/api/competitors", {
        method: "POST",
        json: { ...c, tier }
      });
      set((s) => ({
        settings: {
          ...s.settings,
          competitors: [...prev, { id, ...c, tier }]
        }
      }));
    } catch (err) {
      throw err;
    }
  },

  updateCompetitor: async (id, patch) => {
    const prev = get().settings.competitors;
    set((s) => ({
      settings: {
        ...s.settings,
        competitors: prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
      }
    }));
    try {
      await api(`/api/competitors/${id}`, { method: "PATCH", json: patch });
    } catch (err) {
      set((s) => ({ settings: { ...s.settings, competitors: prev } }));
      throw err;
    }
  },

  removeCompetitor: async (id) => {
    const prev = get().settings.competitors;
    set((s) => ({
      settings: {
        ...s.settings,
        competitors: prev.filter((c) => c.id !== id)
      }
    }));
    try {
      await api(`/api/competitors/${id}`, { method: "DELETE" });
    } catch (err) {
      set((s) => ({ settings: { ...s.settings, competitors: prev } }));
      throw err;
    }
  },

  // ───────── Keywords ─────────
  addKeyword: async (k) => {
    try {
      const { id } = await api<{ id: string }>("/api/keywords", {
        method: "POST",
        json: k
      });
      const now = new Date().toISOString();
      set((s) => ({
        keywords: [{ id, ...k, createdAt: now, updatedAt: now }, ...s.keywords]
      }));
    } catch (err) {
      throw err;
    }
  },

  updateKeyword: async (id, patch) => {
    const prev = get().keywords;
    set({
      keywords: prev.map((k) =>
        k.id === id
          ? { ...k, ...patch, updatedAt: new Date().toISOString() }
          : k
      )
    });
    try {
      await api(`/api/keywords/${id}`, { method: "PATCH", json: patch });
    } catch (err) {
      set({ keywords: prev });
      throw err;
    }
  },

  removeKeyword: async (id) => {
    const prev = get().keywords;
    set({ keywords: prev.filter((k) => k.id !== id) });
    try {
      await api(`/api/keywords/${id}`, { method: "DELETE" });
    } catch (err) {
      set({ keywords: prev });
      throw err;
    }
  },

  // ───────── Existing content ─────────
  addExistingContent: async (c) => {
    const prev = get().existingContent;
    try {
      await api("/api/existing-content", { method: "POST", json: c });
      // Refetch so we get the canonical id back without a roundtrip wrapper.
      const { existingContent: rows } = await api<{
        existingContent: ExistingContent[];
      }>("/api/existing-content");
      set({ existingContent: rows });
    } catch (err) {
      set({ existingContent: prev });
      throw err;
    }
  },

  updateExistingContent: async (id, patch) => {
    const prev = get().existingContent;
    set({
      existingContent: prev.map((c) =>
        c.id === id ? { ...c, ...patch } : c
      )
    });
    try {
      await api(`/api/existing-content/${id}`, {
        method: "PATCH",
        json: patch
      });
    } catch (err) {
      set({ existingContent: prev });
      throw err;
    }
  },

  removeExistingContent: async (id) => {
    const prev = get().existingContent;
    set({ existingContent: prev.filter((c) => c.id !== id) });
    try {
      await api(`/api/existing-content/${id}`, { method: "DELETE" });
    } catch (err) {
      set({ existingContent: prev });
      throw err;
    }
  },

  importSitemap: async (sitemapUrl) => {
    const result = await api<{
      imported: number;
      skipped: number;
      sampled: number;
      truncated?: boolean;
      sitemapUrl?: string;
    }>("/api/existing-content/import-sitemap", {
      method: "POST",
      json: { sitemapUrl }
    });
    const { existingContent: rows } = await api<{
      existingContent: ExistingContent[];
    }>("/api/existing-content");
    set({ existingContent: rows });
    return result;
  },

  refreshSitemap: async (sitemapUrl) => {
    const result = await api<{
      added: number;
      removed: Array<{ id: string; url: string; title: string }>;
      sampled: number;
      truncated?: boolean;
      sitemapUrl?: string;
    }>("/api/existing-content/refresh-sitemap", {
      method: "POST",
      json: { sitemapUrl }
    });
    const { existingContent: rows } = await api<{
      existingContent: ExistingContent[];
    }>("/api/existing-content");
    set({ existingContent: rows });
    return result;
  },

  enrichTitles: async (ids) => {
    if (ids.length === 0)
      return { processed: 0, enriched: 0, failed: 0 };
    const result = await api<{
      processed: number;
      enriched: number;
      failed: number;
    }>("/api/existing-content/enrich-titles", {
      method: "POST",
      json: { ids }
    });
    // Refetch just the affected rows is expensive — easier to refetch all.
    const { existingContent: rows } = await api<{
      existingContent: ExistingContent[];
    }>("/api/existing-content");
    set({ existingContent: rows });
    return result;
  },

  bulkDeleteExistingContent: async (ids) => {
    if (ids.length === 0) return;
    const prev = get().existingContent;
    const toDelete = new Set(ids);
    set({ existingContent: prev.filter((c) => !toDelete.has(c.id)) });
    try {
      await api("/api/existing-content/bulk-delete", {
        method: "POST",
        json: { ids }
      });
    } catch (err) {
      set({ existingContent: prev });
      throw err;
    }
  },

  // ───────── Live Pages ─────────
  // We also refetch the list after a task transitions to "done" since the
  // server auto-creates a row in that case. Components can call
  // reloadLivePages() to pick that up.
  reloadLivePages: async () => {
    try {
      const { livePages: rows } = await api<{ livePages: LivePage[] }>(
        "/api/live-pages"
      );
      set({ livePages: rows });
    } catch (err) {
      console.error("[store] reloadLivePages failed:", err);
    }
  },

  addLivePage: async (p) => {
    try {
      await api("/api/live-pages", { method: "POST", json: p });
      const { livePages: rows } = await api<{ livePages: LivePage[] }>(
        "/api/live-pages"
      );
      set({ livePages: rows });
    } catch (err) {
      throw err;
    }
  },

  updateLivePage: async (id, patch) => {
    const prev = get().livePages;
    set({
      livePages: prev.map((p) =>
        p.id === id
          ? { ...p, ...patch, updatedAt: new Date().toISOString() }
          : p
      )
    });
    try {
      await api(`/api/live-pages/${id}`, { method: "PATCH", json: patch });
    } catch (err) {
      set({ livePages: prev });
      throw err;
    }
  },

  removeLivePage: async (id) => {
    const prev = get().livePages;
    set({ livePages: prev.filter((p) => p.id !== id) });
    try {
      await api(`/api/live-pages/${id}`, { method: "DELETE" });
    } catch (err) {
      set({ livePages: prev });
      throw err;
    }
  },

  setLastGeneratedAt: async (iso) => {
    set({ lastGeneratedAt: iso });
    try {
      await api("/api/settings", {
        method: "PATCH",
        json: { lastGeneratedAt: iso }
      });
    } catch {
      /* non-critical */
    }
  }
}));

export function useHasHydrated() {
  return useStore((s) => s.hydrated);
}

// Suppress unused-import warning for uid (kept for symmetry / future use).
void uid;
