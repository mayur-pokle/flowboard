import { NextResponse } from "next/server";
import { db } from "@/db";
import { sourceConfigs } from "@/db/schema";
import { withAuth, badRequest, serverError } from "@/lib/api";
import { encryptJson } from "@/lib/encryption";
import { testConnection } from "@/lib/semrush";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/sources/semrush/connect
// Body: { apiKey: string, database?: string }
// Verifies the key, then encrypts + stores in sourceConfigs.

export const POST = withAuth(async (_user, req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const apiKey =
      typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    const database =
      typeof body.database === "string" && body.database
        ? body.database
        : "us";
    if (!apiKey) return badRequest("Provide apiKey");

    const verify = await testConnection({ apiKey, database });
    if (!verify.ok) {
      return NextResponse.json(
        { error: verify.message || "Invalid API key" },
        { status: 400 }
      );
    }

    const encrypted = encryptJson({ apiKey, database });
    const metadata = { database };
    await db
      .insert(sourceConfigs)
      .values({
        name: "semrush",
        status: "connected",
        encryptedCredentials: encrypted,
        metadata,
        connectedAt: new Date(),
        updatedAt: new Date()
      })
      .onConflictDoUpdate({
        target: sourceConfigs.name,
        set: {
          status: "connected",
          encryptedCredentials: encrypted,
          metadata,
          lastError: null,
          connectedAt: new Date(),
          updatedAt: new Date()
        }
      });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return serverError(err);
  }
});
