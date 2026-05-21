"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Sidebar } from "@/components/Sidebar";
import { useStore } from "@/lib/store";
import { toast } from "@/components/Toast";

const MIGRATION_LOCAL_FLAG = "flowboard.migrated_to_db";
const LEGACY_STORE_KEY = "flowboard-store-v1";

/**
 * Top-level shell. NextAuth owns the session — we just gate routing and
 * orchestrate two extra concerns:
 *   1. Hydrate the in-memory store from the DB once we know the user is in.
 *   2. Best-effort migration of any leftover localStorage state from the
 *      previous (pre-DB) version of the app.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const isSignInPage = pathname === "/sign-in";

  const hydrated = useStore((s) => s.hydrated);
  const hydrate = useStore((s) => s.hydrate);
  const migratedRef = useRef(false);

  // Redirect rules
  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated" && !isSignInPage) {
      router.replace("/sign-in");
    } else if (status === "authenticated" && isSignInPage) {
      router.replace("/board");
    }
  }, [status, isSignInPage, router]);

  // Hydrate store + run one-time migration after sign-in.
  useEffect(() => {
    if (status !== "authenticated") return;
    if (migratedRef.current) return;
    migratedRef.current = true;
    (async () => {
      try {
        await maybeMigrateLegacyLocalStorage();
      } finally {
        await hydrate();
      }
    })();
  }, [status, hydrate]);

  if (status === "loading") {
    return (
      <div className="min-h-screen grid place-items-center text-ink-400 text-sm">
        Loading…
      </div>
    );
  }

  if (status === "unauthenticated") {
    return <div className="min-h-screen">{children}</div>;
  }

  // Authenticated
  if (!hydrated) {
    return (
      <div className="min-h-screen grid place-items-center text-ink-400 text-sm">
        Loading your workspace…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 flex flex-col">{children}</main>
    </div>
  );
}

async function maybeMigrateLegacyLocalStorage() {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(MIGRATION_LOCAL_FLAG) === "1") return;

  // Check server-side flag first — if already migrated by someone else,
  // mark locally and skip.
  try {
    const r = await fetch("/api/migrate");
    if (r.ok) {
      const { migrated } = (await r.json()) as { migrated: boolean };
      if (migrated) {
        localStorage.setItem(MIGRATION_LOCAL_FLAG, "1");
        return;
      }
    }
  } catch {
    /* If we can't reach the API, skip migration silently */
    return;
  }

  // Read legacy zustand-persist snapshot (if any)
  const raw = localStorage.getItem(LEGACY_STORE_KEY);
  if (!raw) {
    localStorage.setItem(MIGRATION_LOCAL_FLAG, "1");
    return;
  }
  let snapshot: { state?: Record<string, unknown> } | null = null;
  try {
    snapshot = JSON.parse(raw) as { state?: Record<string, unknown> };
  } catch {
    localStorage.setItem(MIGRATION_LOCAL_FLAG, "1");
    return;
  }
  const state = snapshot?.state || {};

  try {
    const res = await fetch("/api/migrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topics: state.topics,
        tasks: state.tasks,
        deletedTopicHashes: state.deletedTopicHashes,
        movedTopicHashes: state.movedTopicHashes,
        settings: state.settings
      })
    });
    if (res.ok) {
      const data = (await res.json()) as {
        ok?: boolean;
        skipped?: boolean;
        counts?: Record<string, number | boolean>;
      };
      localStorage.setItem(MIGRATION_LOCAL_FLAG, "1");
      if (data.ok && !data.skipped) {
        const c = data.counts || {};
        const summary = [
          c.topics ? `${c.topics} ideas` : null,
          c.tasks ? `${c.tasks} kanban cards` : null,
          c.competitors ? `${c.competitors} competitors` : null,
          c.settings ? "brand settings" : null
        ]
          .filter(Boolean)
          .join(", ");
        if (summary) {
          toast(`Migrated to shared workspace: ${summary}`, "success");
        }
      }
    }
  } catch (err) {
    console.warn("[migrate] failed:", err);
  }
}
