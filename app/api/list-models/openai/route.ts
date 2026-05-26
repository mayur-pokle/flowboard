import { NextResponse } from "next/server";
import { withAuth, serverError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/list-models/openai
// Calls https://api.openai.com/v1/models with the server's OPENAI_API_KEY
// and returns the model IDs that key can actually access.
// Filters out non-text models (whisper, dall-e, embeddings, tts, etc.)
// so the dropdown only shows things relevant for content generation.

const EXCLUDE_PREFIXES = [
  "whisper",
  "dall-e",
  "tts",
  "text-embedding",
  "text-moderation",
  "omni-moderation",
  "babbage",
  "davinci",
  "computer-use"
];

export const GET = withAuth(async () => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not set on the server." },
        { status: 400 }
      );
    }
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store"
    });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        {
          error: `OpenAI list-models failed: ${res.status}`,
          detail: text.slice(0, 400)
        },
        { status: res.status }
      );
    }
    const data = (await res.json()) as {
      data?: Array<{ id?: string; created?: number; owned_by?: string }>;
    };
    const all = Array.isArray(data.data) ? data.data : [];
    const filtered = all
      .map((m) => ({
        id: String(m.id || ""),
        created: m.created ?? 0,
        ownedBy: m.owned_by ?? ""
      }))
      .filter((m) => m.id && !EXCLUDE_PREFIXES.some((p) => m.id.startsWith(p)))
      // Newest first by creation timestamp.
      .sort((a, b) => b.created - a.created);
    return NextResponse.json({ models: filtered });
  } catch (err) {
    return serverError(err);
  }
});
