import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { discoveredOpportunities } from "@/db/schema";
import { withAuth, serverError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Status values mirror the CRM-style pipeline. Old "moved" and
// "dismissed" values are still accepted so legacy rows don't blow up.
const ALLOWED_STATUS = [
  "new",
  "triaging",
  "briefed",
  "in_progress",
  "published",
  "archived",
  // legacy:
  "moved",
  "dismissed"
] as const;

function rowToApi(r: typeof discoveredOpportunities.$inferSelect) {
  return {
    id: r.id,
    source: r.source,
    query: r.query,
    url: r.url,
    metrics: r.metrics,
    score: r.score,
    scoreBreakdown: r.scoreBreakdown ?? null,
    intent: r.intent ?? null,
    aiCitationGap: r.aiCitationGap ?? false,
    status: r.status,
    reason: r.reason,
    movedToTaskId: r.movedToTaskId,
    linkedTaskId: r.linkedTaskId ?? null,
    briefMarkdown: r.briefMarkdown ?? null,
    briefGeneratedAt: r.briefGeneratedAt
      ? r.briefGeneratedAt.toISOString()
      : null,
    contentMarkdown: r.contentMarkdown ?? null,
    contentGeneratedAt: r.contentGeneratedAt
      ? r.contentGeneratedAt.toISOString()
      : null,
    qualitySignals: r.qualitySignals ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString()
  };
}

export const GET = withAuth(
  async (_user, _req, ctx: { params: { id: string } }) => {
    try {
      const [row] = await db
        .select()
        .from(discoveredOpportunities)
        .where(eq(discoveredOpportunities.id, ctx.params.id))
        .limit(1);
      if (!row) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ opportunity: rowToApi(row) });
    } catch (err) {
      return serverError(err);
    }
  }
);

export const PATCH = withAuth(
  async (_user, req, ctx: { params: { id: string } }) => {
    try {
      const body = await req.json().catch(() => ({}));
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (
        typeof body.status === "string" &&
        (ALLOWED_STATUS as readonly string[]).includes(body.status)
      ) {
        patch.status = body.status;
      }
      if (typeof body.movedToTaskId === "string") {
        patch.movedToTaskId = body.movedToTaskId;
      }
      if (typeof body.linkedTaskId === "string") {
        patch.linkedTaskId = body.linkedTaskId;
      }
      await db
        .update(discoveredOpportunities)
        .set(patch)
        .where(eq(discoveredOpportunities.id, ctx.params.id));
      return NextResponse.json({ ok: true });
    } catch (err) {
      return serverError(err);
    }
  }
);

export const DELETE = withAuth(
  async (_user, _req, ctx: { params: { id: string } }) => {
    try {
      await db
        .delete(discoveredOpportunities)
        .where(eq(discoveredOpportunities.id, ctx.params.id));
      return NextResponse.json({ ok: true });
    } catch (err) {
      return serverError(err);
    }
  }
);
