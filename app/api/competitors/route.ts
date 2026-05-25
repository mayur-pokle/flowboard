import { NextResponse } from "next/server";
import { db } from "@/db";
import { competitors } from "@/db/schema";
import { withAuth, badRequest, serverError } from "@/lib/api";
import { uid } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIERS = ["primary", "secondary", "watch"] as const;
type Tier = (typeof TIERS)[number];

export const POST = withAuth(async (_user, req) => {
  try {
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const url = typeof body.url === "string" ? body.url.trim() : "";
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";
    const tier: Tier = TIERS.includes(body.tier as Tier)
      ? (body.tier as Tier)
      : "secondary";
    if (!name && !url) return badRequest("Provide a name or URL");
    const id = uid("comp");
    await db.insert(competitors).values({ id, name, url, notes, tier });
    return NextResponse.json({ id });
  } catch (err) {
    return serverError(err);
  }
});
