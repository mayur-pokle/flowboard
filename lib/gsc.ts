import { google } from "googleapis";

// ── GSC integration helpers ───────────────────────────────────────────
// Centralized OAuth2 client + Search Console API access. Used by the
// OAuth callback, the sites list endpoint, and the sync endpoint.

const REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly"
];

export interface GSCTokens {
  access_token: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expiry_date?: number;
}

export interface GSCMetadata {
  // Selected GSC property — set after OAuth + site picker.
  siteUrl?: string;
  // Account email for display.
  email?: string;
}

function getRedirectUri(): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://flowboard-two-amber.vercel.app";
  return `${appUrl}/api/sources/gsc/oauth/callback`;
}

/**
 * Returns a configured OAuth2 client. Uses GSC_CLIENT_ID / GSC_CLIENT_SECRET
 * env vars. Throws clear error if either is missing.
 */
export function getOAuthClient() {
  const clientId = process.env.GSC_CLIENT_ID;
  const clientSecret = process.env.GSC_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "GSC_CLIENT_ID and GSC_CLIENT_SECRET must be set in env. See console.cloud.google.com → OAuth credentials."
    );
  }
  return new google.auth.OAuth2(clientId, clientSecret, getRedirectUri());
}

export function buildAuthUrl(state: string): string {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline", // request refresh token
    prompt: "consent", // force re-prompt so we always get a refresh_token
    scope: REQUIRED_SCOPES,
    state
  });
}

export async function exchangeCodeForTokens(code: string): Promise<GSCTokens> {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token) {
    throw new Error("GSC token exchange returned no access_token");
  }
  return tokens as GSCTokens;
}

/**
 * Returns the email associated with the OAuth credentials, for display.
 */
export async function getAccountEmail(tokens: GSCTokens): Promise<string> {
  const client = getOAuthClient();
  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ auth: client, version: "v2" });
  const res = await oauth2.userinfo.get();
  return res.data.email || "";
}

/**
 * Lists every Search Console property the OAuth account has access to.
 * Includes both URL-prefix and domain properties.
 */
export async function listSites(tokens: GSCTokens) {
  const client = getOAuthClient();
  client.setCredentials(tokens);
  const sc = google.webmasters({ version: "v3", auth: client });
  const res = await sc.sites.list();
  return (res.data.siteEntry || []).map((s) => ({
    siteUrl: s.siteUrl || "",
    permissionLevel: s.permissionLevel || ""
  }));
}

/**
 * Fetches last-N-days query performance data for a site. Returns rows
 * with query, page, impressions, clicks, ctr, position.
 */
export async function fetchSearchAnalytics(
  tokens: GSCTokens,
  siteUrl: string,
  days = 28
): Promise<
  Array<{
    query: string;
    page: string;
    impressions: number;
    clicks: number;
    ctr: number;
    position: number;
  }>
> {
  const client = getOAuthClient();
  client.setCredentials(tokens);
  const sc = google.webmasters({ version: "v3", auth: client });

  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const res = await sc.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: fmt(startDate),
      endDate: fmt(endDate),
      dimensions: ["query", "page"],
      rowLimit: 5000,
      // Skip rows that already get a lot of clicks — we want
      // opportunities, not winners we already capture.
      dataState: "all"
    }
  });

  return (res.data.rows || []).map((r) => ({
    query: r.keys?.[0] || "",
    page: r.keys?.[1] || "",
    impressions: r.impressions || 0,
    clicks: r.clicks || 0,
    ctr: r.ctr || 0,
    position: r.position || 0
  }));
}

/**
 * Performance for one specific URL over a fixed window. Used by the
 * per-article performance card. Returns null when GSC has no data for
 * the URL in the given window.
 */
export async function fetchUrlPerformance(
  tokens: GSCTokens,
  siteUrl: string,
  pageUrl: string,
  startDate: Date,
  endDate: Date
): Promise<{
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
} | null> {
  const client = getOAuthClient();
  client.setCredentials(tokens);
  const sc = google.webmasters({ version: "v3", auth: client });
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const res = await sc.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: fmt(startDate),
      endDate: fmt(endDate),
      // No dimensions — we want a single aggregate row for this URL.
      dimensionFilterGroups: [
        {
          filters: [
            { dimension: "page", operator: "equals", expression: pageUrl }
          ]
        }
      ],
      rowLimit: 1,
      dataState: "all"
    }
  });
  const row = res.data.rows?.[0];
  if (!row) return null;
  return {
    impressions: row.impressions || 0,
    clicks: row.clicks || 0,
    ctr: row.ctr || 0,
    position: row.position || 0
  };
}

/**
 * Page-level performance for a fixed window. Used by the refresh
 * detector to compare current vs previous periods.
 */
export async function fetchPagePerformance(
  tokens: GSCTokens,
  siteUrl: string,
  startDate: Date,
  endDate: Date
): Promise<
  Array<{
    page: string;
    impressions: number;
    clicks: number;
    ctr: number;
    position: number;
  }>
> {
  const client = getOAuthClient();
  client.setCredentials(tokens);
  const sc = google.webmasters({ version: "v3", auth: client });
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const res = await sc.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: fmt(startDate),
      endDate: fmt(endDate),
      dimensions: ["page"],
      rowLimit: 5000,
      dataState: "all"
    }
  });
  return (res.data.rows || []).map((r) => ({
    page: r.keys?.[0] || "",
    impressions: r.impressions || 0,
    clicks: r.clicks || 0,
    ctr: r.ctr || 0,
    position: r.position || 0
  }));
}
