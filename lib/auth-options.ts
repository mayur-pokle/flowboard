import type { NextAuthOptions } from "next-auth";
import EmailProvider from "next-auth/providers/email";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import {
  users,
  accounts,
  sessions,
  verificationTokens
} from "@/db/schema";
import { ALLOWED_EMAILS } from "@/lib/allowlist";

// NextAuth v4 config. Email magic-link only.
//
// Why allowlist:
//   This is an internal app. We accept sign-ins only from emails listed in
//   ALLOWED_EMAILS (or the ALLOWED_EMAILS env var, comma-separated). New
//   teammates are added by appending to that list — no code-level user record
//   creation needed. NextAuth provisions the user row automatically on first
//   successful sign-in.

function getAllowlist(): Set<string> {
  const fromEnv = (process.env.ALLOWED_EMAILS || "")
    .split(/[,;\s]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const combined = [...ALLOWED_EMAILS, ...fromEnv].map((e) => e.toLowerCase());
  return new Set(combined);
}

export const authOptions: NextAuthOptions = {
  // The "as any" is required because @auth/drizzle-adapter expects v5-style
  // tables in some versions; passing them explicitly is reliable across both.
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any),
  session: { strategy: "database" },
  pages: {
    signIn: "/sign-in",
    verifyRequest: "/sign-in?check-email=1"
  },
  providers: [
    EmailProvider({
      server: {
        host: process.env.EMAIL_SERVER_HOST || "smtp.resend.com",
        port: Number(process.env.EMAIL_SERVER_PORT || 465),
        auth: {
          user: process.env.EMAIL_SERVER_USER || "resend",
          pass: process.env.EMAIL_SERVER_PASSWORD || ""
        },
        secure: true
      },
      from: process.env.EMAIL_FROM || "Flowboard <onboarding@resend.dev>",
      maxAge: 60 * 60 // links valid 1 hour
    })
  ],
  callbacks: {
    async signIn({ user }) {
      // Allow only allowlisted emails.
      if (!user.email) return false;
      const allowed = getAllowlist();
      if (allowed.size === 0) {
        // If no allowlist is configured at all, fail closed.
        console.warn("[auth] ALLOWED_EMAILS is empty; denying sign-in.");
        return false;
      }
      return allowed.has(user.email.toLowerCase());
    },
    async session({ session, user }) {
      // Expose the user id and role to client/server consumers.
      if (session.user) {
        session.user.id = user.id;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.user as any).role = (user as any).role || "member";
      }
      return session;
    }
  }
};
