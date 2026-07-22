"use client";

import { useEffect, useRef } from "react";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  Loader2,
  X
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

// ── Shared Confirm Modal ─────────────────────────────────────────────
//
// Replaces window.confirm() everywhere. Provides:
//   - Danger / warning / info variants (icon + accent color)
//   - Optional detail body (paragraph or itemized list of what's about
//     to happen — "you'll lose the brief, 12 comments, and the draft")
//   - Loading state on the confirm button so async work is visible
//   - Escape + backdrop-click cancel
//   - Focus trap: focus lands on the Cancel button by default (safest)
//   - Restores focus to the element that opened the modal on close
//   - Blocks page scroll while open
//
// Compared to window.confirm, this handles async work: the caller can
// pass a Promise-returning onConfirm and the modal stays open with a
// spinner until it resolves.

export type ConfirmModalTone = "danger" | "warning" | "info";

export interface ConfirmModalProps {
  open: boolean;
  title: string;
  message?: React.ReactNode;
  /** Optional list of items rendered as bullets below the message. */
  details?: string[];
  /** Optional inline callout preview (e.g. a URL, filename). */
  preview?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmModalTone;
  /** When set, disables both buttons and shows a spinner on Confirm. */
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  message,
  details,
  preview,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  loading = false,
  onConfirm,
  onCancel
}: ConfirmModalProps) {
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Focus mgmt: capture the element that had focus when the modal
  // opened, then restore it on close. This keeps keyboard users where
  // they were, not dumped back to <body>.
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    // Focus the cancel button by default — the safer choice for
    // destructive dialogs.
    cancelBtnRef.current?.focus();
    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  // Escape cancels. Guard on `loading` — user may be mid-async and
  // hitting Escape shouldn't fire a second cancel path.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !loading) {
        e.stopPropagation();
        onCancel();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, loading, onCancel]);

  // Focus trap: while modal is open, Tab / Shift+Tab cycles between
  // Cancel and Confirm. Prevents keyboard escape into the background.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const focusables = [cancelBtnRef.current, confirmBtnRef.current].filter(
        Boolean
      ) as HTMLElement[];
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Lock page scroll while the modal is open. Restored on unmount /
  // close via the cleanup.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const toneStyle =
    tone === "danger"
      ? {
          iconWrap: "bg-rose-50 text-rose-700",
          Icon: AlertCircle,
          confirmVariant: "danger" as const
        }
      : tone === "warning"
      ? {
          iconWrap: "bg-amber-50 text-amber-700",
          Icon: AlertTriangle,
          confirmVariant: "primary" as const
        }
      : {
          iconWrap: "bg-brand-50 text-brand-700",
          Icon: Info,
          confirmVariant: "primary" as const
        };
  const Icon = toneStyle.Icon;

  return (
    <div
      className="fixed inset-0 z-[200] bg-ink-900/40 backdrop-blur-sm grid place-items-center p-6"
      onClick={loading ? undefined : onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div
        className="bg-white rounded-xl shadow-cardHover w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-3">
          <div
            className={cn(
              "size-9 rounded-md grid place-items-center shrink-0",
              toneStyle.iconWrap
            )}
            aria-hidden
          >
            <Icon className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2
              id="confirm-modal-title"
              className="text-base font-semibold text-ink-900 leading-snug"
            >
              {title}
            </h2>
            {message ? (
              <div className="text-xs text-ink-600 mt-1.5 leading-relaxed">
                {message}
              </div>
            ) : null}
            {preview ? (
              <div className="mt-2 rounded-md bg-ink-50 border border-ink-200 px-2 py-1.5 text-[11px] text-ink-700 font-mono truncate">
                {preview}
              </div>
            ) : null}
            {details && details.length > 0 ? (
              <ul className="mt-2.5 space-y-1 text-xs text-ink-700 list-disc pl-4">
                {details.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <button
            onClick={onCancel}
            disabled={loading}
            className="p-1 text-ink-400 hover:text-ink-700 rounded disabled:opacity-40"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button
            ref={cancelBtnRef}
            variant="secondary"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            ref={confirmBtnRef}
            variant={toneStyle.confirmVariant}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
