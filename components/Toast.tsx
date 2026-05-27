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
      setTimeout(() => {
        setItems((s) => s.filter((x) => x.id !== id));
      }, 3500);
    };
    return () => {
      pushExternal = null;
    };
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80">
      {items.map((t) => (
        <div
          key={t.id}
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
