import { NextResponse } from "next/server";
import crypto from "crypto";
import { withAuth, serverError } from "@/lib/api";
import { buildAuthUrl } from "@/lib/gsc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/sources/gsc/oauth/start
// Generates a CSRF state token, sets it as a short-lived cookie, and
// redirects the user to Google's consent screen. The callback verifies
// the state matches before exchanging the code.

export const GET = withAuth(async () => {
  try {
    const state = crypto.randomBytes(24).toString("hex");
    const url = buildAuthUrl(state);
    const res = NextResponse.redirect(url);
    // 5-minute httpOnly cookie — long enough for consent, short enough
    // that a stolen state can't be reused later.
    res.cookies.set("gsc_oauth_state", state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 5
    });
    return res;
  } catch (err) {
    return serverError(err);
  }
});
