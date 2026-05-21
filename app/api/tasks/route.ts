import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { withAuth, serverError } from "@/lib/api";
import { rowToTask } from "@/lib/db-mappers";

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
