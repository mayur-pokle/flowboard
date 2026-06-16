import { NextResponse } from "next/server";
import { db } from "@/db";
import { sourceConfigs } from "@/db/schema";
import { withAuth, badRequest, serverError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/sources/competitor-sitemaps/connect
// Body: { sitemapUrls: string[] }  — one URL per line on the client.
//
// No credentials needed — sitemaps are public. We just persist the
// list and the schedule. Weekly cron parses them and feeds Community
// opportunities into the board.

export const POST = withAuth(async (_user, req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const sitemapUrls: string[] = Array.isArray(body.sitemapUrls)
      ? body.sitemapUrls.filter(
          (s: unknown) => typeof s === "string" && s.trim().length > 0
        )
      : [];
    if (sitemapUrls.length === 0) {
      return badRequest("Add at least one sitemap URL.");
    }
    // Validate URLs (cheap).
    for (const u of sitemapUrls) {
      try {
        new URL(u);
      } catch {
        return badRequest(`Not a valid URL: ${u}`);
      }
    }
    const metadata = {
      sitemapUrls,
      schedule: "weekly"
    };
    await db
      .insert(sourceConfigs)
      .values({
        name: "competitor-sitemap",
        status: "connected",
        encryptedCredentials: null,
        metadata,
        connectedAt: new Date(),
        updatedAt: new Date()
      })
      .onConflictDoUpdate({
        target: sourceConfigs.name,
        set: {
          status: "connected",
          metadata,
          lastError: null,
          updatedAt: new Date()
        }
      });
    return NextResponse.json({ ok: true, count: sitemapUrls.length });
  } catch (err) {
    return serverError(err);
  }
});
