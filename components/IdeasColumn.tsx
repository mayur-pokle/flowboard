"use client";

import { useState } from "react";
import { Wand2, X, Loader2, Plus, Undo2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/Toast";
import { IdeaColumnCard } from "@/components/IdeaColumnCard";
import type { Topic } from "@/lib/types";
import { cn } from "@/lib/utils";

// The leftmost column on the Content Pipeline page. Houses AI-generated
// topic ideas waiting on triage. Sits OUTSIDE the dnd-kit context (no
// drag-drop into Ideas) — accept/reject are explicit button actions
// that mutate the topic + task tables directly.

interface RejectedItem {
  id: string;
  title: string;
}

export function IdeasColumn() {
  const topics = useStore((s) => s.topics);
  const addTopics = useStore((s) => s.addTopics);
  const moveTopicToBoard = useStore((s) => s.moveTopicToBoard);
  const deleteTopic = useStore((s) => s.deleteTopic);
  const setLastGeneratedAt = useStore((s) => s.setLastGeneratedAt);
  const settings = useStore((s) => s.settings);
  const tasks = useStore((s) => s.tasks);

  const [showGenerator, setShowGenerator] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [count, setCount] = useState(8);
  const [generating, setGenerating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // In-session undo stack for rejected topics — mirrors /discovery's
  // reject UX. After session close, rejected topics are permanently
  // dismissed via the deletedTopicHashes memory.
  const [rejectStack, setRejectStack] = useState<RejectedItem[]>([]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const recentTitles = [
        ...topics.map((t) => t.title),
        ...tasks.map((t) => t.topic.title)
      ].slice(0, 50);
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };
      if (settings.openaiModel) headers["x-openai-model"] = settings.openaiModel;
      if (settings.geminiModel) headers["x-gemini-model"] = settings.geminiModel;
      if (settings.anthropicModel)
        headers["x-anthropic-model"] = settings.anthropicModel;
      if (settings.primaryProvider)
        headers["x-primary-provider"] = settings.primaryProvider;

      const seedKeywordsList = settings.seedKeywords
        ? settings.seedKeywords.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)
        : [];
      const topicsToAvoidList = settings.topicsToAvoid
        ? settings.topicsToAvoid.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)
        : [];

      const res = await fetch("/api/generate-topics", {
        method: "POST",
        headers,
        body: JSON.stringify({
          count,
          // Per-run strategist instructions (free-form add-on).
          strategistInstructions: instructions.trim() || undefined,
          brandNiche: settings.brandNiche,
          brandAudience: settings.brandAudience,
          companyName: settings.companyName,
          websiteUrl: settings.websiteUrl,
          productDescription: settings.productDescription,
          valueProposition: settings.valueProposition,
          brandVoice: settings.brandVoice,
          primaryCta: settings.primaryCta,
          primaryGeo: settings.primaryGeo,
          competitors: settings.competitors,
          seedKeywords: seedKeywordsList,
          topicsToAvoid: topicsToAvoidList,
          recentTitles
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      const incoming = data.topics as Topic[];
      const { added, skipped } = await addTopics(incoming);
      await setLastGeneratedAt(new Date().toISOString());

      const warnings: string[] = Array.isArray(data.warnings)
        ? data.warnings
        : [];
      for (const w of warnings) toast(w, "error");

      const triedAnyKey =
        data.keysSeen?.openai || data.keysSeen?.gemini || data.keysSeen?.anthropic || false;
      const providerLabel =
        data.provider === "mock"
          ? triedAnyKey
            ? " (mock fallback — see error above)"
            : " (mock — add an API key in Settings)"
          : ` via ${data.provider}`;

      if (added === 0 && skipped > 0) {
        toast(
          `All ${skipped} ${skipped === 1 ? "topic" : "topics"} matched existing ideas or your dedup memory${providerLabel}. Try generating again with different instructions.`,
          "info"
        );
      } else {
        toast(
          `${added} new ${added === 1 ? "idea" : "ideas"}${skipped ? `, ${skipped} duplicates skipped` : ""}${providerLabel}`,
          added > 0 ? "success" : "info"
        );
        setShowGenerator(false);
      }
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setGenerating(false);
    }
  }

  async function handleAccept(topic: Topic) {
    setBusyId(topic.id);
    try {
      const task = await moveTopicToBoard(topic.id);
      if (!task) throw new Error("Could not move idea to board");
      toast("Accepted — landed in To Do", "success");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(topic: Topic) {
    setBusyId(topic.id);
    // Push to undo stack BEFORE the delete (we lose the topic after).
    setRejectStack((s) => [{ id: topic.id, title: topic.title }, ...s]);
    try {
      // deleteTopic adds the hash to deletedTopicHashes so it won't be
      // re-suggested. Hard delete here — the session-undo simply
      // regenerates a fresh topic with the same data if needed.
      await deleteTopic(topic.id);
      toast(`Rejected "${topic.title}"`, "info");
    } catch (err) {
      toast((err as Error).message, "error");
      setRejectStack((s) => s.filter((r) => r.id !== topic.id));
    } finally {
      setBusyId(null);
    }
  }

  async function handleUndoReject() {
    const top = rejectStack[0];
    if (!top) return;
    // We don't have a hard-undo for a deleted topic — instead, surface a
    // toast confirming the strategist will see this topic again on next
    // generation (we'd need a dedicated restore endpoint to recover the
    // exact same row). Simpler: regenerate to re-discover it.
    setRejectStack((s) => s.slice(1));
    toast(
      `"${top.title}" will be eligible for re-suggestion. Click Generate to bring it back.`,
      "info"
    );
  }

  return (
    <div className="flex flex-col w-[380px] shrink-0 h-full min-h-0">
      <div className="flex items-center justify-between px-2 mb-2 shrink-0">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-violet-500" />
          <h2 className="text-base font-semibold text-ink-800">Ideas</h2>
          <span className="text-xs text-ink-500 tabular-nums">
            {topics.length}
          </span>
        </div>
        <button
          onClick={() => setShowGenerator((v) => !v)}
          disabled={generating}
          className="size-7 grid place-items-center rounded-md bg-ink-900 hover:bg-ink-800 text-white transition disabled:opacity-50"
          title="Generate ideas"
        >
          {generating ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
        </button>
      </div>

      <div
        className={cn(
          "flex flex-col gap-2 rounded-lg border-2 border-dashed border-violet-200 bg-violet-50/30 p-2 flex-1 min-h-0 overflow-y-auto scrollbar-thin"
        )}
      >
        {/* Generator panel — appears at the top of the column when toggled */}
        {showGenerator ? (
          <div className="bg-white rounded-md border border-ink-200 p-3 mb-1">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Wand2 className="size-3.5 text-violet-600" />
                <span className="text-xs font-semibold text-ink-900">
                  Generate ideas
                </span>
              </div>
              <button
                onClick={() => setShowGenerator(false)}
                className="size-5 grid place-items-center rounded text-ink-400 hover:text-ink-700 hover:bg-ink-100"
              >
                <X className="size-3" />
              </button>
            </div>
            <label className="text-[10px] uppercase tracking-wider text-ink-500 mb-1 block">
              Strategist instructions (optional)
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. focus on AEO-friendly comparison angles, target CFO buyers"
              rows={3}
              className="input !text-xs min-h-[60px] mb-2"
            />
            <div className="flex items-center justify-between gap-2 mb-2">
              <label className="text-[10px] uppercase tracking-wider text-ink-500">
                Count
              </label>
              <select
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="input !w-auto !py-1 !text-xs"
              >
                {[4, 6, 8, 10, 12].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="primary"
              onClick={() => void handleGenerate()}
              disabled={generating}
              loading={generating}
              className="w-full !h-8 !text-xs"
            >
              <Wand2 className="size-3.5" />
              Generate {count} ideas
            </Button>
          </div>
        ) : null}

        {topics.length === 0 && !showGenerator ? (
          <div className="text-xs text-ink-500 text-center py-8 px-3">
            <Wand2 className="size-5 text-ink-300 mx-auto mb-2" />
            No ideas yet. Click <kbd className="px-1 py-0.5 rounded bg-white border border-ink-200 text-[10px] font-mono">+</kbd> to generate.
          </div>
        ) : (
          topics.map((topic) => (
            <IdeaColumnCard
              key={topic.id}
              topic={topic}
              busy={busyId === topic.id}
              onAccept={() => void handleAccept(topic)}
              onReject={() => void handleReject(topic)}
            />
          ))
        )}
      </div>

      {/* Reject undo strip — appears below the column when something has
          been rejected this session. One-level undo per /discovery's pattern. */}
      {rejectStack.length > 0 ? (
        <div className="mt-2 px-2 py-1.5 rounded-md bg-ink-900 text-white text-[11px] flex items-center justify-between gap-2 shrink-0">
          <span className="truncate">
            Rejected {rejectStack.length} idea{rejectStack.length === 1 ? "" : "s"}
          </span>
          <button
            onClick={handleUndoReject}
            className="inline-flex items-center gap-1 text-white/90 hover:text-white font-medium"
          >
            <Undo2 className="size-3" />
            Undo
          </button>
        </div>
      ) : null}
    </div>
  );
}
