import { NextResponse } from "next/server";
import { and, desc, ne } from "drizzle-orm";
import { db } from "@/db";
import { discoveredOpportunities } from "@/db/schema";
import { withAuth, serverError } from "@/lib/api";
import { ensureSchema } from "@/lib/migrate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/discoveries
// Returns every opportunity except hard-archived ones, projected for
// the new Kanban surface. The board groups by kanbanColumn so we
// include that field; cards render the type / priority / signals
// without needing a second lookup.
//
// Pass ?includeRejected=true to ALSO include rejected rows — used by
// the Rejected (N) count and the undo flow.

export const GET = withAuth(async (_user, req) => {
  try {
    // Eager schema sync — protects against deploys where new columns
    // haven't landed in production yet.
    await ensureSchema().catch(() => {});

    const url = new URL(req.url);
    const includeRejected = url.searchParams.get("includeRejected") === "true";

    const rows = await db
      .select()
      .from(discoveredOpportunities)
      .where(
        and(
          ne(discoveredOpportunities.status, "dismissed")
          // Note: we keep "archived"/"rejected" rows in the DB even
          // when not surfaced — the rejection is recoverable.
        )
      )
      .orderBy(desc(discoveredOpportunities.score));

    const filtered = includeRejected
      ? rows
      : rows.filter((r) => r.kanbanColumn !== "rejected");

    return NextResponse.json({
      opportunities: filtered.map((r) => ({
        id: r.id,
        source: r.source,
        query: r.query,
        url: r.url,
        metrics: r.metrics,
        score: r.score,
        scoreBreakdown: r.scoreBreakdown ?? null,
        intent: r.intent ?? null,
        aiCitationGap: r.aiCitationGap ?? false,
        // Pipeline state
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
        // CRITICAL: the panel renders off briefMarkdown / contentMarkdown.
        // Without these two fields, reopening a card with a generated brief
        // showed an empty body even though briefData was populated.
        briefMarkdown: r.briefMarkdown ?? null,
        contentMarkdown: r.contentMarkdown ?? null,
        contentChecks: r.contentChecks ?? null,
        isSample: r.isSample ?? false,
        // Legacy
        status: r.status,
        reason: r.reason,
        movedToTaskId: r.movedToTaskId,
        linkedTaskId: r.linkedTaskId ?? null,
        briefGeneratedAt: r.briefGeneratedAt
          ? r.briefGeneratedAt.toISOString()
          : null,
        contentGeneratedAt: r.contentGeneratedAt
          ? r.contentGeneratedAt.toISOString()
          : null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString()
      })),
      // Count rejected rows separately for the "Rejected (N)" link.
      rejectedCount: rows.filter((r) => r.kanbanColumn === "rejected").length,
      sampleCount: rows.filter((r) => r.isSample).length
    });
  } catch (err) {
    return serverError(err);
  }
});
