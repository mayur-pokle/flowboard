import { NextResponse } from "next/server";
import { desc, ne } from "drizzle-orm";
import { db } from "@/db";
import { discoveredOpportunities } from "@/db/schema";
import { withAuth, serverError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/discoveries
// Returns all opportunities that haven't been dismissed, ordered by
// score descending so the most actionable rows come first.

export const GET = withAuth(async () => {
  try {
    const rows = await db
      .select()
      .from(discoveredOpportunities)
      .where(ne(discoveredOpportunities.status, "dismissed"))
      .orderBy(desc(discoveredOpportunities.score));
    return NextResponse.json({
      opportunities: rows.map((r) => ({
        id: r.id,
        source: r.source,
        query: r.query,
        url: r.url,
        metrics: r.metrics,
        score: r.score,
        status: r.status,
        reason: r.reason,
        movedToTaskId: r.movedToTaskId,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString()
      }))
    });
  } catch (err) {
    return serverError(err);
  }
});
