"use client";

import { create } from "zustand";
import type {
  AppState,
  Competitor,
  GeneratedContent,
  Settings,
  Status,
  Task,
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
  addCompetitor: (c: Omit<Competitor, "id">) => Promise<void>;
  updateCompetitor: (
    id: string,
    patch: Partial<Omit<Competitor, "id">>
  ) => Promise<void>;
  removeCompetitor: (id: string) => Promise<void>;

  // Bookkeeping
  setLastGeneratedAt: (iso: string) => Promise<void>;

  // Server-configured providers (read-only — set by Vercel env)
  serverConfigured: {
    openaiKey: boolean;
    geminiKey: boolean;
    slackWebhook: boolean;
  };
}

const defaultSettings: Settings = {
  // AI / integrations — these are server-only now; client values are unused.
  openaiKey: "",
  openaiModel: "gpt-4o-mini",
  geminiKey: "",
  geminiModel: "gemini-1.5-flash-latest",
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
  serverConfigured: { openaiKey: false, geminiKey: false, slackWebhook: false },

  hydrate: async () => {
    try {
      const [topicsRes, tasksRes, settingsRes] = await Promise.all([
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
        }>("/api/settings")
      ]);
      const s = settingsRes.settings;
      set({
        topics: topicsRes.topics,
        deletedTopicHashes: topicsRes.deletedTopicHashes,
        movedTopicHashes: topicsRes.movedTopicHashes,
        tasks: tasksRes.tasks,
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
          primaryProvider:
            (s as unknown as { primaryProvider?: string }).primaryProvider ===
              "openai" ||
            (s as unknown as { primaryProvider?: string }).primaryProvider ===
              "gemini"
              ? ((s as unknown as { primaryProvider: "openai" | "gemini" })
                  .primaryProvider as "openai" | "gemini")
              : "auto",
          competitors: s.competitors || []
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
    try {
      const { id } = await api<{ id: string }>("/api/competitors", {
        method: "POST",
        json: c
      });
      set((s) => ({
        settings: {
          ...s.settings,
          competitors: [...prev, { id, ...c }]
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
