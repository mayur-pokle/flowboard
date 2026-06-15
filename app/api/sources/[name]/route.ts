import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sourceConfigs } from "@/db/schema";
import { withAuth, serverError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/sources/[name]
// Wipes credentials + status for a source. Doesn't delete discovered
// opportunities that came from it — those become orphaned but visible.

export const DELETE = withAuth(
  async (_user, _req, ctx: { params: { name: string } }) => {
    try {
      await db
        .delete(sourceConfigs)
        .where(eq(sourceConfigs.name, ctx.params.name));
      return NextResponse.json({ ok: true });
    } catch (err) {
      return serverError(err);
    }
  }
);
