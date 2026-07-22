"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  Layers,
  Settings,
  LogOut,
  Telescope,
  Microscope
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore, useHasHydrated } from "@/lib/store";

// Sidebar labels use plain English — no jargon, no acronyms. The
// three primary surfaces map to the strategist's mental workflow:
//   Opportunities = where new ideas come from (GSC + AI crawl)
//   Analyzer      = triage / topic quality check on individual candidates
//   Content       = production pipeline where drafts are written + shipped
// Route paths are preserved so external Slack digest links + bookmarks
// don't break.
const items = [
  {
    href: "/discovery",
    label: "Opportunities",
    icon: Telescope,
    hint: "Find new content gaps"
  },
  {
    href: "/analyzer",
    label: "Analyzer",
    icon: Microscope,
    hint: "Triage individual topics"
  },
  {
    href: "/board",
    label: "Content",
    icon: Layers,
    hint: "Draft, review, ship"
  },
  {
    href: "/settings/api",
    label: "Settings",
    icon: Settings,
    hint: "Workspace configuration"
  }
];

export function Sidebar() {
  const pathname = usePathname();
  const hydrated = useHasHydrated();
  const { data: session } = useSession();
  const topicCount = useStore((s) => s.topics.length);
  const taskCount = useStore((s) => s.tasks.length);

  const email = session?.user?.email || "";

  return (
    // h-full so the sidebar fills the parent (AuthShell h-screen). Logo
    // header and footer stay pinned; nav scrolls internally if it ever
    // grows beyond the available height.
    <aside className="w-60 shrink-0 border-r border-ink-200 bg-white flex flex-col h-full">
      <div className="px-4 h-16 flex items-center border-b border-ink-200 shrink-0">
        <Link
          href="/board"
          aria-label="Flowboard"
          className="block w-full focus-ring rounded"
        >
          <img
            src="/flowboard-logo.svg"
            alt="Flowboard"
            className="h-7 w-auto"
          />
        </Link>
      </div>

      <nav
        className="px-2 py-3 flex-1 overflow-y-auto scrollbar-thin"
        aria-label="Primary navigation"
      >
        {items.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/" && pathname?.startsWith(item.href));
          const Icon = item.icon;
          // Content badge counts BOTH unreviewed ideas and tasks on
          // the board — that's the funnel size at a glance.
          const badge =
            hydrated && item.href === "/board"
              ? topicCount + taskCount
              : null;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              title={item.hint}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-base transition focus-ring",
                active
                  ? "bg-brand-50 text-brand-700"
                  : "text-ink-700 hover:bg-ink-100"
              )}
            >
              <Icon className="size-4" aria-hidden />
              <span className="flex-1">{item.label}</span>
              {badge !== null && badge > 0 ? (
                <span
                  className="text-xs tabular-nums bg-ink-100 text-ink-700 rounded-full px-2 py-1"
                  aria-label={`${badge} items`}
                >
                  {badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-ink-200 p-3 shrink-0">
        {email ? (
          <div className="flex items-center gap-2">
            <div className="size-7 rounded-full bg-brand-600 text-white grid place-items-center text-xs font-semibold shrink-0">
              {initials(email)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] text-ink-800 truncate">{email}</div>
              <div className="text-xs text-ink-500">
                {taskCount} in pipeline · {topicCount} opportunities
              </div>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/sign-in" })}
              className="p-2 rounded text-ink-400 hover:text-ink-800 hover:bg-ink-100"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        ) : (
          <div className="text-xs text-ink-500">Loading…</div>
        )}
      </div>
    </aside>
  );
}

function initials(email: string) {
  const local = email.split("@")[0] || email;
  const parts = local.split(/[.\-_]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (local[0] || "?").toUpperCase();
}
