"use client";

import { useDroppable } from "@dnd-kit/core";
import type { Status, Task } from "@/lib/types";
import { KanbanCard } from "@/components/KanbanCard";
import { cn } from "@/lib/utils";

const COLUMN_COLORS: Record<Status, string> = {
  todo: "border-ink-200 bg-ink-100/40",
  in_progress: "border-brand-200 bg-brand-50/60",
  done: "border-emerald-200 bg-emerald-50/40"
};

const COLUMN_DOT: Record<Status, string> = {
  todo: "bg-ink-400",
  in_progress: "bg-brand-500",
  done: "bg-emerald-500"
};

export function KanbanColumn({
  status,
  title,
  tasks,
  onCardClick
}: {
  status: Status;
  title: string;
  tasks: Task[];
  onCardClick: (task: Task) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: status });

  return (
    <div className="flex flex-col w-[380px] shrink-0">
      <div className="flex items-center gap-2 px-2 mb-2">
        <span className={cn("size-2 rounded-full", COLUMN_DOT[status])} />
        <h2 className="text-base font-semibold text-ink-800">{title}</h2>
        <span className="text-xs text-ink-500 tabular-nums">
          {tasks.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex flex-col gap-2 rounded-lg border-2 border-dashed p-2 min-h-[180px] flex-1 transition",
          COLUMN_COLORS[status],
          isOver && "border-brand-400 bg-brand-50"
        )}
      >
        {tasks.length === 0 ? (
          <div className="text-xs text-ink-400 text-center py-8 px-3">
            {status === "todo"
              ? "Move ideas from the Ideas page to start."
              : "Drop cards here"}
          </div>
        ) : (
          tasks.map((task) => (
            <KanbanCard
              key={task.id}
              task={task}
              onClick={() => onCardClick(task)}
            />
          ))
        )}
      </div>
    </div>
  );
}
