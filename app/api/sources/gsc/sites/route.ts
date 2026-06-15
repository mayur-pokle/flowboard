import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sourceConfigs } from "@/db/schema";
import { withAuth, serverError } from "@/lib/api";
import { decryptJson } from "@/lib/encryption";
import { listSites, type GSCTokens } from "@/lib/gsc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/sources/gsc/sites
// Returns the list of Search Console properties the connected account
// has access to. The user picks one before syncing.

export const GET = withAuth(async () => {
  try {
    const [row] = await db
      .select()
      .from(sourceConfigs)
      .where(eq(sourceConfigs.name, "gsc"))
      .limit(1);
    if (!row || !row.encryptedCredentials) {
      return NextResponse.json(
        { error: "GSC is not connected. Click Connect first." },
        { status: 400 }
      );
    }
    const tokens = decryptJson<GSCTokens>(row.encryptedCredentials);
    const sites = await listSites(tokens);
    return NextResponse.json({ sites });
  } catch (err) {
    return serverError(err);
  }
});
