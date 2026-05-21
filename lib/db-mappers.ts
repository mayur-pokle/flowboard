import type { tasks } from "@/db/schema";
import type { Task } from "@/lib/types";

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
