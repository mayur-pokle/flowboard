import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { analyzedTopics } from "@/db/schema";
import { withAuth, serverError, badRequest } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_COLUMNS = ["draft", "analyzed", "approved", "archived"] as const;

// GET /api/analyzer/[id]
export const GET = withAuth(
  async (_user, _req, ctx: { params: { id: string } }) => {
    try {
      const [row] = await db
        .select()
        .from(analyzedTopics)
        .where(eq(analyzedTopics.id, ctx.params.id))
        .limit(1);
      if (!row) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({
        topic: {
          id: row.id,
          title: row.title,
          targetKeyword: row.targetKeyword,
          notes: row.notes,
          kanbanColumn: row.kanbanColumn,
          analysis: row.analysis,
          enrichment: row.enrichment,
          promotedToTaskId: row.promotedToTaskId,
          promotedToDiscoveryId: row.promotedToDiscoveryId,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString()
        }
      });
    } catch (err) {
      return serverError(err);
    }
  }
);

// PATCH /api/analyzer/[id]
// Update column (Kanban move), notes, or title.
export const PATCH = withAuth(
  async (_user, req, ctx: { params: { id: string } }) => {
    try {
      const body = await req.json().catch(() => ({}));
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (
        typeof body.kanbanColumn === "string" &&
        (ALLOWED_COLUMNS as readonly string[]).includes(body.kanbanColumn)
      ) {
        patch.kanbanColumn = body.kanbanColumn;
      }
      if (typeof body.notes === "string") {
        patch.notes = body.notes.trim().slice(0, 2000);
      }
      if (typeof body.title === "string" && body.title.trim().length >= 5) {
        patch.title = body.title.trim().slice(0, 200);
      }
      if (typeof body.targetKeyword === "string") {
        patch.targetKeyword = body.targetKeyword.trim().slice(0, 100) || null;
      }
      if (Object.keys(patch).length === 1) {
        return badRequest("Nothing to update.");
      }
      await db
        .update(analyzedTopics)
        .set(patch)
        .where(eq(analyzedTopics.id, ctx.params.id));
      return NextResponse.json({ ok: true });
    } catch (err) {
      return serverError(err);
    }
  }
);

// DELETE /api/analyzer/[id]
export const DELETE = withAuth(
  async (_user, _req, ctx: { params: { id: string } }) => {
    try {
      await db
        .delete(analyzedTopics)
        .where(eq(analyzedTopics.id, ctx.params.id));
      return NextResponse.json({ ok: true });
    } catch (err) {
      return serverError(err);
    }
  }
);
