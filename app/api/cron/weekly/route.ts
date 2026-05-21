import { NextResponse } from "next/server";
import { generateTopics, type BrandContext } from "@/lib/ai";
import { buildSlackMessage, postToSlack } from "@/lib/slack";

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
    competitors: parseList(process.env.BRAND_COMPETITORS),
    seedKeywords: parseList(process.env.BRAND_SEED_KEYWORDS),
    topicsToAvoid: parseList(process.env.BRAND_TOPICS_TO_AVOID)
  };

  try {
    const { topics, provider } = await generateTopics(ctx, 8);

    const webhook = process.env.SLACK_WEBHOOK_URL;
    if (webhook) {
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL || `https://${url.host}`;
      await postToSlack(webhook, buildSlackMessage(topics, `${appUrl}/ideas`));
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
