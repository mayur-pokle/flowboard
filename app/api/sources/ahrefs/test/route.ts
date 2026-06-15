import { NextResponse } from "next/server";
import { withAuth, badRequest, serverError } from "@/lib/api";
import { testConnection } from "@/lib/ahrefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withAuth(async (_user, req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const apiKey =
      typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    if (!apiKey) return badRequest("Provide apiKey");
    const result = await testConnection({
      apiKey,
      country: body.country || "us"
    });
    return NextResponse.json(result);
  } catch (err) {
    return serverError(err);
  }
});
