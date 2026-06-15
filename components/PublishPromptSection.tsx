"use client";

import { useMemo, useState } from "react";
import {
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/components/Toast";
import { copyToClipboard } from "@/lib/utils";
import { useStore } from "@/lib/store";
import type { Task } from "@/lib/types";

// ── PublishPromptSection ──────────────────────────────────────────────
//
// Generates a copy-paste prompt for the user to run in Claude Desktop
// with the Webflow MCP connector enabled. Rather than wiring our own
// Webflow OAuth + REST client, we offload publishing to Claude — the
// user pastes the prompt, Claude uses the Webflow MCP tools to create
// the CMS item AND add internal links to existing content.
//
// The prompt is fully self-contained: article body, meta, slug, FAQs,
// schema, brand context, plus a curated subset of the Content Library
// for the interlinking step. Uses the real Webflow MCP tool names
// (cms_collections_list, cms_collection_get_schema, cms_item_create,
// cms_item_publish) so Claude can execute it directly.
//
// Reference: developers.webflow.com/mcp/reference/overview

// Cap how many existing-content rows we include in the interlinking
// context. ~40 rows ≈ 4KB extra in the prompt, plenty of anchors for
// Claude to choose from without blowing context.
const MAX_INTERLINK_CANDIDATES = 40;

export function PublishPromptSection({ task }: { task: Task }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const existingContent = useStore((s) => s.existingContent);
  const settings = useStore((s) => s.settings);

  const prompt = useMemo(
    () => buildPrompt(task, settings, existingContent),
    [task, settings, existingContent]
  );

  async function handleCopy() {
    try {
      await copyToClipboard(prompt);
      setCopied(true);
      toast("Prompt copied — paste it into Claude Desktop", "success");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  if (!task.content) return null;

  return (
    <div className="rounded-md border border-brand-200 bg-brand-50/40 p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="size-8 rounded-md bg-brand-100 text-brand-700 grid place-items-center shrink-0">
            <Sparkles className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-base font-semibold text-ink-900">
                Publish to Webflow
              </h3>
              <Badge tone="info">via Claude MCP</Badge>
            </div>
            <p className="text-xs text-ink-700 leading-relaxed">
              Copy the prompt below and paste it into{" "}
              <a
                href="https://claude.ai/download"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-700 underline hover:no-underline inline-flex items-center gap-0.5"
              >
                Claude Desktop
                <ExternalLink className="size-3" />
              </a>{" "}
              with the Webflow connector enabled. Claude will create the
              CMS item as a draft AND suggest internal links from your
              Content Library.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <Button variant="primary" onClick={handleCopy} className="!py-1.5">
          {copied ? (
            <>
              <Check className="size-4" />
              Copied
            </>
          ) : (
            <>
              <Copy className="size-4" />
              Copy prompt
            </>
          )}
        </Button>
        <Button
          variant="secondary"
          onClick={() => setExpanded((v) => !v)}
          className="!py-1.5"
        >
          {expanded ? (
            <>
              <ChevronUp className="size-4" />
              Hide preview
            </>
          ) : (
            <>
              <ChevronDown className="size-4" />
              Show preview
            </>
          )}
        </Button>
        <span className="text-[11px] text-ink-500">
          {prompt.length.toLocaleString()} chars · references{" "}
          {Math.min(existingContent.length, MAX_INTERLINK_CANDIDATES)} pages
          for interlinking
        </span>
      </div>

      {expanded ? (
        <pre className="bg-ink-900 text-ink-100 p-3 rounded text-[11px] overflow-auto max-h-96 scrollbar-thin font-mono leading-relaxed whitespace-pre-wrap break-words">
          {prompt}
        </pre>
      ) : (
        <div className="text-[11px] text-ink-500 italic">
          Click <strong>Show preview</strong> if you want to read or edit
          the prompt before copying.
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-brand-200 text-[11px] text-ink-600">
        <strong className="text-ink-800">First time?</strong> In Claude
        Desktop → Settings → Connectors → enable Webflow. You&apos;ll be
        prompted to authorize against your Webflow workspace. The free
        Webflow plan can&apos;t publish to a live domain — you need a paid
        Site plan to push past the staging URL.
      </div>
    </div>
  );
}

// ── Prompt builder ────────────────────────────────────────────────────

function buildPrompt(
  task: Task,
  settings: ReturnType<typeof useStore.getState>["settings"],
  existingContent: ReturnType<typeof useStore.getState>["existingContent"]
): string {
  const c = task.content;
  if (!c) return "";

  const brand =
    settings.companyName ||
    settings.brandNiche ||
    "this brand";
  const targetKeyword = task.topic.targetKeyword;

  // Curate interlinking candidates — exclude this task's own URL if it
  // somehow already exists in the library, take most recent first.
  const candidates = existingContent
    .filter((e) => Boolean(e.url) && Boolean(e.title))
    .slice(0, MAX_INTERLINK_CANDIDATES);

  const lines: string[] = [];

  lines.push(
    "You have access to my Webflow site via the Webflow MCP connector."
  );
  lines.push(
    "I want to (1) publish a new article as a DRAFT CMS item, and (2) add 3-5 internal links from my existing content where they fit naturally."
  );
  lines.push("");
  lines.push("# Article to publish");
  lines.push("");
  lines.push(`**Target keyword:** \`${targetKeyword}\``);
  lines.push(`**Brand context:** ${brand}`);
  lines.push(`**Content type:** ${task.topic.contentType}`);
  if (task.topic.intent)
    lines.push(`**Search intent:** ${task.topic.intent}`);
  lines.push("");
  lines.push("## SEO metadata");
  lines.push(`- **Meta title:** ${c.metaTitle}`);
  lines.push(`- **Meta description:** ${c.metaDescription}`);
  lines.push(`- **URL slug:** \`${c.urlSlug}\``);
  lines.push("");
  lines.push("## Body (markdown)");
  lines.push("");
  lines.push("```markdown");
  lines.push(c.body);
  lines.push("```");
  lines.push("");

  if (c.faqs && c.faqs.length > 0) {
    lines.push("## FAQs");
    lines.push("");
    for (const f of c.faqs) {
      lines.push(`**Q: ${f.q}**`);
      lines.push("");
      lines.push(f.a);
      lines.push("");
    }
  }

  if (c.ctaPlacements && c.ctaPlacements.length > 0) {
    lines.push("## CTA placements (preserve these in the body)");
    for (const p of c.ctaPlacements) {
      lines.push(`- ${p}`);
    }
    lines.push("");
  }

  if (c.schemaJsonLd) {
    lines.push("## JSON-LD schema");
    lines.push("");
    lines.push("```json");
    lines.push(c.schemaJsonLd);
    lines.push("```");
    lines.push("");
  }

  // Interlinking context — the meaty part. Tell Claude what's already
  // published so it can pick semantically related anchors.
  if (candidates.length > 0) {
    lines.push("# Existing content library (use for internal linking)");
    lines.push("");
    lines.push(
      "When adding internal links, choose 3-5 anchors from THIS list only. " +
        "Match on topical relevance to the surrounding paragraph — do not " +
        "force links. If nothing fits, skip the link rather than stretch."
    );
    lines.push("");
    for (const e of candidates) {
      const kw = e.targetKeyword ? ` — target: "${e.targetKeyword}"` : "";
      lines.push(`- [${e.title}](${e.url})${kw}`);
    }
    lines.push("");
  } else {
    lines.push("# Existing content library");
    lines.push("");
    lines.push(
      "(No existing content uploaded — skip the internal-linking step.)"
    );
    lines.push("");
  }

  // The actual ask — explicit, tool-aware, step-by-step.
  lines.push("# Steps to take");
  lines.push("");
  lines.push(
    "1. **Find the site.** Call `sites_list` and pick the site matching " +
      `\`${brand}\`. If multiple match, ask me which one.`
  );
  lines.push(
    "2. **Find the blog collection.** Call `cms_collections_list` for " +
      "that site. Pick the collection that looks like a blog / articles / " +
      "posts collection (often named \"Blog Posts\", \"Articles\", or " +
      "similar). If ambiguous, ask me."
  );
  lines.push(
    "3. **Inspect schema.** Call `cms_collection_get_schema` on that " +
      "collection so you know the exact field names + slugs. Map the " +
      "article fields above to the collection's fields. Common mappings:"
  );
  lines.push("   - `name` ← Meta title (truncate if needed)");
  lines.push("   - `slug` ← URL slug above");
  lines.push("   - `post-body` / `content` / `body` ← Body markdown (convert to rich text / HTML if the field requires it)");
  lines.push("   - `meta-description` / `seo-description` ← Meta description");
  lines.push("   - `summary` / `intro` ← First paragraph of the body");
  lines.push(
    "   - Author, category, featured image: leave blank or use sensible defaults — ask me if blocking."
  );
  lines.push(
    "4. **Insert internal links.** Before creating the item, scan the body " +
      "for 3-5 paragraphs where one of the URLs from the Existing content " +
      "library above would be a natural reference. Edit the markdown body " +
      "to add `[anchor text](URL)` inline. Use anchor text that flows " +
      "naturally — not the target keyword stuffed in."
  );
  lines.push(
    "5. **Create as DRAFT.** Call `cms_item_create` with `isDraft: true` " +
      "(or whatever the equivalent flag is on the current MCP version). " +
      "Do NOT auto-publish. Print the resulting item ID and the staging " +
      "preview URL."
  );
  lines.push(
    "6. **Report back.** Show me a summary: which collection you used, " +
      "the field mapping you chose, which internal links you added (with " +
      "anchor text + destination URL), and any fields you left blank that " +
      "I should fill in before publishing."
  );
  lines.push("");
  lines.push(
    "If anything is ambiguous — field mapping, which collection to use, " +
      "how to convert markdown to Webflow's rich text format — ask me " +
      "before making the create call. Don't guess."
  );

  return lines.join("\n");
}
