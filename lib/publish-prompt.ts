// ── Publish-to-Webflow prompt builder ────────────────────────────────
//
// Produces the copy-paste prompt the user pastes into Claude Desktop
// with the Webflow MCP connector enabled. Both surfaces — AI Resources
// (tasks) and AI Discovery (opportunities) — feed this builder with a
// normalized PublishInput so the resulting prompt has the same shape
// and gets the same SEO + interlinking treatment.
//
// Field mappings for THIS workspace's Webflow project come from the
// PublishConfig — set them in Settings → AI providers → Webflow
// publishing. When blank, the prompt tells Claude to introspect the
// schema first.
//
// Reference: developers.webflow.com/mcp/reference/overview

export interface PublishFaq {
  q: string;
  a: string;
}

// Per-workspace Webflow project configuration. Every field is optional
// — the prompt degrades gracefully when a value is missing (Claude
// falls back to schema introspection or asks the user).
export interface PublishConfig {
  siteName?: string;
  collectionName?: string;
  authorName?: string;
  authorsCollection?: string;
  tagsCollection?: string;
  category?: string;
  relatedMax?: number;
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
  // Brand context for the "site identification" step (used as
  // fallback when publishConfig.siteName is blank).
  brandName: string;
  // Per-workspace Webflow publishing config.
  publishConfig?: PublishConfig;
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
    const plain = line
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[*_`]/g, "")
      .trim();
    if (plain.length < 30) continue;
    return plain.slice(0, 155);
  }
  return fallback;
}

// Format today's ISO date. Used for the CMS `date` / `publishedDate`
// field so Claude has a value to fill in.
function todayIso(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

// ── Prompt assembly ──────────────────────────────────────────────────

export function buildPublishPrompt(input: PublishInput): string {
  const cfg = input.publishConfig || {};
  const siteName = cfg.siteName || input.brandName;
  const collectionName = cfg.collectionName || "";
  const authorName = cfg.authorName || "";
  const authorsCollection = cfg.authorsCollection || "Authors";
  const tagsCollection = cfg.tagsCollection || "";
  const category = cfg.category || "";
  const relatedMax = Number.isFinite(cfg.relatedMax) ? cfg.relatedMax : 3;

  const faqs = (input.faqs || []).slice(0, 5);
  const lines: string[] = [];

  lines.push(
    "You have access to my Webflow site via the Webflow MCP connector."
  );
  lines.push(
    "I want to (1) publish a new article as a DRAFT CMS item, and (2) add 3-5 internal links from my existing content where they fit naturally."
  );
  lines.push("");

  // ── Article payload ──
  lines.push("# Article to publish");
  lines.push("");
  lines.push(`**Target keyword:** \`${input.targetKeyword}\``);
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

  if (faqs.length > 0) {
    lines.push("## FAQs (use for numbered FAQ fields)");
    lines.push("");
    faqs.forEach((f, i) => {
      const n = i + 1;
      lines.push(`**FAQ ${n} — Question:** ${f.q}`);
      lines.push(`**FAQ ${n} — Answer:** ${f.a}`);
      lines.push("");
    });
  }

  if (input.ctaPlacements && input.ctaPlacements.length > 0) {
    lines.push("## CTA placements (preserve these in the body)");
    for (const p of input.ctaPlacements) {
      lines.push(`- ${p}`);
    }
    lines.push("");
  }

  // ── Interlinking candidates ──
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

  // ── Step-by-step instructions with concrete field mappings ──
  lines.push("# Steps to take");
  lines.push("");

  // 1. Site
  if (cfg.siteName) {
    lines.push(
      `1. **Find the site.** Call \`sites_list\` and pick the site whose name matches **"${cfg.siteName}"**. If it doesn't appear exactly, pick the closest match and confirm with me.`
    );
  } else {
    lines.push(
      `1. **Find the site.** Call \`sites_list\` and pick the site matching \`${siteName}\`. If multiple match, ask me which one.`
    );
  }

  // 2. Collection
  if (cfg.collectionName) {
    lines.push(
      `2. **Open the target collection.** Call \`cms_collections_list\` for that site, then \`cms_collection_get_schema\` on the collection named **"${cfg.collectionName}"**. Do not use a different collection unless I tell you to.`
    );
  } else {
    lines.push(
      `2. **Find the blog collection.** Call \`cms_collections_list\` for that site. Pick the collection that looks like a blog / articles / posts collection. Then call \`cms_collection_get_schema\` on it. If ambiguous, ask me.`
    );
  }

  // 3. Field mapping
  lines.push("3. **Map the article to the collection's fields.** Use these mappings:");
  lines.push("   - `name` ← Meta title (truncate if it exceeds the field's max length)");
  lines.push("   - `slug` ← URL slug above");
  lines.push(
    "   - Body field (usually `post-body`, `content`, or `body`) ← Body markdown, converted to Webflow rich text if the field is a Rich Text type"
  );
  lines.push("   - `meta-description` / `seo-description` ← Meta description");
  lines.push("   - `summary` / `intro` ← First substantive paragraph of the body");
  lines.push(`   - **Date field** (\`date\`, \`published-date\`, or similar) ← \`${todayIso()}\` (today's date, ISO format)`);

  // 4. Author
  if (authorName) {
    lines.push(
      `4. **Set the author.** The Author field is a reference into the **${authorsCollection}** collection. Call \`cms_items_list\` on that collection to find the item whose name is **"${authorName}"**, and set the article's author reference to that item's id. If **"${authorName}"** doesn't exist, ask me before creating anything new.`
    );
  } else {
    lines.push(
      `4. **Set the author.** If the collection has an Author reference field, ask me which author to assign — don't guess.`
    );
  }

  // 5. Category
  if (category) {
    lines.push(
      `5. **Set the category.** Assign the article's Category field to **"${category}"**. If Category is a reference to another collection, look up the item with that name and use its id.`
    );
  } else {
    lines.push(
      `5. **Set the category.** If a Category field exists, ask me which value to use — don't leave it blank if the field is required.`
    );
  }

  // 6. Tags
  if (tagsCollection) {
    lines.push(
      `6. **Choose tags.** Tags is a multi-reference into the **${tagsCollection}** collection. Call \`cms_items_list\` on that collection, then pick 2-5 tags whose names semantically match this article (based on the target keyword + body). Assign the array of item ids to the Tags field. If nothing fits well, leave blank rather than force irrelevant tags — but flag it in your report so I can add tags manually.`
    );
  } else {
    lines.push(
      `6. **Choose tags.** If a Tags field exists, ask me which tag collection to pull from — don't leave tag fields blank if the field is required.`
    );
  }

  // 7. Related posts
  if (relatedMax && relatedMax > 0) {
    lines.push(
      `7. **Choose related posts.** Related Posts is a multi-reference into the same blog collection. From the Existing content library above, pick UP TO ${relatedMax} items that are most topically adjacent to this article. Look up each item in the blog collection by name/slug and set the Related Posts field to the array of matching item ids. If fewer than ${relatedMax} good matches exist, use fewer — quality over quantity.`
    );
  }

  // 8. FAQs
  if (faqs.length > 0) {
    lines.push(
      `8. **Fill the FAQ fields carefully.** The collection has PAIRED FAQ fields named exactly:`
    );
    for (let i = 1; i <= 5; i++) {
      lines.push(`   - \`FAQ ${i} - Question\` (plain text)`);
      lines.push(`   - \`FAQ ${i} - Answer\` (plain text)`);
    }
    lines.push(
      `   Fill each Q/A pair into its numbered field. Do NOT concatenate all FAQs into one field. If we have fewer than 5 FAQs, leave the unused numbered fields blank.`
    );
    lines.push(
      `   Use the FAQ list in the "FAQs" section above for the exact question/answer text — do not paraphrase.`
    );
  } else {
    lines.push(
      "8. **Fill the FAQ fields.** If the collection has numbered FAQ fields (`FAQ 1 - Question`, `FAQ 1 - Answer`, etc.), leave them blank — no FAQs were provided in this article payload."
    );
  }

  // 9. Interlinking
  lines.push(
    "9. **Insert 3-5 internal links inside the body.** Scan the markdown body for paragraphs where a URL from the Existing content library above would be a natural reference. Edit the body markdown IN PLACE to add `[anchor text](URL)` inline. Anchor text should flow naturally — do not stuff the target keyword. If a paragraph has no natural link fit, skip it."
  );

  // 10. Create as draft
  lines.push(
    "10. **Create as DRAFT.** Call `cms_item_create` with `isDraft: true` (or whatever the equivalent flag is on the current MCP version). Do NOT auto-publish. Print the resulting item ID and the staging preview URL."
  );

  // 11. Report back
  lines.push(
    "11. **Report back.** Show me a summary: which collection you used, the field mapping you applied, which author + category + tags you assigned, the internal links you added (with anchor text + destination URL), which numbered FAQ fields you populated, which fields you had to leave blank, and any places you had to guess so I can review before publishing."
  );
  lines.push("");
  lines.push(
    "If anything is ambiguous — field mapping, which collection to use, how to convert markdown to Webflow's rich-text format, which tag names to pick — ask me before making the create call. Don't guess on high-stakes choices."
  );

  return lines.join("\n");
}
