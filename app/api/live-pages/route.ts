import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { livePages } from "@/db/schema";
import { withAuth, badRequest, serverError } from "@/lib/api";
import { uid } from "@/lib/utils";
import type {
  ContentType,
  LivePage,
  LivePageStatus,
  Topic
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES: LivePageStatus[] = [
  "scheduled",
  "published",
  "updating",
  "needs_refresh",
  "retired"
];
const TYPES: ContentType[] = [
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
    contentType: (TYPES.includes(r.contentType as ContentType)
      ? r.contentType
      : "Guide") as ContentType,
    status: (STATUSES.includes(r.status as LivePageStatus)
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

export const GET = withAuth(async () => {
  try {
    const rows = await db
      .select()
      .from(livePages)
      .orderBy(desc(livePages.createdAt));
    return NextResponse.json({ livePages: rows.map(rowToLivePage) });
  } catch (err) {
    return serverError(err);
  }
});

// POST creates an empty (or partially-filled) live page. Auto-create
// from a task is handled in /api/tasks/[id] PATCH when status flips to done.
export const POST = withAuth(async (user, req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const title =
      typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return badRequest("Title is required");

    const status: LivePageStatus = STATUSES.includes(body.status)
      ? body.status
      : "scheduled";
    const contentType: ContentType = TYPES.includes(body.contentType)
      ? body.contentType
      : "Guide";

    const id = uid("lp");
    await db.insert(livePages).values({
      id,
      taskId: typeof body.taskId === "string" ? body.taskId : null,
      topicSnapshot: body.topicSnapshot ?? null,
      title,
      url: typeof body.url === "string" ? body.url.trim() : "",
      metaTitle:
        typeof body.metaTitle === "string" ? body.metaTitle.trim() : "",
      metaDescription:
        typeof body.metaDescription === "string"
          ? body.metaDescription.trim()
          : "",
      targetKeyword:
        typeof body.targetKeyword === "string"
          ? body.targetKeyword.trim()
          : "",
      searchIntent:
        typeof body.searchIntent === "string"
          ? body.searchIntent.trim()
          : "",
      contentType,
      status,
      publishDate:
        typeof body.publishDate === "string" && body.publishDate
          ? new Date(body.publishDate)
          : null,
      owner: typeof body.owner === "string" ? body.owner.trim() : "",
      monthlyTraffic:
        typeof body.monthlyTraffic === "number"
          ? body.monthlyTraffic
          : null,
      rankingPosition:
        typeof body.rankingPosition === "number"
          ? body.rankingPosition
          : null,
      searchVolume:
        typeof body.searchVolume === "number" ? body.searchVolume : null,
      keywordDifficulty:
        typeof body.keywordDifficulty === "number"
          ? body.keywordDifficulty
          : null,
      backlinks:
        typeof body.backlinks === "number" ? body.backlinks : null,
      conversions:
        typeof body.conversions === "number" ? body.conversions : null,
      notes: typeof body.notes === "string" ? body.notes : "",
      tags: Array.isArray(body.tags)
        ? body.tags.filter((t: unknown) => typeof t === "string")
        : [],
      createdByUserId: user.id
    });
    return NextResponse.json({ id });
  } catch (err) {
    return serverError(err);
  }
});
