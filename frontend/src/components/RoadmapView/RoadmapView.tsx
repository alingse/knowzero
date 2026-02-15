import { BookOpen, GitBranch, Info, Pencil } from "lucide-react";
import { useMemo, useState } from "react";

import { RoadmapEdit } from "./RoadmapEdit";
import { RoadmapMilestone } from "./RoadmapMilestone";
import { roadmapsApi } from "@/api/client";
import { cn } from "@/lib/utils";

import type { Roadmap } from "@/types";

interface RoadmapViewProps {
  roadmap: Roadmap;
  onUpdate?: (updated: Roadmap) => void;
  className?: string;
}

export function RoadmapView({ roadmap, onUpdate, className }: RoadmapViewProps) {
  const [isEditing, setIsEditing] = useState(false);

  // Memoize mermaid rendering
  const mermaidSvg = useMemo(() => {
    if (!roadmap.mermaid) return null;

    // Note: In production, you'd use a proper mermaid renderer
    // For now, we'll display it as preformatted text
    return (
      <pre className="text-xs overflow-x-auto p-4 bg-muted rounded-lg">
        <code>{roadmap.mermaid}</code>
      </pre>
    );
  }, [roadmap.mermaid]);

  const handleSave = async (updates: Partial<Roadmap>) => {
    const updated = await roadmapsApi.update(roadmap.id, updates);
    if (onUpdate) {
      onUpdate(updated);
    }
    setIsEditing(false);
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

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">学习路线图</h2>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5" />
              <span>版本 {roadmap.version}</span>
            </div>
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="编辑路线图"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Goal */}
        <div className="flex items-start gap-2 p-3 bg-primary/5 rounded-lg border border-primary/10">
          <BookOpen className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-primary">
              {roadmap.goal}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              共 {roadmap.milestones.length} 个学习阶段
            </p>
          </div>
        </div>
      </div>

      {/* Mermaid diagram */}
      {mermaidSvg && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">可视化路径</h3>
          {mermaidSvg}
        </div>
      )}

      {/* Milestones */}
      <div className="space-y-1">
        <h3 className="text-sm font-medium">学习阶段</h3>
        <div className="space-y-0">
          {roadmap.milestones.map((milestone, index) => (
            <RoadmapMilestone
              key={milestone.id}
              milestone={milestone}
              index={index}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
