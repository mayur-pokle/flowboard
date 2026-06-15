import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sourceConfigs } from "@/db/schema";
import { getSession } from "@/lib/session";
import {
  exchangeCodeForTokens,
  getAccountEmail,
  type GSCTokens,
  type GSCMetadata
} from "@/lib/gsc";
import { encryptJson } from "@/lib/encryption";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/sources/gsc/oauth/callback?code=...&state=...
// Verifies the CSRF state, exchanges the code for tokens, encrypts +
// stores them in sourceConfigs, then redirects back to Settings.

export async function GET(req: Request) {
  // Auth check — only signed-in users can complete OAuth
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.redirect(
      new URL("/sign-in", req.url).toString()
    );
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const settingsUrl = new URL("/settings/sources", req.url);

  if (error) {
    settingsUrl.searchParams.set("gsc_error", error);
    return NextResponse.redirect(settingsUrl);
  }
  if (!code || !state) {
    settingsUrl.searchParams.set(
      "gsc_error",
      "missing_code_or_state"
    );
    return NextResponse.redirect(settingsUrl);
  }

  // Verify CSRF state matches the cookie we set in /start.
  const cookieState = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("gsc_oauth_state="))
    ?.split("=")[1];
  if (!cookieState || cookieState !== state) {
    settingsUrl.searchParams.set("gsc_error", "state_mismatch");
    return NextResponse.redirect(settingsUrl);
  }

  try {
    const tokens: GSCTokens = await exchangeCodeForTokens(code);
    const email = await getAccountEmail(tokens).catch(() => "");

    const metadata: GSCMetadata = { email };
    const encrypted = encryptJson(tokens);

    // Upsert into sourceConfigs.
    await db
      .insert(sourceConfigs)
      .values({
        name: "gsc",
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

    // Clear the state cookie.
    const res = NextResponse.redirect(settingsUrl);
    res.cookies.set("gsc_oauth_state", "", { path: "/", maxAge: 0 });
    settingsUrl.searchParams.set("gsc_connected", "1");
    return NextResponse.redirect(settingsUrl);
  } catch (err) {
    console.error("[gsc oauth callback]", err);
    // Best-effort: mark the source as errored.
    await db
      .insert(sourceConfigs)
      .values({
        name: "gsc",
        status: "error",
        lastError: (err as Error).message,
        updatedAt: new Date()
      })
      .onConflictDoUpdate({
        target: sourceConfigs.name,
        set: {
          status: "error",
          lastError: (err as Error).message,
          updatedAt: new Date()
        }
      })
      .catch(() => {});
    settingsUrl.searchParams.set(
      "gsc_error",
      (err as Error).message || "exchange_failed"
    );
    return NextResponse.redirect(settingsUrl);
  }
}

// Also accept a GET-with-eq.method=POST in case the redirect was rewritten.
export const POST = GET;
