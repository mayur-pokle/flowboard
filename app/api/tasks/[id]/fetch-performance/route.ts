import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sourceConfigs, tasks } from "@/db/schema";
import { withAuth, badRequest, serverError } from "@/lib/api";
import { decryptJson } from "@/lib/encryption";
import {
  fetchUrlPerformance,
  type GSCMetadata,
  type GSCTokens
} from "@/lib/gsc";
import { rowToTask } from "@/lib/db-mappers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/tasks/[id]/fetch-performance
// Pulls current-28d + previous-28d GSC metrics for the task's
// publishedUrl, caches the result on the row, and returns it.
// Only POST is supported — Next.js will 405 other methods automatically.

const WINDOW_DAYS = 28;

export const POST = withAuth(
  async (_user, _req, ctx: { params: { id: string } }) => {
    try {
      const [task] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, ctx.params.id))
        .limit(1);
      if (!task) {
        return NextResponse.json(
          { error: "Task not found" },
          { status: 404 }
        );
      }
      if (!task.publishedUrl) {
        return badRequest(
          "Set a Published URL on this task first."
        );
      }

      const [gscCfg] = await db
        .select()
        .from(sourceConfigs)
        .where(eq(sourceConfigs.name, "gsc"))
        .limit(1);
      if (
        !gscCfg ||
        gscCfg.status !== "connected" ||
        !gscCfg.encryptedCredentials
      ) {
        return badRequest(
          "Google Search Console is not connected. Go to Settings → Data sources to connect."
        );
      }
      const meta = (gscCfg.metadata as GSCMetadata) || {};
      if (!meta.siteUrl) {
        return badRequest(
          "Pick a GSC property in Settings → Data sources first."
        );
      }
      const tokens = decryptJson<GSCTokens>(gscCfg.encryptedCredentials);

      // Current 28d and previous 28d windows.
      const now = new Date();
      const currentEnd = now;
      const currentStart = new Date(
        now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000
      );
      const previousEnd = currentStart;
      const previousStart = new Date(
        currentStart.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000
      );

      const [current, previous] = await Promise.all([
        fetchUrlPerformance(
          tokens,
          meta.siteUrl,
          task.publishedUrl,
          currentStart,
          currentEnd
        ),
        fetchUrlPerformance(
          tokens,
          meta.siteUrl,
          task.publishedUrl,
          previousStart,
          previousEnd
        )
      ]);

      const empty = {
        impressions: 0,
        clicks: 0,
        ctr: 0,
        position: 0
      };
      const metrics = {
        url: task.publishedUrl,
        fetchedAt: new Date().toISOString(),
        current: current ?? empty,
        previous: previous ?? empty
      };

      await db
        .update(tasks)
        .set({
          publishedUrlMetrics: metrics,
          updatedAt: new Date()
        })
        .where(eq(tasks.id, task.id));

      const [refreshed] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, task.id))
        .limit(1);

      return NextResponse.json({
        ok: true,
        metrics,
        task: refreshed ? rowToTask(refreshed) : null,
        hasData: Boolean(current || previous)
      });
    } catch (err) {
      return serverError(err);
    }
  }
);
