import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { findUser } from "@/lib/allowlist";
import { db } from "@/db";
import { users } from "@/db/schema";

// NextAuth v4 config — email + password credentials.
//
// We use JWT sessions instead of database sessions because the Credentials
// provider can't write back to the adapter on every login (NextAuth design).
// The next-auth DB tables in db/schema.ts (users, sessions, accounts,
// verificationTokens) are unused under this config but kept so the schema
// is forward-compatible if we re-introduce magic-link / OAuth later.

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 }, // 7 days
  pages: { signIn: "/sign-in" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: {
          label: "Email",
          type: "email",
          placeholder: "you@zeni.ai"
        },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        const email = credentials?.email?.toString() || "";
        const password = credentials?.password?.toString() || "";
        if (!email || !password) return null;
        const user = findUser(email, password);
        if (!user) return null;

        // Best-effort upsert into the users table so the row exists for any
        // future joins / audits. Failures here are non-fatal — we still let
        // the user sign in even if the DB is briefly unreachable.
        try {
          await db
            .insert(users)
            .values({
              id: user.id,
              email: user.email,
              name: user.name || user.email
            })
            .onConflictDoNothing({ target: users.id });
        } catch (err) {
          console.warn("[auth] user upsert failed:", (err as Error).message);
        }

        // The object returned here becomes the JWT payload's "user".
        return {
          id: user.id,
          email: user.email,
          name: user.name || user.email
        };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      // On first sign-in `user` is populated. Stash id + email onto the token.
      if (user) {
        token.id = (user as { id?: string }).id;
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token) {
        session.user.id = (token.id as string) || (token.sub as string) || "";
        if (token.email) session.user.email = token.email as string;
      }
      return session;
    }
  }
};
