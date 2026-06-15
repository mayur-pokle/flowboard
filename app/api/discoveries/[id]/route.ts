import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { discoveredOpportunities } from "@/db/schema";
import { withAuth, serverError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_STATUS = ["new", "moved", "dismissed"] as const;

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
