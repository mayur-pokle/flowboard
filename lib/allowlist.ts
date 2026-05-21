// ─────────────────────────────────────────────────────────────────────
// User list for credentials sign-in.
//
// ⚠️  SECURITY NOTE
// Passwords are stored in plaintext in this file, which means anyone who
// can read the deployed source (or the GitHub repo) can read them. This
// is acceptable for a closed internal preview, but is NOT acceptable
// for production. To harden:
//   1. Move user records to the `users` table in Postgres.
//   2. Store passwords as bcrypt / argon2 hashes.
//   3. Compare hashes inside the `authorize()` callback.
//
// To add a teammate: append to USERS, commit, redeploy.
// Email matching is case-insensitive; passwords are exact.
// ─────────────────────────────────────────────────────────────────────

export interface AppUser {
  id: string;
  email: string;
  password: string;
  name?: string;
}

export const USERS: AppUser[] = [
  {
    id: "user_mayur",
    email: "mayur.pokle@zeni.ai",
    password: "Zeniai@123",
    name: "Mayur Pokle"
  },
  {
    id: "user_marketing",
    email: "marketing@zeni.ai",
    password: "marketing@123",
    name: "Marketing"
  }
];

export function findUser(
  email: string,
  password: string
): AppUser | null {
  const normalized = email.trim().toLowerCase();
  return (
    USERS.find(
      (u) => u.email.toLowerCase() === normalized && u.password === password
    ) ?? null
  );
}
