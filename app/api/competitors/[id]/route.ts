import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { competitors } from "@/db/schema";
import { withAuth, serverError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIERS = ["primary", "secondary", "watch"] as const;

export const PATCH = withAuth(async (_user, req, ctx: { params: { id: string } }) => {
  try {
    const body = await req.json();
    const patch: Record<string, string> = {};
    for (const k of ["name", "url", "notes"] as const) {
      if (typeof body[k] === "string") patch[k] = body[k];
    }
    if (
      typeof body.tier === "string" &&
      (TIERS as readonly string[]).includes(body.tier)
    ) {
      patch.tier = body.tier;
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: true, noop: true });
    }
    await db
      .update(competitors)
      .set(patch)
      .where(eq(competitors.id, ctx.params.id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return serverError(err);
  }
});

export const DELETE = withAuth(async (_user, _req, ctx: { params: { id: string } }) => {
  try {
    await db.delete(competitors).where(eq(competitors.id, ctx.params.id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return serverError(err);
  }
});
