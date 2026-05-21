import { cn } from "@/lib/utils";
import type { ContentType, Priority } from "@/lib/types";

const priorityStyles: Record<Priority, string> = {
  Low: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
  Medium: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200",
  High: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200"
};

const typeStyles: Record<ContentType, string> = {
  Calculator: "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200",
  Template: "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200",
  Guide: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200",
  Whitepaper: "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200",
  Checklist: "bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-200",
  Framework: "bg-fuchsia-50 text-fuchsia-700 ring-1 ring-inset ring-fuchsia-200"
};

export function PriorityBadge({ value }: { value: Priority }) {
  return <span className={cn("badge", priorityStyles[value])}>{value}</span>;
}

export function TypeBadge({ value }: { value: ContentType }) {
  return <span className={cn("badge", typeStyles[value])}>{value}</span>;
}

export function Badge({
  children,
  tone = "neutral",
  className
}: {
  children: React.ReactNode;
  tone?: "neutral" | "info" | "success" | "warn" | "danger";
  className?: string;
}) {
  const styles: Record<string, string> = {
    neutral: "bg-ink-100 text-ink-700 ring-1 ring-inset ring-ink-200",
    info: "bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200",
    success: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
    warn: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200",
    danger: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200"
  };
  return <span className={cn("badge", styles[tone], className)}>{children}</span>;
}
