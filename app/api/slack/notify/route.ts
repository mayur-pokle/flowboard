import { NextResponse } from "next/server";
import { buildSlackMessage, postToSlack } from "@/lib/slack";
import { getSession } from "@/lib/session";
import type { Topic } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RequestBody {
  topics: Topic[];
  appUrl?: string;
  webhookUrl?: string;
  text?: string;
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const webhook =
    body.webhookUrl ||
    req.headers.get("x-slack-webhook") ||
    process.env.SLACK_WEBHOOK_URL ||
    "";

  if (!webhook) {
    return NextResponse.json(
      { error: "No Slack webhook configured. Add one in Settings." },
      { status: 400 }
    );
  }

  const text =
    body.text ||
    buildSlackMessage(
      body.topics || [],
      body.appUrl ||
        process.env.NEXT_PUBLIC_APP_URL ||
        "https://flowboard-two-amber.vercel.app/board"
    );

  try {
    await postToSlack(webhook, text);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Slack post failed" },
      { status: 500 }
    );
  }
}
