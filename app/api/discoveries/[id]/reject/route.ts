import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { discoveredOpportunities } from "@/db/schema";
import { withAuth, serverError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/discoveries/[id]/reject
// Soft-deletes an opportunity. The row stays in the DB so the
// strategist can restore it within the same session (one level of
// undo). After session close it's effectively permanent because the
// board only shows non-rejected rows.
//
// Pass { permanent: true } to hard-delete (used by the eventual session
// teardown flow).

export const POST = withAuth(
  async (_user, req, ctx: { params: { id: string } }) => {
    try {
      const body = await req.json().catch(() => ({}));
      if (body.permanent) {
        await db
          .delete(discoveredOpportunities)
          .where(eq(discoveredOpportunities.id, ctx.params.id));
        return NextResponse.json({ ok: true, permanent: true });
      }
      const now = new Date();
      await db
        .update(discoveredOpportunities)
        .set({
          kanbanColumn: "rejected",
          status: "archived",
          updatedAt: now
        })
        .where(eq(discoveredOpportunities.id, ctx.params.id));
      return NextResponse.json({ ok: true });
    } catch (err) {
      return serverError(err);
    }
  }
);
