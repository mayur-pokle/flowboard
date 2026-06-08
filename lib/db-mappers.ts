import type { livePages, tasks } from "@/db/schema";
import type {
  ContentType,
  GeneratedContent,
  LivePage,
  LivePageStatus,
  Task,
  Topic
} from "@/lib/types";

// Defensive normalizer — legacy rows in the DB may have content set but
// missing some array fields (faqs, internalLinks, ctaPlacements) or
// scalar fields. Calling `.length` on undefined would crash the client
// render. This ensures every field we touch in UI code is present.
function normalizeContent(c: unknown): GeneratedContent | undefined {
  if (!c || typeof c !== "object") return undefined;
  const obj = c as Record<string, unknown>;
  const faqs = Array.isArray(obj.faqs)
    ? (obj.faqs as Array<Record<string, unknown>>)
        .map((f) => ({ q: String(f?.q ?? ""), a: String(f?.a ?? "") }))
        .filter((f) => f.q || f.a)
    : [];
  const internalLinks = Array.isArray(obj.internalLinks)
    ? (obj.internalLinks as unknown[]).map(String).filter(Boolean)
    : [];
  const ctaPlacements = Array.isArray(obj.ctaPlacements)
    ? (obj.ctaPlacements as unknown[]).map(String).filter(Boolean)
    : [];
  const body = typeof obj.body === "string" ? obj.body : "";
  const wordCount =
    typeof obj.wordCount === "number"
      ? obj.wordCount
      : body.split(/\s+/).filter(Boolean).length;
  return {
    metaTitle: String(obj.metaTitle ?? ""),
    metaDescription: String(obj.metaDescription ?? ""),
    urlSlug: String(obj.urlSlug ?? ""),
    schemaJsonLd: String(obj.schemaJsonLd ?? ""),
    body,
    internalLinks,
    ctaPlacements,
    faqs,
    wordCount
  };
}

export function rowToTask(r: typeof tasks.$inferSelect): Task {
  const versions = Array.isArray(r.contentVersions)
    ? (r.contentVersions as unknown[])
        .map(normalizeContent)
        .filter((v): v is GeneratedContent => Boolean(v))
    : undefined;
  return {
    id: r.id,
    topicId: r.topicId ?? "",
    topic: r.topicSnapshot as Task["topic"],
    status: r.status as Task["status"],
    tags: (r.tags ?? []) as string[],
    contentStatus: r.contentStatus as Task["contentStatus"],
    content: normalizeContent(r.content),
    contentVersions: versions,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString()
  };
}

// ── Live Pages ────────────────────────────────────────────────────
// Kept in db-mappers (not in the route file) because Next.js refuses any
// non-Route export from app/api/.../route.ts files at build time.

const LIVE_PAGE_STATUSES: LivePageStatus[] = [
  "scheduled",
  "published",
  "updating",
  "needs_refresh",
  "retired"
];

const LIVE_PAGE_CONTENT_TYPES: ContentType[] = [
  "Calculator",
  "Template",
  "Guide",
  "Whitepaper",
  "Checklist",
  "Framework"
];

export function rowToLivePage(
  r: typeof livePages.$inferSelect
): LivePage {
  return {
    id: r.id,
    taskId: r.taskId ?? undefined,
    topicSnapshot: (r.topicSnapshot ?? undefined) as Topic | undefined,
    title: r.title,
    url: r.url,
    metaTitle: r.metaTitle,
    metaDescription: r.metaDescription,
    targetKeyword: r.targetKeyword,
    searchIntent: r.searchIntent,
    contentType: (LIVE_PAGE_CONTENT_TYPES.includes(
      r.contentType as ContentType
    )
      ? r.contentType
      : "Guide") as ContentType,
    status: (LIVE_PAGE_STATUSES.includes(r.status as LivePageStatus)
      ? r.status
      : "scheduled") as LivePageStatus,
    publishDate: r.publishDate ? r.publishDate.toISOString() : undefined,
    lastReviewedDate: r.lastReviewedDate
      ? r.lastReviewedDate.toISOString()
      : undefined,
    owner: r.owner,
    monthlyTraffic: r.monthlyTraffic ?? undefined,
    rankingPosition: r.rankingPosition ?? undefined,
    searchVolume: r.searchVolume ?? undefined,
    keywordDifficulty: r.keywordDifficulty ?? undefined,
    backlinks: r.backlinks ?? undefined,
    conversions: r.conversions ?? undefined,
    notes: r.notes,
    tags: (r.tags ?? []) as string[],
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString()
  };
}
