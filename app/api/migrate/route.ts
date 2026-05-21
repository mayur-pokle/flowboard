import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  topics,
  tasks,
  settings,
  competitors,
  deletedTopicHashes,
  movedTopicHashes,
  meta
} from "@/db/schema";
import { withAuth, badRequest, serverError } from "@/lib/api";
import { topicHash, uid } from "@/lib/utils";
import type { Task, Topic, Competitor } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIGRATION_KEY = "localstorage_migration_done";

interface Snapshot {
  topics?: Topic[];
  tasks?: Task[];
  deletedTopicHashes?: string[];
  movedTopicHashes?: string[];
  settings?: {
    companyName?: string;
    websiteUrl?: string;
    brandNiche?: string;
    brandAudience?: string;
    productDescription?: string;
    valueProposition?: string;
    brandVoice?: string;
    primaryCta?: string;
    primaryGeo?: string;
    seedKeywords?: string;
    topicsToAvoid?: string;
    openaiModel?: string;
    geminiModel?: string;
    competitors?: Competitor[];
  };
}

// One-shot migration of a single user's browser snapshot into the shared DB.
// Idempotent: if the meta key is already set, returns { skipped: true } without
// touching any tables.
export const POST = withAuth(async (user, req) => {
  try {
    // Check the idempotency flag
    const [done] = await db
      .select()
      .from(meta)
      .where(eq(meta.key, MIGRATION_KEY))
      .limit(1);
    if (done) {
      return NextResponse.json({ skipped: true, reason: "already_migrated" });
    }

    const body = (await req.json()) as Snapshot;
    if (!body || typeof body !== "object") {
      return badRequest("Missing snapshot");
    }

    const counts = {
      topics: 0,
      tasks: 0,
      deletedHashes: 0,
      movedHashes: 0,
      competitors: 0,
      settings: false
    };

    await db.transaction(async (tx) => {
      // Topics
      if (Array.isArray(body.topics) && body.topics.length > 0) {
        await tx
          .insert(topics)
          .values(
            body.topics.map((t) => ({
              id: t.id || uid("topic"),
              title: t.title,
              contentType: t.contentType,
              targetKeyword: t.targetKeyword,
              searchIntent: t.searchIntent,
              priority: t.priority,
              priorityScore: t.priorityScore,
              whyOpportunity: t.whyOpportunity,
              suggestedCta: t.suggestedCta,
              estimatedEffort: t.estimatedEffort,
              competitorGap: t.competitorGap ?? null,
              rankingPotential: t.rankingPotential ?? null,
              businessImpact: t.businessImpact ?? null,
              createdByUserId: user.id
            }))
          )
          .onConflictDoNothing();
        counts.topics = body.topics.length;
      }

      // Tasks (with embedded topic snapshot)
      if (Array.isArray(body.tasks) && body.tasks.length > 0) {
        await tx
          .insert(tasks)
          .values(
            body.tasks.map((t) => ({
              id: t.id || uid("task"),
              topicId: t.topicId || null,
              topicSnapshot: t.topic,
              status: t.status,
              contentStatus: t.contentStatus,
              content: t.content ?? null,
              contentVersions: t.contentVersions ?? null,
              tags: t.tags || [],
              createdByUserId: user.id
            }))
          )
          .onConflictDoNothing();
        counts.tasks = body.tasks.length;
      }

      // Deleted / moved hashes
      if (Array.isArray(body.deletedTopicHashes)) {
        for (const h of body.deletedTopicHashes) {
          if (!h) continue;
          await tx
            .insert(deletedTopicHashes)
            .values({ hash: h })
            .onConflictDoNothing();
          counts.deletedHashes++;
        }
      }
      if (Array.isArray(body.movedTopicHashes)) {
        for (const h of body.movedTopicHashes) {
          if (!h) continue;
          await tx
            .insert(movedTopicHashes)
            .values({ hash: h })
            .onConflictDoNothing();
          counts.movedHashes++;
        }
      }
      // Also derive hashes from tasks (defensive — older snapshots may not have movedTopicHashes)
      if (Array.isArray(body.tasks)) {
        for (const t of body.tasks) {
          if (t?.topic?.title && t?.topic?.targetKeyword) {
            await tx
              .insert(movedTopicHashes)
              .values({ hash: topicHash(t.topic.title, t.topic.targetKeyword) })
              .onConflictDoNothing();
          }
        }
      }

      // Settings (singleton)
      if (body.settings) {
        const s = body.settings;
        await tx
          .insert(settings)
          .values({
            id: "workspace",
            companyName: s.companyName ?? "",
            websiteUrl: s.websiteUrl ?? "",
            brandNiche: s.brandNiche ?? "",
            brandAudience: s.brandAudience ?? "",
            productDescription: s.productDescription ?? "",
            valueProposition: s.valueProposition ?? "",
            brandVoice: s.brandVoice ?? "",
            primaryCta: s.primaryCta ?? "",
            primaryGeo: s.primaryGeo ?? "",
            seedKeywords: s.seedKeywords ?? "",
            topicsToAvoid: s.topicsToAvoid ?? "",
            openaiModel: s.openaiModel || "gpt-4o-mini",
            geminiModel: s.geminiModel || "gemini-1.5-flash-latest"
          })
          .onConflictDoUpdate({
            target: settings.id,
            set: {
              companyName: s.companyName ?? "",
              websiteUrl: s.websiteUrl ?? "",
              brandNiche: s.brandNiche ?? "",
              brandAudience: s.brandAudience ?? "",
              productDescription: s.productDescription ?? "",
              valueProposition: s.valueProposition ?? "",
              brandVoice: s.brandVoice ?? "",
              primaryCta: s.primaryCta ?? "",
              primaryGeo: s.primaryGeo ?? "",
              seedKeywords: s.seedKeywords ?? "",
              topicsToAvoid: s.topicsToAvoid ?? "",
              openaiModel: s.openaiModel || "gpt-4o-mini",
              geminiModel: s.geminiModel || "gemini-1.5-flash-latest",
              updatedAt: new Date()
            }
          });
        counts.settings = true;

        if (Array.isArray(s.competitors) && s.competitors.length > 0) {
          for (const c of s.competitors) {
            await tx
              .insert(competitors)
              .values({
                id: c.id || uid("comp"),
                name: c.name || "",
                url: c.url || "",
                notes: c.notes || ""
              })
              .onConflictDoNothing();
            counts.competitors++;
          }
        }
      }

      // Mark migration done.
      await tx
        .insert(meta)
        .values({
          key: MIGRATION_KEY,
          value: JSON.stringify({ migratedByUserId: user.id, at: new Date().toISOString() })
        })
        .onConflictDoNothing();
    });

    return NextResponse.json({ ok: true, counts });
  } catch (err) {
    return serverError(err);
  }
});

// GET — lets the client check if migration has already happened.
export const GET = withAuth(async () => {
  try {
    const [done] = await db
      .select()
      .from(meta)
      .where(eq(meta.key, MIGRATION_KEY))
      .limit(1);
    return NextResponse.json({ migrated: Boolean(done) });
  } catch (err) {
    return serverError(err);
  }
});
