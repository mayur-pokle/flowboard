import { NextResponse } from "next/server";
import { withAuth, serverError } from "@/lib/api";
import { ensureSchema } from "@/lib/migrate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/migrate
// Manually runs idempotent schema DDL to catch the production database
// up to db/schema.ts. Safe to call repeatedly. Used both as an admin
// escape hatch and as the self-heal action from /api/settings.
export const POST = withAuth(async () => {
  try {
    const res = await ensureSchema({ force: true });
    return NextResponse.json({
      ok: res.failed.length === 0,
      ran: res.ran,
      failed: res.failed
    });
  } catch (err) {
    return serverError(err);
  }
});

// GET for convenience — same behavior, so the user can hit the URL in
// a browser tab while signed in and see the result.
export const GET = POST;
