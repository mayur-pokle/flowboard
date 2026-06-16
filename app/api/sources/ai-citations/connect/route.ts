import { NextResponse } from "next/server";
import { db } from "@/db";
import { sourceConfigs } from "@/db/schema";
import { withAuth, badRequest, serverError } from "@/lib/api";
import { encryptJson } from "@/lib/encryption";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/sources/ai-citations/connect
// Body: {
//   prompts: string[],              // one prompt per line
//   competitorDomains: string[],    // comma-separated → array
//   brandTerms: string[],           // comma-separated → array
//   apiKey?: string                 // optional — when present, real
//                                   // citation checking is enabled;
//                                   // otherwise the sync runs in
//                                   // mock mode against sample data.
// }
//
// Mock mode IS the default — the spec requires the source to be
// usable without an API key.

export const POST = withAuth(async (_user, req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const prompts: string[] = Array.isArray(body.prompts)
      ? body.prompts.filter((s: unknown) => typeof s === "string")
      : [];
    const competitorDomains: string[] = Array.isArray(body.competitorDomains)
      ? body.competitorDomains.filter((s: unknown) => typeof s === "string")
      : [];
    const brandTerms: string[] = Array.isArray(body.brandTerms)
      ? body.brandTerms.filter((s: unknown) => typeof s === "string")
      : [];
    if (prompts.length === 0) {
      return badRequest("Provide at least one prompt to monitor.");
    }
    if (brandTerms.length === 0) {
      return badRequest(
        "Provide at least one brand term (e.g. your company name) so the tracker knows what to look for."
      );
    }

    const apiKey =
      typeof body.apiKey === "string" && body.apiKey.trim()
        ? body.apiKey.trim()
        : null;

    // Encrypted blob is only useful when a real key is set; metadata
    // carries the rest in clear since it's not sensitive.
    const encrypted = apiKey ? encryptJson({ apiKey }) : null;
    const metadata = {
      prompts,
      competitorDomains,
      brandTerms,
      mode: apiKey ? "live" : "mock"
    };
    await db
      .insert(sourceConfigs)
      .values({
        name: "ai-citations",
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
          updatedAt: new Date()
        }
      });
    return NextResponse.json({
      ok: true,
      mode: apiKey ? "live" : "mock"
    });
  } catch (err) {
    return serverError(err);
  }
});
