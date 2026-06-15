import { NextResponse } from "next/server";
import { db } from "@/db";
import { sourceConfigs } from "@/db/schema";
import { withAuth, serverError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/sources
// Returns the connection state for every source. Never returns the
// encrypted credentials — only safe-to-display fields.

export const GET = withAuth(async () => {
  try {
    const rows = await db.select().from(sourceConfigs);
    return NextResponse.json({
      sources: rows.map((r) => ({
        name: r.name,
        status: r.status,
        metadata: r.metadata ?? null,
        lastError: r.lastError,
        lastSyncedAt: r.lastSyncedAt
          ? r.lastSyncedAt.toISOString()
          : null,
        connectedAt: r.connectedAt
          ? r.connectedAt.toISOString()
          : null
      })),
      // Hint to the client whether the server env is wired up.
      serverConfigured: {
        gsc: Boolean(
          process.env.GSC_CLIENT_ID && process.env.GSC_CLIENT_SECRET
        ),
        encryption: Boolean(process.env.SOURCES_ENCRYPTION_KEY)
      }
    });
  } catch (err) {
    return serverError(err);
  }
});
