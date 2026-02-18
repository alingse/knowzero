import { Check, ChevronRight, Lock, Target } from "lucide-react";

import { cn } from "@/lib/utils";

import type { RoadmapProgress } from "@/types";

interface FishboneTimelineProps {
  progress: RoadmapProgress;
  currentMilestoneId?: number;
  onMilestoneClick?: (milestoneId: number) => void;
  className?: string;
}

export function FishboneTimeline({
  progress,
  currentMilestoneId,
  onMilestoneClick,
  className,
}: FishboneTimelineProps) {
  const completedCount = progress.milestones.filter((m) => m.status === "completed").length;

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">{progress.goal}</h3>
        </div>
        <div className="text-sm text-muted-foreground">
          {completedCount} / {progress.milestones.length} 完成
        </div>
      </div>

      {/* Timeline */}
      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="flex flex-col gap-0">
          {progress.milestones.map((milestone, index) => {
            const isLast = index === progress.milestones.length - 1;
            const isCurrent = milestone.id === currentMilestoneId;
            const progressPercent = Math.round(milestone.progress * 100);

            return (
              <div key={milestone.id} className="flex gap-3">
                {/* Left: timeline track */}
                <div className="flex flex-col items-center">
                  {/* Node */}
                  <div
                    className={cn(
                      "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                      milestone.status === "locked" &&
                        "border-muted-foreground/30 bg-muted text-muted-foreground",
                      milestone.status === "active" &&
                        "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/30",
                      milestone.status === "completed" &&
                        "border-green-500 bg-green-500 text-white"
                    )}
                  >
                    {milestone.status === "completed" ? (
                      <Check className="h-4 w-4" />
                    ) : milestone.status === "locked" ? (
                      <Lock className="h-3.5 w-3.5" />
                    ) : (
                      <span className="text-xs font-bold">{index + 1}</span>
                    )}
                    {isCurrent && (
                      <div className="absolute -inset-1 animate-ping rounded-full border-2 border-primary opacity-30" />
                    )}
                  </div>
                  {/* Connector line */}
                  {!isLast && (
                    <div className="relative h-full w-0.5 min-h-[16px]">
                      <div className="absolute inset-0 bg-border" />
                      {milestone.status !== "locked" && (
                        <div className="absolute inset-0 bg-primary" />
                      )}
                    </div>
                  )}
                </div>

                {/* Right: milestone card */}
                <button
                  type="button"
                  onClick={() => onMilestoneClick?.(milestone.id)}
                  className={cn(
                    "mb-3 flex flex-1 items-center gap-3 rounded-lg border p-3 text-left transition-all",
                    "hover:shadow-sm",
                    milestone.status === "locked" &&
                      "border-muted-foreground/15 bg-muted/40 opacity-60",
                    milestone.status === "active" &&
                      "border-primary/30 bg-primary/5",
                    milestone.status === "completed" &&
                      "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20",
                    isCurrent && "ring-2 ring-primary ring-offset-1"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4
                        className={cn(
                          "truncate text-sm font-semibold",
                          milestone.status === "locked" && "text-muted-foreground",
                          milestone.status === "active" && "text-primary",
                          milestone.status === "completed" && "text-green-600 dark:text-green-400"
                        )}
                      >
                        {milestone.title}
                      </h4>
                      {milestone.status === "active" && (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-primary" />
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                      {milestone.description}
                    </p>
                  </div>
                  {/* Progress badge */}
                  <div
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                      milestone.status === "locked" &&
                        "bg-muted text-muted-foreground",
                      milestone.status === "active" &&
                        "bg-primary/10 text-primary",
                      milestone.status === "completed" &&
                        "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    )}
                  >
                    {progressPercent}%
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-full bg-green-500" />
          <span>已完成</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-full bg-primary shadow shadow-primary/50" />
          <span>进行中</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-full border border-muted-foreground/30 bg-muted" />
          <span>未解锁</span>
        </div>
      </div>
    </div>
  );
}
