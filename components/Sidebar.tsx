"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Lightbulb, KanbanSquare, Settings, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore, useHasHydrated } from "@/lib/store";

const items = [
  { href: "/ideas", label: "Ideas", icon: Lightbulb },
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
    <aside className="w-60 shrink-0 border-r border-ink-200 bg-white flex flex-col">
      <div className="px-4 h-16 flex items-center border-b border-ink-200">
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

      <nav className="px-2 py-3 flex-1">
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
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition",
                active
                  ? "bg-brand-50 text-brand-700"
                  : "text-ink-700 hover:bg-ink-100"
              )}
            >
              <Icon className="size-4" />
              <span className="flex-1">{item.label}</span>
              {badge !== null && badge > 0 ? (
                <span className="text-[11px] tabular-nums bg-ink-100 text-ink-700 rounded-full px-1.5 py-0.5">
                  {badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-ink-200 p-3">
        {email ? (
          <div className="flex items-center gap-2">
            <div className="size-7 rounded-full bg-brand-600 text-white grid place-items-center text-[11px] font-semibold shrink-0">
              {initials(email)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] text-ink-800 truncate">{email}</div>
              <div className="text-[10px] text-ink-500">
                {taskCount} on board · {topicCount} ideas
              </div>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/sign-in" })}
              className="p-1.5 rounded text-ink-400 hover:text-ink-800 hover:bg-ink-100"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        ) : (
          <div className="text-[11px] text-ink-500">Loading…</div>
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
