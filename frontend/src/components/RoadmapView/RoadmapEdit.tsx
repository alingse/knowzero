import { Loader2, Save, X } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

import type { Roadmap, RoadmapMilestone } from "@/types";

interface RoadmapEditProps {
  roadmap: Roadmap;
  onSave: (updates: Partial<Roadmap>) => Promise<void>;
  onCancel: () => void;
  className?: string;
}

interface EditingMilestone extends RoadmapMilestone {
  isDirty?: boolean;
}

export function RoadmapEdit({ roadmap, onSave, onCancel, className }: RoadmapEditProps) {
  const [goal, setGoal] = useState(roadmap.goal);
  const [mermaid, setMermaid] = useState(roadmap.mermaid || "");
  const [milestones, setMilestones] = useState<EditingMilestone[]>(
    roadmap.milestones.map((m) => ({ ...m }))
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        goal,
        mermaid: mermaid || undefined,
        milestones: milestones.map((m, i) => ({
          ...m,
          id: i,
        })),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const updateMilestone = (
    index: number,
    field: keyof EditingMilestone,
    value: string | string[]
  ) => {
    setMilestones((prev) =>
      prev.map((m, i) => (i === index ? { ...m, [field]: value, isDirty: true } : m))
    );
  };

  const addMilestone = () => {
    setMilestones((prev) => [
      ...prev,
      {
        id: prev.length,
        title: "新阶段",
        description: "",
        topics: [],
        isDirty: true,
      },
    ]);
  };

  const removeMilestone = (index: number) => {
    setMilestones((prev) => prev.filter((_, i) => i !== index));
  };

  const addTopic = (milestoneIndex: number) => {
    const topic = prompt("输入知识点名称:");
    if (topic && topic.trim()) {
      updateMilestone(milestoneIndex, "topics", [
        ...(milestones[milestoneIndex].topics || []),
        topic.trim(),
      ]);
    }
  };

  const removeTopic = (milestoneIndex: number, topicIndex: number) => {
    const newTopics = [...(milestones[milestoneIndex].topics || [])];
    newTopics.splice(topicIndex, 1);
    updateMilestone(milestoneIndex, "topics", newTopics);
  };

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">编辑学习路线图</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
            disabled={isSaving}
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            保存
          </button>
        </div>
      </div>

      {/* Goal */}
      <div className="space-y-2">
        <label className="text-sm font-medium">学习目标</label>
        <input
          type="text"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="输入学习目标..."
        />
      </div>

      {/* Mermaid */}
      <div className="space-y-2">
        <label className="text-sm font-medium">可视化路径 (Mermaid)</label>
        <textarea
          value={mermaid}
          onChange={(e) => setMermaid(e.target.value)}
          rows={4}
          className="w-full resize-none rounded-md border bg-background px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="graph TD&#10;  A[开始] --> B[阶段1]&#10;  B --> C[阶段2]&#10;  C --> D[完成]"
        />
      </div>

      {/* Milestones */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">学习阶段</label>
          <button
            type="button"
            onClick={addMilestone}
            className="text-xs font-medium text-primary hover:underline"
          >
            + 添加阶段
          </button>
        </div>

        {milestones.map((milestone, index) => (
          <div key={milestone.id} className="relative space-y-3 rounded-lg border p-4">
            <div className="flex items-start justify-between">
              <span className="text-xs font-medium text-muted-foreground">阶段 {index + 1}</span>
              <button
                type="button"
                onClick={() => removeMilestone(index)}
                className="text-muted-foreground transition-colors hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Title */}
            <input
              type="text"
              value={milestone.title}
              onChange={(e) => updateMilestone(index, "title", e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="阶段标题..."
            />

            {/* Description */}
            <textarea
              value={milestone.description}
              onChange={(e) => updateMilestone(index, "description", e.target.value)}
              rows={2}
              className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="阶段描述..."
            />

            {/* Topics */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">知识点</span>
                <button
                  type="button"
                  onClick={() => addTopic(index)}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  + 添加
                </button>
              </div>
              {milestone.topics && milestone.topics.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {milestone.topics.map((topic, topicIndex) => (
                    <span
                      key={topicIndex}
                      className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
                    >
                      {topic}
                      <button
                        type="button"
                        onClick={() => removeTopic(index, topicIndex)}
                        className="hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs italic text-muted-foreground">暂无知识点</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
