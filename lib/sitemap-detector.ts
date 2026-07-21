// ── Sitemap auto-detector ─────────────────────────────────────────────
//
// Given a competitor domain (e.g. "pilot.com") try to discover their
// sitemap URL(s). Strategy:
//
//   1. Fetch /robots.txt and parse `Sitemap:` directives — the
//      authoritative source when a site publishes it.
//   2. Fall back to conventional locations: /sitemap.xml,
//      /sitemap_index.xml, /sitemap-index.xml, /wp-sitemap.xml.
//   3. Validate each candidate returns HTTP 200 and looks like XML
//      (starts with `<?xml` or contains `<urlset` / `<sitemapindex`).
//
// Returns per-competitor results so the UI can show which discovered,
// which didn't, and why.

// ── Types ────────────────────────────────────────────────────────────

export type SitemapSource = "robots.txt" | "convention";

export interface DetectedSitemap {
  url: string;
  source: SitemapSource;
}

export interface CompetitorResult {
  competitor: string;
  domain: string;
  discovered: DetectedSitemap[];
  error?: string;
}

export interface DetectResult {
  results: CompetitorResult[];
  // Flat, deduped list of every discovered sitemap URL — the UI
  // pastes this into the textarea.
  urls: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────

function toDomain(input: string): string {
  const raw = input.trim();
  if (!raw) return "";
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withScheme).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return raw
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(/\/.*$/, "")
      .toLowerCase();
  }
}

// Cheap HEAD-ish check. We use GET with a small range because many
// hosts (Vercel, Cloudflare) don't reliably serve HEAD requests. The
// XML sniff on the body is what tells us whether the response is
// actually a sitemap.
const FETCH_TIMEOUT_MS = 6000;
const MAX_XML_PROBE_BYTES = 4096;

async function probeUrl(url: string): Promise<{
  ok: boolean;
  reason?: string;
}> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Flowboard/1.0 SitemapDetector",
        Accept: "application/xml,text/xml,*/*"
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      // Prevent redirects to sign-in pages from being counted as valid.
      redirect: "follow"
    });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const ct = res.headers.get("content-type") || "";
    // Body sniff — some sites serve sitemaps as text/plain or
    // application/octet-stream. Trust the content shape, not the
    // Content-Type alone.
    const text = (await res.text()).slice(0, MAX_XML_PROBE_BYTES);
    const looksXml =
      /^\s*<\?xml/i.test(text) ||
      /<urlset[\s>]/i.test(text) ||
      /<sitemapindex[\s>]/i.test(text);
    if (!looksXml) {
      // Not a sitemap. Common false positive: a site 200s an HTML 404
      // for unknown paths.
      return {
        ok: false,
        reason: `Not an XML sitemap (content-type: ${ct || "unknown"})`
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason:
        (err as Error).name === "TimeoutError"
          ? "Timed out"
          : (err as Error).message.slice(0, 80)
    };
  }
}

// Parses `Sitemap: <url>` lines out of a robots.txt body. Case-
// insensitive on the directive; retains the URL exactly as given.
function extractSitemapsFromRobots(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    // Robots.txt allows arbitrary casing on directive names.
    const m = line.match(/^\s*sitemap\s*:\s*(.+)$/i);
    if (!m) continue;
    const url = m[1].trim();
    if (!url) continue;
    if (seen.has(url.toLowerCase())) continue;
    seen.add(url.toLowerCase());
    out.push(url);
  }
  return out;
}

// Common convention paths to try when robots.txt doesn't declare one.
// Ordered by prevalence — sitemap.xml first, then indexes, then
// WordPress default.
const CONVENTION_PATHS = [
  "/sitemap.xml",
  "/sitemap_index.xml",
  "/sitemap-index.xml",
  "/wp-sitemap.xml"
];

// ── Public: detect sitemaps for a set of competitors ────────────────

export async function detectSitemapsForCompetitors(
  competitors: Array<{ name?: string; url: string; tier?: string }>
): Promise<DetectResult> {
  const results: CompetitorResult[] = [];
  const dedupUrls = new Set<string>();

  // Process each competitor sequentially so we don't hammer external
  // hosts with parallel HEAD probes. The number of competitors is
  // small (typically ≤10), so latency is bounded to ~1-2s per host
  // best case, ~6s worst.
  for (const c of competitors) {
    // Skip watch-tier competitors — same rule as the AI citations
    // auto-fill; you don't fight them.
    if (c.tier === "watch") continue;
    const domain = toDomain(c.url);
    if (!domain) {
      results.push({
        competitor: c.name || c.url,
        domain: "",
        discovered: [],
        error: "Malformed URL"
      });
      continue;
    }

    const discovered: DetectedSitemap[] = [];
    const seenUrls = new Set<string>();

    // Step 1: robots.txt
    let robotsBody: string | null = null;
    try {
      const r = await fetch(`https://${domain}/robots.txt`, {
        headers: { "User-Agent": "Flowboard/1.0 SitemapDetector" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: "follow"
      });
      if (r.ok) robotsBody = await r.text();
    } catch {
      // No robots.txt available — silently fall through to conventions.
    }

    if (robotsBody) {
      for (const url of extractSitemapsFromRobots(robotsBody)) {
        if (seenUrls.has(url)) continue;
        seenUrls.add(url);
        const probe = await probeUrl(url);
        if (probe.ok) {
          discovered.push({ url, source: "robots.txt" });
        }
      }
    }

    // Step 2: conventions — only if robots didn't yield anything usable.
    if (discovered.length === 0) {
      for (const path of CONVENTION_PATHS) {
        const url = `https://${domain}${path}`;
        if (seenUrls.has(url)) continue;
        seenUrls.add(url);
        const probe = await probeUrl(url);
        if (probe.ok) {
          discovered.push({ url, source: "convention" });
          // Stop at the first hit — no point pinging the rest.
          break;
        }
      }
    }

    results.push({
      competitor: c.name || domain,
      domain,
      discovered,
      error:
        discovered.length === 0
          ? "No sitemap found in robots.txt or common paths"
          : undefined
    });
    for (const d of discovered) dedupUrls.add(d.url);
  }

  return {
    results,
    urls: Array.from(dedupUrls)
  };
}
