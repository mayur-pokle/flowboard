"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { CheckCircle2, FileText, Loader2, Tag } from "lucide-react";
import type { Task } from "@/lib/types";
import { PriorityBadge, TypeBadge, Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

export function KanbanCard({
  task,
  onClick,
  isDragOverlay
}: {
  task: Task;
  onClick?: () => void;
  isDragOverlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: task.id, data: { task } });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging && !isDragOverlay ? 0 : 1
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "card p-3 cursor-grab active:cursor-grabbing select-none",
        isDragOverlay && "shadow-cardHover ring-1 ring-brand-300",
        !isDragOverlay && "hover:shadow-cardHover hover:border-ink-300 transition"
      )}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        // Only fire onClick when not dragging (heuristic: no transform)
        if (!transform) onClick?.();
      }}
    >
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <TypeBadge value={task.topic.contentType} />
        <PriorityBadge value={task.topic.priority} />
        <ContentStatusBadge status={task.contentStatus} />
      </div>
      <div className="text-base font-medium text-ink-900 leading-snug mb-2">
        {task.topic.title}
      </div>
      <div className="text-xs text-ink-500 font-mono truncate">
        {task.topic.targetKeyword}
      </div>
      {task.tags.length > 0 && (
        <div className="flex items-center gap-1 mt-2 flex-wrap">
          {task.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="badge bg-ink-100 text-ink-700 ring-1 ring-inset ring-ink-200 text-xs"
            >
              <Tag className="size-3" />
              {tag}
            </span>
          ))}
          {task.tags.length > 3 && (
            <span className="text-xs text-ink-500">
              +{task.tags.length - 3}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function ContentStatusBadge({ status }: { status: Task["contentStatus"] }) {
  if (status === "completed") {
    return (
      <Badge tone="success">
        <CheckCircle2 className="size-3" />
        Content ready
      </Badge>
    );
  }
  if (status === "generating") {
    return (
      <Badge tone="info">
        <Loader2 className="size-3 animate-spin" />
        Generating
      </Badge>
    );
  }
  if (status === "error") {
    return <Badge tone="danger">Generation failed</Badge>;
  }
  return (
    <Badge tone="neutral">
      <FileText className="size-3" />
      No content
    </Badge>
  );
}
