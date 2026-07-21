import { NextResponse } from "next/server";
import { db } from "@/db";
import { competitors as competitorsTable } from "@/db/schema";
import { withAuth, serverError } from "@/lib/api";
import { detectSitemapsForCompetitors } from "@/lib/sitemap-detector";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/sources/competitor-sitemaps/discover
// Reads competitors from Settings → Brand & APIs, probes each one for
// a sitemap (robots.txt first, then conventional paths), and returns
// the validated URLs. Does NOT save anything — the client merges the
// results into the textarea and the user reviews before Save.

export const POST = withAuth(async () => {
  try {
    const compRows = await db.select().from(competitorsTable);

    if (compRows.length === 0) {
      return NextResponse.json({
        ok: true,
        results: [],
        urls: [],
        message:
          "No competitors configured. Add competitors in Settings → Brand & APIs first."
      });
    }

    const result = await detectSitemapsForCompetitors(
      compRows.map((c) => ({
        name: c.name,
        url: c.url,
        tier: c.tier
      }))
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return serverError(err);
  }
});
