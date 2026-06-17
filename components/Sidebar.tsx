"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  Wand2,
  KanbanSquare,
  Settings,
  LogOut,
  Telescope
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore, useHasHydrated } from "@/lib/store";

const items = [
  { href: "/ideas", label: "AI Resources", icon: Wand2 },
  { href: "/discovery", label: "AI Discovery", icon: Telescope },
  { href: "/board", label: "Kanban", icon: KanbanSquare },
  { href: "/settings/api", label: "Settings", icon: Settings }
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

      <nav className="px-2 py-3 flex-1 overflow-y-auto scrollbar-thin">
        {items.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/" && pathname?.startsWith(item.href));
          const Icon = item.icon;
          const badge =
            hydrated && item.href === "/ideas"
              ? topicCount
              : hydrated && item.href === "/board"
              ? taskCount
              : null;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-base transition",
                active
                  ? "bg-brand-50 text-brand-700"
                  : "text-ink-700 hover:bg-ink-100"
              )}
            >
              <Icon className="size-4" />
              <span className="flex-1">{item.label}</span>
              {badge !== null && badge > 0 ? (
                <span className="text-xs tabular-nums bg-ink-100 text-ink-700 rounded-full px-2 py-1">
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
                {taskCount} on board · {topicCount} ideas
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
