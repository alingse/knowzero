import { ChevronRight, Target } from "lucide-react";

import { MilestoneNode } from "./MilestoneNode";
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

      {/* Fishbone Diagram */}
      <div className="relative overflow-x-auto pb-4">
        <div className="min-w-max px-4">
          {/* SVG Connections */}
          <svg
            className="pointer-events-none absolute left-0 top-0 h-full w-full"
            style={{ zIndex: 0 }}
          >
            {/* Main spine */}
            <line x1="0" y1="50%" x2="100%" y2="50%" className="stroke-border stroke-2" />
            {/* Progress spine */}
            <line
              x1="0"
              y1="50%"
              x2={`${progress.overall_progress * 100}%`}
              y2="50%"
              className="stroke-primary stroke-2 transition-all duration-500"
            />
          </svg>

          {/* Milestones */}
          <div className="relative flex items-start justify-between gap-8 py-8">
            {progress.milestones.map((milestone, index) => (
              <div
                key={milestone.id}
                className="relative flex flex-col items-center"
                style={{
                  // Alternate top/bottom positioning
                  marginTop: index % 2 === 0 ? "0" : "80px",
                  marginBottom: index % 2 === 0 ? "80px" : "0",
                }}
              >
                {/* Vertical branch line */}
                <div
                  className={cn(
                    "absolute w-0.5 bg-border",
                    index % 2 === 0
                      ? "bottom-full left-1/2 h-8 -translate-x-1/2"
                      : "left-1/2 top-full h-8 -translate-x-1/2"
                  )}
                />
                {/* Progress branch line */}
                {milestone.status !== "locked" && (
                  <div
                    className={cn(
                      "absolute w-0.5 bg-primary",
                      index % 2 === 0
                        ? "bottom-full left-1/2 h-8 -translate-x-1/2"
                        : "left-1/2 top-full h-8 -translate-x-1/2"
                    )}
                  />
                )}

                {/* Node on spine */}
                <div
                  className={cn(
                    "relative z-10 flex h-4 w-4 items-center justify-center rounded-full border-2 transition-colors",
                    milestone.status === "locked" && "border-muted-foreground/30 bg-muted",
                    milestone.status === "active" &&
                      "border-primary bg-primary shadow-lg shadow-primary/50",
                    milestone.status === "completed" && "border-green-500 bg-green-500"
                  )}
                >
                  {milestone.status === "active" && (
                    <div className="h-2 w-2 animate-pulse rounded-full bg-white" />
                  )}
                </div>

                {/* Milestone Card */}
                <div
                  className={cn(
                    "absolute w-64",
                    index % 2 === 0 ? "bottom-full mb-2" : "top-full mt-2"
                  )}
                >
                  <MilestoneNode
                    milestone={milestone}
                    position={index % 2 === 0 ? "top" : "bottom"}
                    isCurrent={milestone.id === currentMilestoneId}
                    onClick={() => onMilestoneClick?.(milestone.id)}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* End arrow */}
          <div className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center">
            <ChevronRight className="h-6 w-6 text-muted-foreground" />
          </div>
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
