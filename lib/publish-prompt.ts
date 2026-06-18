// ── Publish-to-Webflow prompt builder ────────────────────────────────
//
// Produces the copy-paste prompt the user pastes into Claude Desktop
// with the Webflow MCP connector enabled. Both surfaces — AI Resources
// (tasks) and AI Discovery (opportunities) — feed this builder with a
// normalized PublishInput so the resulting prompt has the same shape
// and gets the same SEO + interlinking treatment.
//
// Reference: developers.webflow.com/mcp/reference/overview

export interface PublishFaq {
  q: string;
  a: string;
}

export interface PublishInput {
  // The article's source-of-truth fields. For AI Resources these come
  // from task.content; for Discovery they're derived from the
  // opportunity + briefData.
  title: string;
  targetKeyword: string;
  contentType: string;
  intent?: string;
  // SEO metadata. Build sensible defaults at the call site when the
  // source doesn't carry them.
  metaTitle: string;
  metaDescription: string;
  urlSlug: string;
  // Body markdown — the full article.
  body: string;
  // Optional structured fields. Discovery articles usually only have
  // body markdown; AI Resources tasks have all of these populated.
  faqs?: PublishFaq[];
  ctaPlacements?: string[];
  schemaJsonLd?: string;
  // Brand context for the "site identification" step.
  brandName: string;
  // Existing-content library for the interlinking step. Limit to a
  // reasonable count at the call site (default 40 — see
  // MAX_INTERLINK_CANDIDATES below).
  interlinkCandidates: Array<{
    url: string;
    title: string;
    targetKeyword?: string;
  }>;
}

export const MAX_INTERLINK_CANDIDATES = 40;

// ── Slug + meta derivation helpers ───────────────────────────────────
// Discovery articles often don't carry pre-baked slug/meta fields, so
// these helpers give the caller a sensible default in one line.

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

// Derive a meta description from the article body — first paragraph,
// trimmed to ~155 chars. Skips headings and HTML.
export function deriveMetaDescription(body: string, fallback = ""): string {
  const lines = body.split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#") || line.startsWith(">") || line.startsWith("|"))
      continue;
    if (line.startsWith("```")) continue;
    // Strip basic markdown
    const plain = line
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[*_`]/g, "")
      .trim();
    if (plain.length < 30) continue;
    return plain.slice(0, 155);
  }
  return fallback;
}

// ── Prompt assembly ──────────────────────────────────────────────────

export function buildPublishPrompt(input: PublishInput): string {
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
  lines.push(`**Target keyword:** \`${input.targetKeyword}\``);
  lines.push(`**Brand context:** ${input.brandName}`);
  lines.push(`**Content type:** ${input.contentType}`);
  if (input.intent) lines.push(`**Search intent:** ${input.intent}`);
  lines.push("");
  lines.push("## SEO metadata");
  lines.push(`- **Meta title:** ${input.metaTitle}`);
  lines.push(`- **Meta description:** ${input.metaDescription}`);
  lines.push(`- **URL slug:** \`${input.urlSlug}\``);
  lines.push("");
  lines.push("## Body (markdown)");
  lines.push("");
  lines.push("```markdown");
  lines.push(input.body);
  lines.push("```");
  lines.push("");

  if (input.faqs && input.faqs.length > 0) {
    lines.push("## FAQs");
    lines.push("");
    for (const f of input.faqs) {
      lines.push(`**Q: ${f.q}**`);
      lines.push("");
      lines.push(f.a);
      lines.push("");
    }
  }

  if (input.ctaPlacements && input.ctaPlacements.length > 0) {
    lines.push("## CTA placements (preserve these in the body)");
    for (const p of input.ctaPlacements) {
      lines.push(`- ${p}`);
    }
    lines.push("");
  }

  if (input.schemaJsonLd) {
    lines.push("## JSON-LD schema");
    lines.push("");
    lines.push("```json");
    lines.push(input.schemaJsonLd);
    lines.push("```");
    lines.push("");
  }

  // Interlinking context
  if (input.interlinkCandidates.length > 0) {
    lines.push("# Existing content library (use for internal linking)");
    lines.push("");
    lines.push(
      "When adding internal links, choose 3-5 anchors from THIS list only. " +
        "Match on topical relevance to the surrounding paragraph — do not " +
        "force links. If nothing fits, skip the link rather than stretch."
    );
    lines.push("");
    for (const e of input.interlinkCandidates) {
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

  // Step-by-step instructions
  lines.push("# Steps to take");
  lines.push("");
  lines.push(
    "1. **Find the site.** Call `sites_list` and pick the site matching " +
      `\`${input.brandName}\`. If multiple match, ask me which one.`
  );
  lines.push(
    "2. **Find the blog collection.** Call `cms_collections_list` for " +
      "that site. Pick the collection that looks like a blog / articles / " +
      'posts collection (often named "Blog Posts", "Articles", or ' +
      "similar). If ambiguous, ask me."
  );
  lines.push(
    "3. **Inspect schema.** Call `cms_collection_get_schema` on that " +
      "collection so you know the exact field names + slugs. Map the " +
      "article fields above to the collection's fields. Common mappings:"
  );
  lines.push("   - `name` ← Meta title (truncate if needed)");
  lines.push("   - `slug` ← URL slug above");
  lines.push(
    "   - `post-body` / `content` / `body` ← Body markdown (convert to rich text / HTML if the field requires it)"
  );
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
