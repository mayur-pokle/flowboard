// Shared sitemap utilities used by import + refresh endpoints.

const FETCH_TIMEOUT_MS = 8000;
// Cap the number of child sitemaps we follow inside a sitemap-index. Big
// publishers (news sites, e-commerce) split sitemaps by year/category and
// can have 100+ children — following them all blows past serverless limits.
// 20 children × ~50k URLs each = a lot.
const MAX_INDEX_CHILDREN = 20;
// Hard ceiling per import. Anything beyond this should use CSV anyway.
export const MAX_URLS_PER_IMPORT = 5000;

export async function fetchWithTimeout(
  url: string,
  ms = FETCH_TIMEOUT_MS
): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, {
      signal: ctl.signal,
      headers: { "User-Agent": "FlowboardBot/1.0 (+content audit)" }
    });
  } finally {
    clearTimeout(t);
  }
}

export function normalizeSitemapInput(input: string): string {
  let s = input.trim();
  if (!s) return s;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  if (!/sitemap.*\.xml(\?|$)/i.test(s)) {
    s = s.replace(/\/+$/, "") + "/sitemap.xml";
  }
  return s;
}

function extractLocs(xml: string): string[] {
  const matches = xml.match(/<loc>([^<]+)<\/loc>/gi) || [];
  return matches
    .map((m) => m.replace(/<\/?loc>/gi, "").trim())
    .filter(Boolean);
}

// Fetch a sitemap URL. If it's a sitemap-index, follow up to MAX_INDEX_CHILDREN
// child sitemaps and aggregate their URLs. Always returns a deduped list capped
// at MAX_URLS_PER_IMPORT.
export async function fetchAllSitemapUrls(
  sitemapUrl: string
): Promise<{ urls: string[]; truncated: boolean }> {
  const res = await fetchWithTimeout(sitemapUrl);
  if (!res.ok) {
    throw new Error(`Sitemap fetch failed: ${res.status}`);
  }
  const xml = await res.text();
  let urls = extractLocs(xml);

  // Sitemap-index — follow children in parallel (capped).
  if (/<sitemapindex/i.test(xml)) {
    const children = urls.slice(0, MAX_INDEX_CHILDREN);
    urls = [];
    const childResults = await Promise.allSettled(
      children.map(async (child) => {
        const r = await fetchWithTimeout(child);
        if (!r.ok) return [];
        const cx = await r.text();
        return extractLocs(cx);
      })
    );
    for (const cr of childResults) {
      if (cr.status === "fulfilled") urls.push(...cr.value);
    }
  }

  const dedup = Array.from(new Set(urls));
  if (dedup.length > MAX_URLS_PER_IMPORT) {
    return { urls: dedup.slice(0, MAX_URLS_PER_IMPORT), truncated: true };
  }
  return { urls: dedup, truncated: false };
}

// Turn a URL into a reasonable human title without fetching the page.
// e.g. "https://acme.com/blog/best-roi-calculators" -> "Best ROI Calculators"
export function titleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, "");
    if (!path || path === "/") return u.hostname.replace(/^www\./, "") || url;
    const last = path.split("/").filter(Boolean).pop() || "";
    const words = last
      .replace(/\.(html?|php|aspx?)$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\d+\b/g, "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (words.length === 0) return path || url;
    // Title-case each word but preserve all-caps acronyms (ROI, SaaS, etc.).
    return words
      .map((w) =>
        /^[A-Z]{2,}$/.test(w) ? w : w[0].toUpperCase() + w.slice(1).toLowerCase()
      )
      .join(" ");
  } catch {
    return url;
  }
}

// Extract <title> from an HTML page. Returns "" if not found.
export function extractTitleFromHtml(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return "";
  return m[1]
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}
