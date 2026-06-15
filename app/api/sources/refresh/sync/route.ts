import { NextResponse } from "next/server";
import { withAuth, serverError } from "@/lib/api";
import { syncRefresh } from "@/lib/refresh-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/sources/refresh/sync
// No credentials needed — uses the GSC connection + Content Library
// already configured in the app. Returns a SyncResult shape.

export const POST = withAuth(async () => {
  try {
    const result = await syncRefresh();
    return NextResponse.json(result);
  } catch (err) {
    return serverError(err);
  }
});
