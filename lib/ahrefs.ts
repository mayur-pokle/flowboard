// ── Ahrefs API v3 client ──────────────────────────────────────────────
//
// Bearer-token auth. JSON responses. v3 endpoints live under
// https://api.ahrefs.com/v3/ and require a paid API plan.
//
// Reference: https://ahrefs.com/api/documentation

const BASE = "https://api.ahrefs.com/v3";

export interface AhrefsCredentials {
  apiKey: string;
  country?: string; // ISO-3166-1 alpha-2 (default "us")
}

export interface AhrefsKeywordRow {
  keyword: string;
  position: number;
  searchVolume: number;
  url: string;
  difficulty?: number;
  trafficValue?: number;
}

async function ahrefsFetch(
  apiKey: string,
  path: string,
  params: Record<string, string>
): Promise<Response> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json"
    },
    cache: "no-store"
  });
}

export async function testConnection(
  creds: AhrefsCredentials
): Promise<{ ok: boolean; message?: string }> {
  try {
    // Hit a cheap endpoint — subscription_info doesn't burn rows.
    const res = await ahrefsFetch(creds.apiKey, "/subscription-info/limits-and-usage", {});
    if (!res.ok) {
      const body = await res.text();
      return {
        ok: false,
        message: `HTTP ${res.status}: ${body.slice(0, 200)}`
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: (err as Error).message || "Network error"
    };
  }
}

// Returns top organic keywords for a domain — keywords it ranks for in
// positions we care about, sorted by search volume.
export async function fetchOrganicKeywords(
  creds: AhrefsCredentials,
  domain: string,
  limit = 100
): Promise<AhrefsKeywordRow[]> {
  const params: Record<string, string> = {
    target: stripDomain(domain),
    country: creds.country || "us",
    limit: String(limit),
    order_by: "volume:desc",
    // Only top-30 rankings — beyond that the data is too sparse.
    "position[lte]": "30",
    select: "keyword,position,volume,url,difficulty,traffic_value"
  };
  const res = await ahrefsFetch(
    creds.apiKey,
    "/site-explorer/organic-keywords",
    params
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Ahrefs ${res.status}: ${text.slice(0, 200)}`);
  }
  let data: { keywords?: Array<Record<string, unknown>> };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `Ahrefs returned non-JSON response: ${text.slice(0, 200)}`
    );
  }
  const rows = Array.isArray(data?.keywords) ? data.keywords : [];
  return rows
    .map((r) => ({
      keyword: String(r.keyword || ""),
      position: Number(r.position) || 0,
      searchVolume: Number(r.volume) || 0,
      url: String(r.url || ""),
      difficulty:
        typeof r.difficulty === "number" ? r.difficulty : undefined,
      trafficValue:
        typeof r.traffic_value === "number"
          ? r.traffic_value
          : undefined
    }))
    .filter((r) => r.keyword);
}

function stripDomain(input: string): string {
  return input
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .trim()
    .toLowerCase();
}
