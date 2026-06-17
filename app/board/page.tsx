"use client";

import { useEffect } from "react";
import { useStore, useHasHydrated } from "@/lib/store";
import { KanbanBoard } from "@/components/KanbanBoard";
import { CardDetailPanel } from "@/components/CardDetailPanel";
import type { Task } from "@/lib/types";

export default function BoardPage() {
  const hydrated = useHasHydrated();
  const tasks = useStore((s) => s.tasks);
  const topics = useStore((s) => s.topics);
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
    return <Header title="Content Pipeline" subtitle="Loading…" />;
  }

  const ideaCount = topics.length;
  const taskCount = tasks.length;
  const subtitle =
    ideaCount + taskCount === 0
      ? "Generate ideas to populate the pipeline"
      : `${ideaCount} idea${ideaCount === 1 ? "" : "s"} · ${taskCount} card${taskCount === 1 ? "" : "s"} on the board`;

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col">
      <Header title="Content Pipeline" subtitle={subtitle} />

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0">
          {/* The Ideas column is always rendered as part of the kanban — no
              separate empty state. Even with zero tasks, the strategist sees
              the Ideas column with a Generate CTA. */}
          <KanbanBoard onCardClick={handleCardClick} />
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
  subtitle
}: {
  title: string;
  subtitle?: string;
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
    </div>
  );
}
