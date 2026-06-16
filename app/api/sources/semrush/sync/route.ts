import { NextResponse } from "next/server";
import { withAuth, badRequest, serverError } from "@/lib/api";
import { syncSemrush } from "@/lib/sync-runners";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/sources/semrush/sync
// Thin wrapper that delegates to the shared sync-runner so the
// classifier (intent, AI citation gap, score breakdown) runs on every
// sync — whether triggered by the cron or by clicking "Sync now" on
// the Settings → Data sources page.

export const POST = withAuth(async () => {
  try {
    const res = await syncSemrush();
    if (!res.ok) {
      if (
        res.error &&
        /not connected|competitor/.test(res.error.toLowerCase())
      ) {
        return badRequest(res.error);
      }
      return NextResponse.json(
        {
          ok: false,
          sampled: res.sampled,
          opportunities: res.opportunities,
          error: res.error || "SEMrush sync failed"
        },
        { status: 500 }
      );
    }
    return NextResponse.json({
      ok: true,
      sampled: res.sampled,
      opportunities: res.opportunities,
      upserted: res.opportunities
    });
  } catch (err) {
    return serverError(err);
  }
});
