import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { discoveredOpportunities } from "@/db/schema";
import { withAuth, serverError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/discoveries/[id]/restore
// Undoes a Reject — moves the card from "rejected" back to "intake".
// Used by the toast undo button.

export const POST = withAuth(
  async (_user, _req, ctx: { params: { id: string } }) => {
    try {
      const now = new Date();
      await db
        .update(discoveredOpportunities)
        .set({
          kanbanColumn: "intake",
          status: "new",
          updatedAt: now
        })
        .where(eq(discoveredOpportunities.id, ctx.params.id));
      return NextResponse.json({ ok: true });
    } catch (err) {
      return serverError(err);
    }
  }
);
