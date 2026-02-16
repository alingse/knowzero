import { Map, Pencil } from "lucide-react";
import { useState } from "react";

import { FishboneTimeline } from "./FishboneTimeline";
import { RoadmapEdit } from "./RoadmapEdit";
import { RoadmapMilestone } from "./RoadmapMilestone";
import { roadmapsApi } from "@/api/client";
import { cn } from "@/lib/utils";

import type { Roadmap, RoadmapProgress } from "@/types";

interface RoadmapViewProps {
  roadmap: Roadmap;
  progress?: RoadmapProgress;
  onUpdate?: (updated: Roadmap) => void;
  className?: string;
}

export function RoadmapView({ roadmap, progress, onUpdate, className }: RoadmapViewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentMilestoneId, setCurrentMilestoneId] = useState<number | undefined>(
    progress?.milestones.find((m) => m.status === "active")?.id
  );

  const handleSave = async (updates: Partial<Roadmap>) => {
    const updated = await roadmapsApi.update(roadmap.id, updates);
    if (onUpdate) {
      onUpdate(updated);
    }
    setIsEditing(false);
  };

  const handleMilestoneClick = (milestoneId: number) => {
    setCurrentMilestoneId(milestoneId);
    // TODO: Navigate to milestone or show detail
  };

  if (isEditing) {
    return (
      <RoadmapEdit
        roadmap={roadmap}
        onSave={handleSave}
        onCancel={() => setIsEditing(false)}
        className={className}
      />
    );
  }

  // If progress data is available, use FishboneTimeline
  if (progress) {
    return (
      <div className={cn("flex flex-col gap-4", className)}>
        {/* Header with edit button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Map className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">学习路线图</h2>
          </div>
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="编辑路线图"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Fishbone Timeline */}
        <FishboneTimeline
          progress={progress}
          currentMilestoneId={currentMilestoneId}
          onMilestoneClick={handleMilestoneClick}
        />
      </div>
    );
  }

  // Fallback to original view if no progress data
  return (
    <div className={cn("flex flex-col gap-6", className)}>
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <Map className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">学习路线图</h2>
          </div>
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="编辑路线图"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Goal */}
        <div className="rounded-lg border border-primary/10 bg-primary/5 p-3">
          <p className="text-sm font-medium text-primary">{roadmap.goal}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            共 {roadmap.milestones.length} 个学习阶段 · 版本 {roadmap.version}
          </p>
        </div>
      </div>

      {/* Mermaid diagram - still show if no progress */}
      {roadmap.mermaid && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">可视化路径</h3>
          <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-xs">
            <code>{roadmap.mermaid}</code>
          </pre>
        </div>
      )}

      {/* Milestones */}
      <div className="space-y-1">
        <h3 className="text-sm font-medium">学习阶段</h3>
        <div className="space-y-0">
          {roadmap.milestones.map((milestone, index) => (
            <RoadmapMilestone key={milestone.id} milestone={milestone} index={index} />
          ))}
        </div>
      </div>
    </div>
  );
}
