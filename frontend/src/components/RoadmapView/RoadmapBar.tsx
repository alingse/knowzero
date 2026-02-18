import { ChevronDown, ChevronRight, Map, Target } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

import type { RoadmapProgress } from "@/types";

interface RoadmapBarProps {
  progress: RoadmapProgress;
  isExpanded?: boolean;
  onToggle?: (expanded: boolean) => void;
  className?: string;
}

export function RoadmapBar({ progress, isExpanded: controlledExpanded, onToggle, className }: RoadmapBarProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = controlledExpanded ?? internalExpanded;

  const completedCount = progress.milestones.filter((m) => m.status === "completed").length;
  const progressPercent = Math.round(progress.overall_progress * 100);

  const activeIndex = progress.milestones.findIndex((m) => m.status === "active");

  return (
    <div className={cn("border-b bg-background", className)}>
      {/* Compact Mode */}
      <div
        className={cn(
          "flex cursor-pointer items-center gap-3 px-4 py-2 transition-colors hover:bg-muted/50",
          !isExpanded && "h-12"
        )}
        onClick={() => {
          const next = !isExpanded;
          setInternalExpanded(next);
          onToggle?.(next);
        }}
      >
        <Map className="h-4 w-4 shrink-0 text-primary" />
        <Target className="h-4 w-4 shrink-0 text-muted-foreground" />

        {/* Progress nodes */}
        <div className="flex min-w-0 flex-1 items-center gap-1">
          {progress.milestones.map((milestone, index) => {
            const isCompleted = milestone.status === "completed";
            const isActive = milestone.status === "active";
            const isBeforeActive = index < activeIndex;

            return (
              <div key={milestone.id} className="flex items-center">
                {/* Node */}
                <div
                  className={cn(
                    "h-2.5 w-2.5 shrink-0 rounded-full transition-colors",
                    isCompleted && "bg-green-500",
                    isActive && "bg-primary shadow shadow-primary/50",
                    !isCompleted && !isActive && "border border-muted-foreground/30 bg-muted"
                  )}
                />
                {/* Connector */}
                {index < progress.milestones.length - 1 && (
                  <div
                    className={cn(
                      "h-0.5 w-6 shrink-0",
                      isBeforeActive && "bg-primary",
                      !(isBeforeActive || isActive) && "bg-muted"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Goal and progress */}
        <div className="flex shrink-0 items-center gap-3">
          <span className="max-w-[200px] truncate text-sm font-medium">{progress.goal}</span>
          <div className="whitespace-nowrap text-xs text-muted-foreground">
            {completedCount}/{progress.milestones.length}
          </div>
          <div className="whitespace-nowrap text-xs font-medium text-primary">
            {progressPercent}%
          </div>
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Expanded Mode - Simple Progress Bar */}
      {isExpanded && (
        <div className="px-4 pb-3">
          <div className="relative h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="absolute left-0 top-0 h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-xs text-muted-foreground">
            <span>{progress.milestones[0]?.title}</span>
            <span>{progress.milestones[progress.milestones.length - 1]?.title}</span>
          </div>
        </div>
      )}
    </div>
  );
}
