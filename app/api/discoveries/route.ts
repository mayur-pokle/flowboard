import { NextResponse } from "next/server";
import { and, desc, ne } from "drizzle-orm";
import { db } from "@/db";
import { discoveredOpportunities } from "@/db/schema";
import { withAuth, serverError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/discoveries
// Returns all opportunities except archived/dismissed ones, ordered by
// score descending so the most actionable rows come first. Maps DB
// rows to the API shape the Opportunities Board expects, including the
// new 4-pillar score breakdown + intent + AI citation gap flag.

export const GET = withAuth(async () => {
  try {
    const rows = await db
      .select()
      .from(discoveredOpportunities)
      .where(
        and(
          ne(discoveredOpportunities.status, "archived"),
          ne(discoveredOpportunities.status, "dismissed")
        )
      )
      .orderBy(desc(discoveredOpportunities.score));
    return NextResponse.json({
      opportunities: rows.map((r) => ({
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
        briefGeneratedAt: r.briefGeneratedAt
          ? r.briefGeneratedAt.toISOString()
          : null,
        contentGeneratedAt: r.contentGeneratedAt
          ? r.contentGeneratedAt.toISOString()
          : null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString()
      }))
    });
  } catch (err) {
    return serverError(err);
  }
});
