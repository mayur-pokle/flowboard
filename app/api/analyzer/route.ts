import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  analyzedTopics,
  settings,
  competitors as competitorsTable,
  existingContent
} from "@/db/schema";
import { withAuth, serverError, badRequest } from "@/lib/api";
import { ensureSchema } from "@/lib/migrate";
import { uid } from "@/lib/utils";
import { analyzeTopic } from "@/lib/topic-analyzer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/analyzer
// Returns every row in analyzedTopics, ordered newest first.
export const GET = withAuth(async () => {
  try {
    await ensureSchema().catch(() => {});
    const rows = await db
      .select()
      .from(analyzedTopics)
      .orderBy(desc(analyzedTopics.createdAt));
    return NextResponse.json({
      topics: rows.map((r) => ({
        id: r.id,
        title: r.title,
        targetKeyword: r.targetKeyword,
        notes: r.notes,
        postBody: r.postBody,
        kanbanColumn: r.kanbanColumn,
        analysis: r.analysis,
        enrichment: r.enrichment,
        promotedToTaskId: r.promotedToTaskId,
        promotedToDiscoveryId: r.promotedToDiscoveryId,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString()
      }))
    });
  } catch (err) {
    return serverError(err);
  }
});

// POST /api/analyzer
// Body: { title: string, targetKeyword?: string, notes?: string }
// Runs the deterministic analyzer, persists the row, returns the
// analysis payload immediately. No LLM call — under 2s.
export const POST = withAuth(async (user, req) => {
  try {
    await ensureSchema().catch(() => {});
    const body = await req.json().catch(() => ({}));
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title || title.length < 5) {
      return badRequest("Provide a topic title (min 5 chars).");
    }
    if (title.length > 200) {
      return badRequest("Topic title is too long (max 200 chars).");
    }
    const targetKeyword =
      typeof body.targetKeyword === "string" && body.targetKeyword.trim()
        ? body.targetKeyword.trim().slice(0, 100)
        : undefined;
    const notes =
      typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : undefined;
    // Optional draft body — capped at 60KB to keep the analyzer bounded.
    const postBody =
      typeof body.postBody === "string" && body.postBody.trim()
        ? body.postBody.trim().slice(0, 60000)
        : undefined;

    // Pull workspace context for the analyzer.
    const [brandRow] = await db
      .select()
      .from(settings)
      .where(eq(settings.id, "workspace"))
      .limit(1);
    const compRows = await db.select().from(competitorsTable);
    const libRows = await db.select().from(existingContent);

    const analysis = analyzeTopic({
      title,
      targetKeyword,
      notes,
      postBody,
      brand: {
        companyName: brandRow?.companyName || undefined,
        brandNiche: brandRow?.brandNiche || undefined,
        brandAudience: brandRow?.brandAudience || undefined,
        brandVoice: brandRow?.brandVoice || undefined,
        valueProposition: brandRow?.valueProposition || undefined,
        productDescription: brandRow?.productDescription || undefined,
        primaryCta: brandRow?.primaryCta || undefined
      },
      competitors: compRows.map((c) => ({
        name: c.name,
        url: c.url,
        tier: c.tier
      })),
      contentLibrary: libRows.map((l) => ({
        url: l.url,
        title: l.title,
        targetKeyword: l.targetKeyword
      }))
    });

    const id = uid("atopic");
    const now = new Date();
    await db.insert(analyzedTopics).values({
      id,
      title,
      targetKeyword: targetKeyword || null,
      notes: notes || null,
      postBody: postBody || null,
      // Land in "analyzed" — the deterministic pipeline is done. "draft"
      // was the pre-submit state; by the time this row exists the
      // analysis payload is already attached.
      kanbanColumn: "analyzed",
      analysis,
      createdByUserId: user.id,
      createdAt: now,
      updatedAt: now
    });

    return NextResponse.json({
      ok: true,
      id,
      topic: {
        id,
        title,
        targetKeyword: targetKeyword || null,
        notes: notes || null,
        postBody: postBody || null,
        kanbanColumn: "analyzed",
        analysis,
        enrichment: null,
        promotedToTaskId: null,
        promotedToDiscoveryId: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      }
    });
  } catch (err) {
    return serverError(err);
  }
});
