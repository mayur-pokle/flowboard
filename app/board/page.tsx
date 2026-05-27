"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Lightbulb, Sparkles } from "lucide-react";
import { useStore, useHasHydrated } from "@/lib/store";
import { KanbanBoard } from "@/components/KanbanBoard";
import { CardDetailPanel } from "@/components/CardDetailPanel";
import { Button } from "@/components/ui/Button";
import type { Task } from "@/lib/types";

export default function BoardPage() {
  const hydrated = useHasHydrated();
  const tasks = useStore((s) => s.tasks);
  const selectedTaskId = useStore((s) => s.selectedTaskId);
  const selectTask = useStore((s) => s.selectTask);

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) || null;

  // Close panel on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && selectedTaskId) selectTask(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedTaskId, selectTask]);

  function handleCardClick(task: Task) {
    selectTask(task.id);
  }

  if (!hydrated) {
    return <Header title="Kanban" subtitle="Loading…" />;
  }

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col">
      <Header
        title="Execution Board"
        subtitle={
          tasks.length === 0
            ? "Move ideas from the Ideas page to start tracking work"
            : `${tasks.length} card${tasks.length === 1 ? "" : "s"} on the board`
        }
        right={
          <Link href="/ideas">
            <Button variant="primary">
              <Lightbulb className="size-4" />
              Get more ideas
            </Button>
          </Link>
        }
      />

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0">
          {tasks.length === 0 ? <EmptyBoard /> : <KanbanBoard onCardClick={handleCardClick} />}
        </div>
      </div>

      {selectedTask ? <CardDetailPanel key={selectedTask.id} task={selectedTask} /> : null}
      {selectedTask ? (
        <button
          aria-label="Close panel"
          className="fixed inset-0 z-30 bg-ink-900/20 backdrop-blur-[1px]"
          onClick={() => selectTask(null)}
        />
      ) : null}
    </div>
  );
}

function Header({
  title,
  subtitle,
  right
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="px-8 h-16 flex items-center justify-between border-b border-ink-200 bg-white shrink-0">
      <div>
        <h1 className="text-base font-semibold text-ink-900 leading-tight">
          {title}
        </h1>
        {subtitle ? (
          <p className="text-xs text-ink-500 leading-tight">{subtitle}</p>
        ) : null}
      </div>
      {right}
    </div>
  );
}

function EmptyBoard() {
  return (
    <div className="grid place-items-center h-full">
      <div className="max-w-md text-center py-16 px-6">
        <div className="size-12 rounded-xl bg-brand-50 text-brand-600 grid place-items-center mx-auto mb-4">
          <Sparkles className="size-6" />
        </div>
        <h2 className="text-xl font-semibold text-ink-900 mb-1">
          Your board is empty
        </h2>
        <p className="text-base text-ink-600 mb-6">
          Generate AI ideas, pick the ones you like, and they'll show up here as Kanban cards.
        </p>
        <Link href="/ideas">
          <Button variant="primary">
            <Lightbulb className="size-4" />
            Generate content ideas
          </Button>
        </Link>
      </div>
    </div>
  );
}
