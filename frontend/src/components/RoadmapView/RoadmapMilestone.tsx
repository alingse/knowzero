import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

import type { RoadmapMilestone } from "@/types";

interface RoadmapMilestoneProps {
  milestone: RoadmapMilestone;
  index: number;
}

export function RoadmapMilestone({ milestone, index }: RoadmapMilestoneProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="relative border-l-2 border-muted-foreground/20 pb-6 pl-4 last:pb-0">
      {/* Timeline dot */}
      <div className="absolute -left-[9px] top-0 h-4 w-4 rounded-full border-2 border-background bg-primary" />

      {/* Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-start gap-2 text-left transition-colors hover:text-primary"
      >
        {isExpanded ? (
          <ChevronDown className="mt-1 h-4 w-4 shrink-0" />
        ) : (
          <ChevronRight className="mt-1 h-4 w-4 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">阶段 {index + 1}</span>
          </div>
          <h3 className="text-sm font-semibold">{milestone.title}</h3>
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="ml-6 mt-2 space-y-3">
          {/* Description */}
          {milestone.description && (
            <p className="text-sm text-muted-foreground">{milestone.description}</p>
          )}

          {/* Topics */}
          {milestone.topics && milestone.topics.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {milestone.topics.map((topic, i) => (
                <span
                  key={i}
                  className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
                >
                  {topic}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
