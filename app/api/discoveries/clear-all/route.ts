import { NextResponse } from "next/server";
import { db } from "@/db";
import { discoveredOpportunities } from "@/db/schema";
import { withAuth, serverError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/discoveries/clear-all
// Hard-deletes every row in discoveredOpportunities. Used by the
// "Clear all" button on the Discovery board when the strategist wants
// to start a fresh generation pass from scratch.

export const POST = withAuth(async () => {
  try {
    const rows = await db.select().from(discoveredOpportunities);
    const count = rows.length;
    await db.delete(discoveredOpportunities);
    return NextResponse.json({ ok: true, cleared: count });
  } catch (err) {
    return serverError(err);
  }
});
