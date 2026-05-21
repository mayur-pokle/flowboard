import type { Topic } from "./types";

export function buildSlackMessage(topics: Topic[], appUrl: string) {
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
