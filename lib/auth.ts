// Deprecated. NextAuth (lib/auth-options.ts) is now the source of truth for
// authentication. This file is kept only to avoid breaking stale imports.
//
// The hardcoded credential gate has been replaced with email magic links
// (NextAuth EmailProvider) and an allowlist (lib/allowlist.ts). The old
// USERS export here is no longer consulted anywhere.

export const USERS: { email: string; password: string }[] = [];

export function verifyCredentials(): null {
  return null;
}
