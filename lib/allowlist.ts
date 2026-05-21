// Static allowlist of teammates who can sign in.
//
// To add a teammate without redeploying: set the ALLOWED_EMAILS env var
// in Vercel (comma-separated) — its contents are unioned with this list.
//
// All comparisons are case-insensitive.

export const ALLOWED_EMAILS: string[] = [
  "mayur.pokle@zeni.ai",
  "marketing@zeni.ai"
];
