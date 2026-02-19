import { Check, ChevronRight, FileText } from "lucide-react";
import { useState } from "react";

import { ProgressRing } from "./ProgressRing";
import { cn } from "@/lib/utils";
import { getProgressTextColor, getCompletedCardStyle } from "@/utils/roadmapColors";

import type { RoadmapMilestoneProgress } from "@/types";

interface MilestoneNodeProps {
  milestone: RoadmapMilestoneProgress;
  position: "top" | "bottom";
  isCurrent?: boolean;
  onClick?: () => void;
}

export function MilestoneNode({
  milestone,
  position,
  isCurrent = false,
  onClick,
}: MilestoneNodeProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const statusColors = {
    locked: "text-muted-foreground",
    active: "text-primary",
    completed: getProgressTextColor(milestone.progress),
  };

  const statusIcons = {
    locked: null,
    active: <ChevronRight className="h-3 w-3" />,
    completed: <Check className="h-3 w-3" />,
  };

  const progressPercent = Math.round(milestone.progress * 100);

  return (
    <div
      className={cn(
        "relative flex flex-col items-start gap-2",
        position === "top" ? "items-start" : "items-start"
      )}
    >
      {/* Milestone Card */}
      <button
        type="button"
        onClick={() => {
          setIsExpanded(!isExpanded);
          onClick?.();
        }}
        className={cn(
          "group relative flex items-center gap-3 rounded-lg border p-3 transition-all",
          "hover:shadow-md",
          milestone.status === "locked" && "border-muted-foreground/20 bg-muted/50",
          milestone.status === "active" && "border-primary/30 bg-primary/5 shadow-sm",
          milestone.status === "completed" && getCompletedCardStyle(milestone.progress),
          isCurrent && "ring-2 ring-primary ring-offset-2"
        )}
      >
        {/* Progress Ring */}
        <div className="relative shrink-0">
          <ProgressRing
            progress={milestone.progress}
            size={40}
            strokeWidth={3}
            className={cn(
              milestone.status === "locked" && "opacity-50",
              milestone.status === "completed" && getProgressTextColor(milestone.progress)
            )}
          >
            <span
              className={cn(
                "text-xs font-semibold",
                statusColors[milestone.status as keyof typeof statusColors]
              )}
            >
              {progressPercent}%
            </span>
          </ProgressRing>
          {isCurrent && (
            <div className="absolute -right-1 -top-1 h-3 w-3 animate-pulse rounded-full bg-primary" />
          )}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <h4
              className={cn(
                "truncate text-sm font-semibold",
                statusColors[milestone.status as keyof typeof statusColors]
              )}
            >
              {milestone.title}
            </h4>
            {statusIcons[milestone.status as keyof typeof statusIcons]}
          </div>
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            {milestone.description}
          </p>
        </div>

        {/* Document Count */}
        {milestone.document_count > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <FileText className="h-3 w-3" />
            <span>{milestone.document_count}</span>
          </div>
        )}
      </button>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="ml-12 rounded-lg border border-border bg-muted/30 p-3">
          <div className="space-y-2">
            {/* Topics */}
            {milestone.covered_topics.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">已覆盖知识点</p>
                <div className="flex flex-wrap gap-1">
                  {milestone.covered_topics.map((topic) => (
                    <span
                      key={topic}
                      className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            {milestone.status !== "completed" && milestone.status !== "locked" && (
              <button
                type="button"
                className="w-full rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                🚀 开始学习本阶段
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
