import { NextResponse } from "next/server";
import { withAuth, serverError } from "@/lib/api";
import {
  seedSampleOpportunities,
  clearSampleOpportunities
} from "@/lib/sample-opportunities";
import { ensureSchema } from "@/lib/migrate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/discoveries/seed
// Seeds the sample opportunity set if the table is empty. Pass
// { force: true } to wipe-and-reseed; pass { clear: true } to remove
// every sample row (used when the strategist connects real sources).

export const POST = withAuth(async (_user, req) => {
  try {
    // Self-heal — make sure new columns exist before insert.
    await ensureSchema().catch(() => {});
    const body = await req.json().catch(() => ({}));
    if (body.clear) {
      const removed = await clearSampleOpportunities();
      return NextResponse.json({ ok: true, cleared: removed });
    }
    const res = await seedSampleOpportunities({ force: !!body.force });
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    return serverError(err);
  }
});
