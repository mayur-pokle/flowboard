"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Toast = {
  id: string;
  message: string;
  tone: "success" | "error" | "info";
};

let pushExternal: ((t: Omit<Toast, "id">) => void) | null = null;

export function toast(message: string, tone: Toast["tone"] = "info") {
  pushExternal?.({ message, tone });
}

export function ToastHost() {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    pushExternal = (t) => {
      const id = Math.random().toString(36).slice(2);
      setItems((s) => [...s, { ...t, id }]);
      // Errors linger longer than success/info — users need time to
      // read what went wrong. Success/info toasts still clear at 3.5s.
      const dwell = t.tone === "error" ? 7000 : 3500;
      setTimeout(() => {
        setItems((s) => s.filter((x) => x.id !== id));
      }, dwell);
    };
    return () => {
      pushExternal = null;
    };
  }, []);

  return (
    // aria-live=polite lets screen readers announce toast content
    // without interrupting current speech. Errors use assertive on the
    // per-toast wrapper below so they cut through.
    <div
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80"
      aria-live="polite"
      aria-atomic="false"
      role="status"
    >
      {items.map((t) => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : "status"}
          aria-live={t.tone === "error" ? "assertive" : "polite"}
          className={cn(
            "flex items-start gap-2 rounded-lg border bg-white px-3 py-3 shadow-cardHover text-base",
            t.tone === "success" && "border-emerald-200",
            t.tone === "error" && "border-rose-200",
            t.tone === "info" && "border-ink-200"
          )}
        >
          {t.tone === "success" && (
            <CheckCircle2 className="size-4 text-emerald-600 mt-1" />
          )}
          {t.tone === "error" && (
            <AlertCircle className="size-4 text-rose-600 mt-1" />
          )}
          {t.tone === "info" && (
            <Info className="size-4 text-brand-600 mt-1" />
          )}
          <div className="flex-1 text-ink-800">{t.message}</div>
          <button
            onClick={() =>
              setItems((s) => s.filter((x) => x.id !== t.id))
            }
            className="text-ink-400 hover:text-ink-700"
            aria-label="Dismiss"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
