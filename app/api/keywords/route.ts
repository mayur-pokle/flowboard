import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { keywords } from "@/db/schema";
import { withAuth, badRequest, serverError } from "@/lib/api";
import { uid } from "@/lib/utils";
import type {
  Keyword,
  KeywordPriority,
  KeywordStatus,
  SearchIntentType
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIORITIES: KeywordPriority[] = ["P0", "P1", "P2"];
const STATUSES: KeywordStatus[] = [
  "targeting",
  "ranking",
  "won",
  "abandoned"
];
const INTENTS: SearchIntentType[] = [
  "informational",
  "commercial",
  "transactional",
  "navigational"
];

function rowToKeyword(r: typeof keywords.$inferSelect): Keyword {
  return {
    id: r.id,
    keyword: r.keyword,
    priority: (PRIORITIES.includes(r.priority as KeywordPriority)
      ? r.priority
      : "P1") as KeywordPriority,
    intent: (INTENTS.includes(r.intent as SearchIntentType)
      ? r.intent
      : "informational") as SearchIntentType,
    status: (STATUSES.includes(r.status as KeywordStatus)
      ? r.status
      : "targeting") as KeywordStatus,
    searchVolume: r.searchVolume ?? undefined,
    difficulty: r.difficulty ?? undefined,
    targetUrl: r.targetUrl ?? undefined,
    notes: r.notes ?? "",
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString()
  };
}

export const GET = withAuth(async () => {
  try {
    const rows = await db
      .select()
      .from(keywords)
      .orderBy(desc(keywords.createdAt));
    return NextResponse.json({ keywords: rows.map(rowToKeyword) });
  } catch (err) {
    return serverError(err);
  }
});

export const POST = withAuth(async (_user, req) => {
  try {
    const body = await req.json();

    // ── Bulk mode ──
    // When body.keywords is an array, insert them in one request. Used
    // by the "Suggest keywords" flow which produces 20+ at once.
    // Duplicates against existing bank (case-insensitive) are skipped
    // rather than failing the batch.
    if (Array.isArray(body.keywords)) {
      const incoming = body.keywords as Array<Record<string, unknown>>;
      if (incoming.length === 0)
        return NextResponse.json({ inserted: 0, skipped: 0, ids: [] });

      const existingRows = await db.select().from(keywords);
      const existingLower = new Set(
        existingRows.map((r) => r.keyword.toLowerCase().trim())
      );
      const values: Array<typeof keywords.$inferInsert> = [];
      const insertedIds: string[] = [];
      const seenInBatch = new Set<string>();
      let skipped = 0;
      for (const item of incoming) {
        const kw =
          typeof item.keyword === "string" ? item.keyword.trim() : "";
        if (!kw) {
          skipped += 1;
          continue;
        }
        const lower = kw.toLowerCase();
        if (existingLower.has(lower) || seenInBatch.has(lower)) {
          skipped += 1;
          continue;
        }
        seenInBatch.add(lower);
        const id = uid("kw");
        insertedIds.push(id);
        values.push({
          id,
          keyword: kw,
          priority: PRIORITIES.includes(item.priority as KeywordPriority)
            ? (item.priority as KeywordPriority)
            : "P1",
          intent: INTENTS.includes(item.intent as SearchIntentType)
            ? (item.intent as SearchIntentType)
            : "informational",
          status: STATUSES.includes(item.status as KeywordStatus)
            ? (item.status as KeywordStatus)
            : "targeting",
          searchVolume:
            typeof item.searchVolume === "number"
              ? item.searchVolume
              : null,
          difficulty:
            typeof item.difficulty === "number" ? item.difficulty : null,
          targetUrl:
            typeof item.targetUrl === "string"
              ? item.targetUrl.trim()
              : null,
          notes:
            typeof item.notes === "string" ? item.notes.trim() : ""
        });
      }
      if (values.length > 0) {
        await db.insert(keywords).values(values);
      }
      return NextResponse.json({
        inserted: values.length,
        skipped,
        ids: insertedIds
      });
    }

    // ── Single mode (legacy) ──
    const keyword =
      typeof body.keyword === "string" ? body.keyword.trim() : "";
    if (!keyword) return badRequest("Keyword is required");

    const priority: KeywordPriority = PRIORITIES.includes(body.priority)
      ? body.priority
      : "P1";
    const intent: SearchIntentType = INTENTS.includes(body.intent)
      ? body.intent
      : "informational";
    const status: KeywordStatus = STATUSES.includes(body.status)
      ? body.status
      : "targeting";

    const id = uid("kw");
    await db.insert(keywords).values({
      id,
      keyword,
      priority,
      intent,
      status,
      searchVolume:
        typeof body.searchVolume === "number" ? body.searchVolume : null,
      difficulty:
        typeof body.difficulty === "number" ? body.difficulty : null,
      targetUrl:
        typeof body.targetUrl === "string" ? body.targetUrl.trim() : null,
      notes: typeof body.notes === "string" ? body.notes.trim() : ""
    });
    return NextResponse.json({ id });
  } catch (err) {
    return serverError(err);
  }
});
