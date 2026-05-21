import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { withAuth, serverError } from "@/lib/api";
import type { Task } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth(async () => {
  try {
    const rows = await db.select().from(tasks).orderBy(desc(tasks.createdAt));
    return NextResponse.json({ tasks: rows.map(rowToTask) });
  } catch (err) {
    return serverError(err);
  }
});

export function rowToTask(r: typeof tasks.$inferSelect): Task {
  return {
    id: r.id,
    topicId: r.topicId ?? "",
    topic: r.topicSnapshot as Task["topic"],
    status: r.status as Task["status"],
    tags: (r.tags ?? []) as string[],
    contentStatus: r.contentStatus as Task["contentStatus"],
    content: (r.content ?? undefined) as Task["content"],
    contentVersions:
      (r.contentVersions ?? undefined) as Task["contentVersions"],
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString()
  };
}
