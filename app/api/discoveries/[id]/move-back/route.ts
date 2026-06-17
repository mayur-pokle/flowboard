import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { discoveredOpportunities } from "@/db/schema";
import { withAuth, serverError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/discoveries/[id]/move-back
// Reverses the card one column. Mirrors the forward pipeline:
//   done         → in_progress
//   in_progress  → new
//   new          → intake
//   intake       → no-op
// Rejected cards use the /restore endpoint instead — different undo path.

const REVERSE: Record<string, string> = {
  done: "in_progress",
  in_progress: "new",
  new: "intake"
};

export const POST = withAuth(
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
      const current = row.kanbanColumn || "intake";
      const next = REVERSE[current];
      if (!next) {
        return NextResponse.json({ ok: true, kanbanColumn: current });
      }
      const now = new Date();
      // Reset status to a sensible value for the destination column.
      let status = row.status;
      if (next === "intake") status = "new";
      else if (next === "new") status = "briefed";
      else if (next === "in_progress") status = "in_progress";
      await db
        .update(discoveredOpportunities)
        .set({
          kanbanColumn: next,
          status,
          updatedAt: now
        })
        .where(eq(discoveredOpportunities.id, ctx.params.id));
      return NextResponse.json({ ok: true, kanbanColumn: next });
    } catch (err) {
      return serverError(err);
    }
  }
);
