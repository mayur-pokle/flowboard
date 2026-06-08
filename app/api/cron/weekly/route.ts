import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import {
  generateTopics,
  type BrandContext,
  type ExistingContentCtx,
  type PriorityKeywordCtx,
  type TieredCompetitor
} from "@/lib/ai";
import { buildSlackMessage, postToSlack } from "@/lib/slack";
import { db } from "@/db";
import { keywords, existingContent, competitors } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel cron hits this with ?secret=<CRON_SECRET>
// Generates fresh topics from server context and posts to Slack.
// Note: dedup memory lives in the browser (localStorage) per the v1 design,
// so this endpoint generates a *fresh batch* and posts to Slack — the browser
// will dedupe when it next syncs.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");

  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parseList = (s: string | undefined) =>
    s
      ? s
          .split(/[,;\n]/)
          .map((x) => x.trim())
          .filter(Boolean)
      : undefined;

  // Pull priority keywords + existing content + tiered competitors from DB
  // so weekly Slack generation gets the same anti-cannibalization signals as
  // ad-hoc generation. Failures here are non-fatal — fall back to env vars.
  let priorityKeywords: PriorityKeywordCtx[] = [];
  let existingItems: ExistingContentCtx[] = [];
  let tieredCompetitors: TieredCompetitor[] = [];
  try {
    const [kwRows, ecRows, compRows] = await Promise.all([
      db.select().from(keywords),
      db
        .select()
        .from(existingContent)
        .orderBy(desc(existingContent.createdAt)),
      db.select().from(competitors)
    ]);
    priorityKeywords = kwRows
      .filter((k) => k.status !== "abandoned")
      .map((k) => ({
        keyword: k.keyword,
        priority: (k.priority === "P0" || k.priority === "P2"
          ? k.priority
          : "P1") as "P0" | "P1" | "P2",
        intent: k.intent as PriorityKeywordCtx["intent"]
      }));
    existingItems = ecRows.map((c) => ({
      url: c.url,
      title: c.title,
      targetKeyword: c.targetKeyword || undefined,
      intent: c.intent || undefined
    }));
    tieredCompetitors = compRows.map((c) => ({
      name: c.name || undefined,
      url: c.url || undefined,
      notes: c.notes || undefined,
      tier:
        c.tier === "primary" || c.tier === "watch"
          ? (c.tier as "primary" | "watch")
          : "secondary"
    }));
  } catch (err) {
    console.warn("[cron] failed to load DB context:", err);
  }

  const ctx: BrandContext = {
    niche: process.env.BRAND_NICHE || "B2B SaaS for finance teams",
    audience:
      process.env.BRAND_AUDIENCE ||
      "CFOs, controllers, and finance ops leaders at startups",
    companyName: process.env.BRAND_COMPANY_NAME,
    websiteUrl: process.env.BRAND_WEBSITE_URL,
    productDescription: process.env.BRAND_PRODUCT_DESCRIPTION,
    valueProposition: process.env.BRAND_VALUE_PROPOSITION,
    brandVoice: process.env.BRAND_VOICE,
    primaryCta: process.env.BRAND_PRIMARY_CTA,
    primaryGeo: process.env.BRAND_PRIMARY_GEO,
    competitors:
      tieredCompetitors.length > 0
        ? tieredCompetitors
        : parseList(process.env.BRAND_COMPETITORS),
    seedKeywords: parseList(process.env.BRAND_SEED_KEYWORDS),
    topicsToAvoid: parseList(process.env.BRAND_TOPICS_TO_AVOID),
    priorityKeywords,
    existingContent: existingItems
  };

  try {
    const { topics, provider } = await generateTopics(ctx, 8);

    const webhook = process.env.SLACK_WEBHOOK_URL;
    if (webhook) {
      // Production URL. NEXT_PUBLIC_APP_URL overrides for previews / dev.
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        "https://flowboard-two-amber.vercel.app";
      await postToSlack(webhook, buildSlackMessage(topics, `${appUrl}/board`));
    }

    return NextResponse.json({
      ok: true,
      provider,
      count: topics.length,
      slackPosted: Boolean(webhook),
      topics
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
