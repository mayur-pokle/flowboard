import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { discoveredOpportunities } from "@/db/schema";
import { withAuth, serverError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Allowed legacy/CRM status strings — kept lenient so old rows still PATCH.
const ALLOWED_STATUS = [
  "new",
  "triaging",
  "briefed",
  "in_progress",
  "published",
  "archived",
  "moved",
  "dismissed"
] as const;

const ALLOWED_COLUMN = [
  "intake",
  "new",
  "in_progress",
  "done",
  "rejected"
] as const;

const ALLOWED_TYPE = ["new", "refresh", "community"] as const;

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
    kanbanColumn: r.kanbanColumn ?? "intake",
    opportunityType: r.opportunityType ?? "new",
    priority: r.priority ?? "P1",
    trending: r.trending ?? false,
    weeklyImpressions: r.weeklyImpressions ?? 0,
    previousWeekImpressions: r.previousWeekImpressions ?? 0,
    competitorUrls: r.competitorUrls ?? [],
    competitorGapScore: r.competitorGapScore ?? 0,
    aiCitationsCited: r.aiCitationsCited ?? [],
    cannibalizingPages: r.cannibalizingPages ?? [],
    briefData: r.briefData ?? null,
    contentChecks: r.contentChecks ?? null,
    isSample: r.isSample ?? false,
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
      if (
        typeof body.kanbanColumn === "string" &&
        (ALLOWED_COLUMN as readonly string[]).includes(body.kanbanColumn)
      ) {
        patch.kanbanColumn = body.kanbanColumn;
      }
      if (
        typeof body.opportunityType === "string" &&
        (ALLOWED_TYPE as readonly string[]).includes(body.opportunityType)
      ) {
        patch.opportunityType = body.opportunityType;
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
