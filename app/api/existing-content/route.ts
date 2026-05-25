import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { existingContent } from "@/db/schema";
import { withAuth, badRequest, serverError } from "@/lib/api";
import { uid } from "@/lib/utils";
import type { ExistingContent, SearchIntentType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INTENTS: SearchIntentType[] = [
  "informational",
  "commercial",
  "transactional",
  "navigational"
];

function rowToExisting(
  r: typeof existingContent.$inferSelect
): ExistingContent {
  return {
    id: r.id,
    url: r.url,
    title: r.title,
    targetKeyword: r.targetKeyword ?? "",
    intent: (INTENTS.includes(r.intent as SearchIntentType)
      ? r.intent
      : "") as ExistingContent["intent"],
    publishedDate: r.publishedDate
      ? r.publishedDate.toISOString()
      : undefined,
    notes: r.notes ?? "",
    sourceSitemapUrl: r.sourceSitemapUrl ?? undefined,
    enrichedAt: r.enrichedAt ? r.enrichedAt.toISOString() : undefined,
    createdAt: r.createdAt.toISOString()
  };
}

export const GET = withAuth(async () => {
  try {
    const rows = await db
      .select()
      .from(existingContent)
      .orderBy(desc(existingContent.createdAt));
    return NextResponse.json({ existingContent: rows.map(rowToExisting) });
  } catch (err) {
    return serverError(err);
  }
});

export const POST = withAuth(async (_user, req) => {
  try {
    const body = await req.json();
    // Support either single insert or bulk via { items: [...] }.
    const items: Array<Record<string, unknown>> = Array.isArray(body?.items)
      ? body.items
      : [body];
    const rows = items
      .map((item) => {
        const url =
          typeof item.url === "string" ? item.url.trim() : "";
        const title =
          typeof item.title === "string" ? item.title.trim() : "";
        if (!url || !title) return null;
        const intent = INTENTS.includes(item.intent as SearchIntentType)
          ? (item.intent as string)
          : "";
        return {
          id: uid("ec"),
          url,
          title,
          targetKeyword:
            typeof item.targetKeyword === "string"
              ? item.targetKeyword.trim()
              : "",
          intent,
          publishedDate:
            typeof item.publishedDate === "string" && item.publishedDate
              ? new Date(item.publishedDate)
              : null,
          notes:
            typeof item.notes === "string" ? item.notes.trim() : ""
        };
      })
      .filter(
        (
          x
        ): x is {
          id: string;
          url: string;
          title: string;
          targetKeyword: string;
          intent: string;
          publishedDate: Date | null;
          notes: string;
        } => Boolean(x)
      );
    if (rows.length === 0)
      return badRequest("Provide a url and title (or items array).");

    await db
      .insert(existingContent)
      .values(rows)
      .onConflictDoNothing();
    return NextResponse.json({ inserted: rows.length });
  } catch (err) {
    return serverError(err);
  }
});
