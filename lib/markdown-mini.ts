// ── Tiny markdown renderer ────────────────────────────────────────────
//
// Just enough markdown for Brief + Content previews: headings, bold,
// italic, inline code, links, lists, blockquotes, fenced code blocks,
// horizontal rules, and tables. Output is HTML-string suitable for
// dangerouslySetInnerHTML — we escape user input first, then
// re-introduce markdown formatting.
//
// We don't pull in a full library because (a) bundle size and (b) the
// brief + content surfaces are constrained enough that this covers
// 99% of cases.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inline(s: string): string {
  // Inline code first so we don't re-process its content.
  let out = s.replace(
    /`([^`]+)`/g,
    (_, code) =>
      `<code class="px-1 py-0.5 rounded bg-ink-100 text-ink-900 font-mono text-[0.85em]">${escapeHtml(code)}</code>`
  );
  // Bold (** or __)
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  // Italic (* or _)
  out = out.replace(/(^|[^*])\*([^*\n]+)\*([^*]|$)/g, "$1<em>$2</em>$3");
  out = out.replace(/(^|[^_])_([^_\n]+)_([^_]|$)/g, "$1<em>$2</em>$3");
  // Links [text](url)
  out = out.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_, text, href) =>
      `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" class="text-brand-700 hover:underline">${text}</a>`
  );
  return out;
}

export function renderMarkdown(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw;

    // Fenced code block
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      out.push(
        `<pre class="my-3 p-3 bg-ink-900 text-ink-50 rounded-lg overflow-x-auto text-xs leading-relaxed"><code data-lang="${escapeHtml(lang)}">${escapeHtml(buf.join("\n"))}</code></pre>`
      );
      continue;
    }

    // Headings
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const text = inline(escapeHtml(heading[2]));
      const sizes = [
        "text-2xl",
        "text-xl",
        "text-lg",
        "text-base",
        "text-sm",
        "text-xs"
      ];
      out.push(
        `<h${level} class="font-semibold text-ink-900 mt-4 mb-2 ${sizes[level - 1]}">${text}</h${level}>`
      );
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+\s*$/.test(line)) {
      out.push(`<hr class="my-4 border-ink-200" />`);
      i++;
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      out.push(
        `<blockquote class="my-3 pl-3 border-l-2 border-ink-300 text-ink-700 italic">${inline(
          escapeHtml(buf.join(" "))
        )}</blockquote>`
      );
      continue;
    }

    // Table (line with pipes + next line with separator)
    if (
      /\|/.test(line) &&
      i + 1 < lines.length &&
      /^\s*\|?[-:\s|]+\|?\s*$/.test(lines[i + 1])
    ) {
      const header = line
        .split("|")
        .map((c) => c.trim())
        .filter((_, idx, arr) => idx > 0 || arr[0] !== "")
        .filter((c, idx, arr) => !(idx === arr.length - 1 && c === ""));
      i += 2; // skip header + separator
      const rows: string[][] = [];
      while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim() !== "") {
        const cells = lines[i]
          .split("|")
          .map((c) => c.trim())
          .filter((_, idx, arr) => idx > 0 || arr[0] !== "")
          .filter((c, idx, arr) => !(idx === arr.length - 1 && c === ""));
        rows.push(cells);
        i++;
      }
      out.push(
        `<div class="my-3 overflow-x-auto border border-ink-200 rounded-lg"><table class="w-full text-sm">` +
          `<thead class="bg-ink-50 border-b border-ink-200"><tr>${header
            .map(
              (h) =>
                `<th class="text-left font-semibold text-ink-900 px-3 py-2">${inline(
                  escapeHtml(h)
                )}</th>`
            )
            .join("")}</tr></thead><tbody>` +
          rows
            .map(
              (r) =>
                `<tr class="border-t border-ink-100">${r
                  .map(
                    (c) =>
                      `<td class="px-3 py-2 text-ink-700 align-top">${inline(
                        escapeHtml(c)
                      )}</td>`
                  )
                  .join("")}</tr>`
            )
            .join("") +
          `</tbody></table></div>`
      );
      continue;
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        const text = lines[i].replace(/^\s*[-*]\s+/, "");
        items.push(`<li>${inline(escapeHtml(text))}</li>`);
        i++;
      }
      out.push(
        `<ul class="my-2 ml-5 list-disc space-y-1 text-ink-700">${items.join("")}</ul>`
      );
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        const text = lines[i].replace(/^\s*\d+\.\s+/, "");
        items.push(`<li>${inline(escapeHtml(text))}</li>`);
        i++;
      }
      out.push(
        `<ol class="my-2 ml-5 list-decimal space-y-1 text-ink-700">${items.join("")}</ol>`
      );
      continue;
    }

    // Paragraph: gather contiguous non-blank lines
    if (line.trim() === "") {
      i++;
      continue;
    }
    const paraBuf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,6}\s|>|\s*[-*]\s|\s*\d+\.\s|---+\s*$|```)/.test(lines[i])
    ) {
      paraBuf.push(lines[i]);
      i++;
    }
    out.push(
      `<p class="my-2 text-ink-700 leading-relaxed">${inline(
        escapeHtml(paraBuf.join(" "))
      )}</p>`
    );
  }
  return out.join("");
}
