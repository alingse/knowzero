import { ChevronDown, MapPin } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

import type { RoadmapMilestone } from "@/types";

interface MilestoneBadgeProps {
  milestone: RoadmapMilestone | null;
  roadmapGoal?: string;
  onChange?: (milestoneId: number | null) => void;
  availableMilestones?: RoadmapMilestone[];
  className?: string;
}

export function MilestoneBadge({
  milestone,
  roadmapGoal,
  onChange,
  availableMilestones = [],
  className,
}: MilestoneBadgeProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  if (!milestone) {
    return null;
  }

  return (
    <div className={cn("relative", className)}>
      {/* Badge */}
      <button
        type="button"
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
      >
        <MapPin className="h-3 w-3" />
        <span>阶段 {milestone.id + 1}</span>
        <span className="text-primary/70">·</span>
        <span className="max-w-[150px] truncate">{milestone.title}</span>
        {onChange && <ChevronDown className="h-3 w-3 opacity-50" />}
      </button>

      {/* Dropdown */}
      {isDropdownOpen && onChange && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setIsDropdownOpen(false)} />

          {/* Dropdown Menu */}
          <div className="absolute z-20 mt-1 min-w-[200px] rounded-md border border-border bg-popover py-1 shadow-lg">
            <div className="border-b px-3 py-1.5 text-xs font-medium text-muted-foreground">
              {roadmapGoal || "学习路线图"}
            </div>
            {availableMilestones.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  onChange(m.id);
                  setIsDropdownOpen(false);
                }}
                className={cn(
                  "w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-muted",
                  m.id === milestone.id && "bg-primary/10 text-primary"
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">阶段 {m.id + 1}</span>
                  <span className="truncate">{m.title}</span>
                </div>
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setIsDropdownOpen(false);
              }}
              className="w-full border-t px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted"
            >
              取消关联
            </button>
          </div>
        </>
      )}
    </div>
  );
}
