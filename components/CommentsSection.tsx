"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Send,
  Pencil,
  Trash2,
  X,
  Check,
  MessageSquare
} from "lucide-react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/Toast";
import type { TaskComment } from "@/lib/types";

interface Props {
  taskId: string;
}

// IMPORTANT: a stable empty-array reference. Returning `[]` directly from a
// Zustand selector creates a new ref on every render, which Zustand sees as
// "state changed" and schedules another render → React error #185 infinite
// loop. Always fall back to this same reference.
const EMPTY_COMMENTS: TaskComment[] = [];

export function CommentsSection({ taskId }: Props) {
  const { data: session } = useSession();
  const currentEmail = session?.user?.email || "";

  const comments = useStore(
    (s) => s.commentsByTaskId[taskId] ?? EMPTY_COMMENTS
  );
  const loadComments = useStore((s) => s.loadTaskComments);
  const addComment = useStore((s) => s.addTaskComment);

  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    loadComments(taskId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  async function handlePost() {
    const text = draft.trim();
    if (!text) return;
    setPosting(true);
    try {
      await addComment(taskId, text);
      setDraft("");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="space-y-3">
      {comments.length === 0 ? (
        <div className="text-xs text-ink-500 italic py-2">
          No remarks yet. Be the first to leave a note for the team.
        </div>
      ) : (
        <ul className="space-y-2.5">
          {comments.map((c) => (
            <CommentRow
              key={c.id}
              comment={c}
              currentEmail={currentEmail}
              taskId={taskId}
            />
          ))}
        </ul>
      )}

      {/* Add new */}
      <div className="rounded-md border border-ink-200 bg-ink-50/40 p-2">
        <textarea
          className="input min-h-[60px] text-sm bg-white"
          placeholder="Leave a remark for the team…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handlePost();
            }
          }}
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px] text-ink-500">
            Cmd / Ctrl + Enter to post
          </span>
          <Button
            variant="primary"
            onClick={handlePost}
            loading={posting}
            disabled={!draft.trim()}
            className="!py-1.5"
          >
            <Send className="size-3.5" />
            Post comment
          </Button>
        </div>
      </div>
    </div>
  );
}

function CommentRow({
  comment,
  currentEmail,
  taskId
}: {
  comment: TaskComment;
  currentEmail: string;
  taskId: string;
}) {
  const updateComment = useStore((s) => s.updateTaskComment);
  const deleteComment = useStore((s) => s.deleteTaskComment);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [saving, setSaving] = useState(false);

  const isAuthor = currentEmail && currentEmail === comment.authorEmail;
  const edited =
    comment.updatedAt &&
    comment.createdAt &&
    new Date(comment.updatedAt).getTime() -
      new Date(comment.createdAt).getTime() >
      2000; // > 2s gap

  async function handleSave() {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      await updateComment(taskId, comment.id, draft);
      setEditing(false);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this comment?")) return;
    try {
      await deleteComment(taskId, comment.id);
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  return (
    <li className="flex gap-2.5">
      <Avatar email={comment.authorEmail} name={comment.authorName} />
      <div className="flex-1 min-w-0 rounded-md bg-white border border-ink-200 p-2.5">
        <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs font-medium text-ink-800 truncate">
              {comment.authorName || comment.authorEmail || "User"}
            </span>
            <span className="text-[11px] text-ink-400">·</span>
            <span
              className="text-[11px] text-ink-500"
              title={new Date(comment.createdAt).toLocaleString()}
            >
              {timeAgo(comment.createdAt)}
              {edited ? " · edited" : ""}
            </span>
          </div>
          {isAuthor ? (
            <div className="flex items-center gap-0.5">
              {editing ? null : (
                <>
                  <button
                    onClick={() => setEditing(true)}
                    className="p-1 text-ink-400 hover:text-ink-800 rounded"
                    aria-label="Edit"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    onClick={handleDelete}
                    className="p-1 text-ink-400 hover:text-rose-600 rounded"
                    aria-label="Delete"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </>
              )}
            </div>
          ) : null}
        </div>

        {editing ? (
          <div>
            <textarea
              className="input text-sm min-h-[60px]"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
            />
            <div className="flex justify-end gap-1 mt-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setDraft(comment.body);
                  setEditing(false);
                }}
                className="!py-1 !px-2 text-xs"
              >
                <X className="size-3.5" />
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSave}
                loading={saving}
                className="!py-1 !px-2 text-xs"
              >
                <Check className="size-3.5" />
                Save
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-sm text-ink-800 whitespace-pre-wrap break-words">
            {comment.body}
          </div>
        )}
      </div>
    </li>
  );
}

function Avatar({ email, name }: { email: string; name: string }) {
  const init = initials(name || email);
  return (
    <div className="size-7 rounded-full bg-brand-600 text-white grid place-items-center text-[10px] font-semibold shrink-0">
      {init || <MessageSquare className="size-3.5" />}
    </div>
  );
}

function initials(s: string) {
  if (!s) return "";
  const local = s.includes("@") ? s.split("@")[0] : s;
  const parts = local.split(/[.\-_\s]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (local[0] || "?").toUpperCase();
}

// Tiny humanizer; we don't want a dayjs dep just for this.
function timeAgo(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const diff = Math.max(0, now - then) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
    // Older: show actual date.
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  } catch {
    return "";
  }
}
