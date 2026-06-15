import type { Topic } from "./types";

// Lightweight shape so the cron can pass discovery rows without importing
// the full Drizzle row type. Matches what the cron pulls + what we want
// to show in Slack.
export interface SlackDiscoveryItem {
  source: string;
  query: string;
  score: number;
  reason?: string | null;
}

export function buildSlackMessage(
  topics: Topic[],
  appUrl: string,
  discoveries: SlackDiscoveryItem[] = []
) {
  const lines: string[] = [];
  lines.push(":fire: *Weekly Content Opportunities*");
  lines.push("");
  topics.slice(0, 10).forEach((t, i) => {
    lines.push(`${i + 1}. *${t.title}*`);
    lines.push(`   • Type: ${t.contentType}`);
    lines.push(`   • Keyword: \`${t.targetKeyword}\``);
    lines.push(`   • Opportunity: ${t.priority} (${t.priorityScore}/100)`);
    lines.push(`   • CTA: ${t.suggestedCta}`);
    lines.push("");
  });

  // Discovery digest — only included when there's something to report.
  if (discoveries.length > 0) {
    lines.push(":telescope: *Top Discovered Opportunities (last 7 days)*");
    lines.push("");
    discoveries.slice(0, 5).forEach((d, i) => {
      lines.push(
        `${i + 1}. *${d.query}*  _via ${d.source.toUpperCase()}_  ` +
          `(score ${d.score}/100)`
      );
      if (d.reason) {
        lines.push(`   • ${d.reason}`);
      }
    });
    lines.push("");
  }

  lines.push(`:point_right: View all: ${appUrl}`);
  return lines.join("\n");
}

export async function postToSlack(webhookUrl: string, text: string) {
  if (!webhookUrl) throw new Error("Missing Slack webhook URL");
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Slack webhook failed: ${res.status} ${body}`);
  }
  return true;
}
