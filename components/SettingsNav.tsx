"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KeyRound, ListChecks, Library, Plug } from "lucide-react";
import { cn } from "@/lib/utils";

// Sub-navigation rendered at the top of every /settings/* page so users can
// jump between brand profile / API providers, keyword bank, content
// library, and data source connectors.
const tabs = [
  {
    href: "/settings/api",
    label: "Brand & APIs",
    icon: KeyRound,
    description: "Brand profile, competitors, AI keys, Slack"
  },
  {
    href: "/settings/keywords",
    label: "Keywords",
    icon: ListChecks,
    description: "Priority keyword bank (P0/P1/P2)"
  },
  {
    href: "/settings/content-library",
    label: "Content library",
    icon: Library,
    description: "Existing published content for cannibalization checks"
  },
  {
    href: "/settings/sources",
    label: "Data sources",
    icon: Plug,
    description: "Connect GSC, SEMrush, Ahrefs"
  }
];

export function SettingsNav() {
  const pathname = usePathname() || "";
  return (
    <div className="border-b border-ink-200 bg-white">
      <div className="px-8 pt-3 flex items-end gap-1">
        {tabs.map((t) => {
          const active = pathname === t.href;
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "px-3 py-2 -mb-px border-b-2 text-base flex items-center gap-2 transition",
                active
                  ? "border-brand-600 text-brand-700 font-medium"
                  : "border-transparent text-ink-500 hover:text-ink-800"
              )}
            >
              <Icon className="size-4" />
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
