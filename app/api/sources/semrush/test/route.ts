import { NextResponse } from "next/server";
import { withAuth, badRequest, serverError } from "@/lib/api";
import { testConnection } from "@/lib/semrush";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/sources/semrush/test
// Body: { apiKey: string, database?: string }
// Validates the key by hitting a cheap SEMrush endpoint. Does NOT store
// the key — the user clicks Connect after Test passes.

export const POST = withAuth(async (_user, req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const apiKey =
      typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    if (!apiKey) return badRequest("Provide apiKey");
    const result = await testConnection({
      apiKey,
      database: body.database || "us"
    });
    return NextResponse.json(result);
  } catch (err) {
    return serverError(err);
  }
});
