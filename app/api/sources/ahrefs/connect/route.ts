import { NextResponse } from "next/server";
import { db } from "@/db";
import { sourceConfigs } from "@/db/schema";
import { withAuth, badRequest, serverError } from "@/lib/api";
import { encryptJson } from "@/lib/encryption";
import { testConnection } from "@/lib/ahrefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withAuth(async (_user, req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const apiKey =
      typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    const country =
      typeof body.country === "string" && body.country
        ? body.country
        : "us";
    if (!apiKey) return badRequest("Provide apiKey");

    const verify = await testConnection({ apiKey, country });
    if (!verify.ok) {
      return NextResponse.json(
        { error: verify.message || "Invalid API key" },
        { status: 400 }
      );
    }

    const encrypted = encryptJson({ apiKey, country });
    const metadata = { country };
    await db
      .insert(sourceConfigs)
      .values({
        name: "ahrefs",
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
