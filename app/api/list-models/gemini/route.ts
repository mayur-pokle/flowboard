import { NextResponse } from "next/server";
import { withAuth, serverError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/list-models/gemini
// Calls https://generativelanguage.googleapis.com/v1beta/models with the
// server's GEMINI_API_KEY and returns the model IDs that key can use,
// filtered to text-generation models (excludes embeddings, vision-only,
// image-generation, etc.).

interface GeminiModelRaw {
  name?: string;
  displayName?: string;
  description?: string;
  supportedGenerationMethods?: string[];
  version?: string;
}

export const GET = withAuth(async () => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not set on the server." },
        { status: 400 }
      );
    }
    // Page through results. Google caps pageSize at 1000; usually fits.
    const all: GeminiModelRaw[] = [];
    let pageToken: string | undefined = undefined;
    for (let page = 0; page < 5; page++) {
      const url = new URL(
        "https://generativelanguage.googleapis.com/v1beta/models"
      );
      url.searchParams.set("key", apiKey);
      url.searchParams.set("pageSize", "200");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const res = await fetch(url.toString(), { cache: "no-store" });
      if (!res.ok) {
        const text = await res.text();
        return NextResponse.json(
          {
            error: `Gemini list-models failed: ${res.status}`,
            detail: text.slice(0, 400)
          },
          { status: res.status }
        );
      }
      const data = (await res.json()) as {
        models?: GeminiModelRaw[];
        nextPageToken?: string;
      };
      if (Array.isArray(data.models)) all.push(...data.models);
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }
    const filtered = all
      .filter((m) =>
        // Only models that support generateContent (text generation).
        m.supportedGenerationMethods?.includes("generateContent")
      )
      .map((m) => ({
        // API expects the bare model name without "models/" prefix when
        // calling generateContent via the SDK we use.
        id: String(m.name || "").replace(/^models\//, ""),
        displayName: m.displayName || "",
        description: m.description || ""
      }))
      // Exclude things that aren't useful for content gen.
      .filter(
        (m) =>
          m.id &&
          !/embedding/i.test(m.id) &&
          !/aqa/i.test(m.id) &&
          !/image/i.test(m.id) &&
          !/tts/i.test(m.id)
      )
      // Sort: 3.x first, then 2.x, then 1.x. Within each, flash/lite first
      // since those are typically free-tier eligible.
      .sort((a, b) => {
        const v = (id: string) => {
          const m = id.match(/(\d+(?:\.\d+)?)/);
          return m ? parseFloat(m[1]) : 0;
        };
        return v(b.id) - v(a.id);
      });
    return NextResponse.json({ models: filtered });
  } catch (err) {
    return serverError(err);
  }
});
