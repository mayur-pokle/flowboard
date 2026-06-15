// ── SEMrush API client ────────────────────────────────────────────────
//
// SEMrush returns semicolon-delimited CSV by default. Auth is via the
// `key` query param. Costs are per-row (API credits), so we cap result
// rows aggressively.
//
// Reference: https://www.semrush.com/api-analytics/

const BASE = "https://api.semrush.com/";

export interface SemrushCredentials {
  apiKey: string;
  database?: string; // e.g. "us", "uk", "in" — defaults to "us"
}

export interface SemrushKeywordRow {
  keyword: string;
  position: number;
  searchVolume: number;
  cpc: number;
  url: string;
  trafficPercent: number;
  competition: number;
}

// Minimal request to validate the key. We use a tiny `domain_ranks`
// call against a known domain — cheaper than `domain_organic`.
export async function testConnection(creds: SemrushCredentials): Promise<{
  ok: boolean;
  message?: string;
}> {
  const params = new URLSearchParams({
    type: "domain_ranks",
    key: creds.apiKey,
    domain: "semrush.com",
    database: creds.database || "us",
    export_columns: "Db,Dn,Or,Ot"
  });
  try {
    const res = await fetch(`${BASE}?${params.toString()}`, {
      cache: "no-store"
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, message: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    if (text.startsWith("ERROR")) {
      return { ok: false, message: text.slice(0, 200) };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: (err as Error).message || "Network error"
    };
  }
}

// Returns up to `limit` organic keywords a competitor ranks for, sorted
// by traffic descending — i.e. their best-performing terms.
export async function fetchCompetitorKeywords(
  creds: SemrushCredentials,
  competitorDomain: string,
  limit = 100
): Promise<SemrushKeywordRow[]> {
  const params = new URLSearchParams({
    type: "domain_organic",
    key: creds.apiKey,
    domain: stripDomain(competitorDomain),
    database: creds.database || "us",
    display_limit: String(limit),
    // Ph (keyword), Po (position), Nq (search volume), Cp (cpc), Ur
    // (url), Tg (traffic %), Co (competition).
    export_columns: "Ph,Po,Nq,Cp,Ur,Tg,Co"
  });
  const res = await fetch(`${BASE}?${params.toString()}`, {
    cache: "no-store"
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`SEMrush ${res.status}: ${text.slice(0, 200)}`);
  }
  if (text.startsWith("ERROR")) {
    throw new Error(text.slice(0, 200));
  }
  return parseCsv(text);
}

function parseCsv(text: string): SemrushKeywordRow[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) return [];
  // First line is the header — skip.
  const rows: SemrushKeywordRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(";");
    if (cols.length < 7) continue;
    const keyword = cols[0]?.trim();
    if (!keyword) continue;
    rows.push({
      keyword,
      position: Number(cols[1]) || 0,
      searchVolume: Number(cols[2]) || 0,
      cpc: Number(cols[3]) || 0,
      url: cols[4]?.trim() || "",
      trafficPercent: Number(cols[5]) || 0,
      competition: Number(cols[6]) || 0
    });
  }
  return rows;
}

function stripDomain(input: string): string {
  return input
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .trim()
    .toLowerCase();
}
