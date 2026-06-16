import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { discoveredOpportunities } from "@/db/schema";
import { withAuth, serverError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/discoveries/[id]/accept
// Accepts an opportunity. Moves the card from Intake → New
// IMMEDIATELY. Brief generation is then kicked off by the client
// (POST /brief). We do not call the brief generator server-side here
// because the spec requires the card move to be instant from the user's
// perspective — the brief catches up async.

export const POST = withAuth(
  async (_user, _req, ctx: { params: { id: string } }) => {
    try {
      const [opp] = await db
        .select()
        .from(discoveredOpportunities)
        .where(eq(discoveredOpportunities.id, ctx.params.id))
        .limit(1);
      if (!opp) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      const now = new Date();
      await db
        .update(discoveredOpportunities)
        .set({
          kanbanColumn: "new",
          status: "triaging",
          updatedAt: now
        })
        .where(eq(discoveredOpportunities.id, ctx.params.id));
      return NextResponse.json({ ok: true });
    } catch (err) {
      return serverError(err);
    }
  }
);
