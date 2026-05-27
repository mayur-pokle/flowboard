import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { withAuth, serverError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/list-models/anthropic
// Calls Anthropic's models.list endpoint with the server's ANTHROPIC_API_KEY
// and returns the model IDs that key can use. Newest first by created_at.

export const GET = withAuth(async () => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not set on the server." },
        { status: 400 }
      );
    }
    const client = new Anthropic({ apiKey });
    // Paginate through all available models.
    const all: Array<{
      id: string;
      displayName?: string;
      description?: string;
    }> = [];
    let cursor: string | undefined = undefined;
    for (let page = 0; page < 10; page++) {
      const res = await client.models.list({
        limit: 100,
        ...(cursor ? { after_id: cursor } : {})
      });
      for (const m of res.data) {
        all.push({
          id: m.id,
          displayName: m.display_name || ""
        });
      }
      if (!res.has_more || !res.last_id) break;
      cursor = res.last_id;
    }
    return NextResponse.json({ models: all });
  } catch (err) {
    return serverError(err);
  }
});
