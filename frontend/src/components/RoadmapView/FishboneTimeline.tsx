import { useState, useCallback } from "react";
import {
  Check,
  ChevronRight,
  Lock,
  PlayCircle,
  Target,
  BookOpen,
  Plus,
  MessageCircle,
  FileText,
  Rocket,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  getProgressButtonColor,
  getCompletedCardStyle,
  getCompletedTitleColor,
  getCompletedBadgeStyle,
} from "@/utils/roadmapColors";

import type {
  RoadmapProgress,
  RoadmapMilestoneProgress,
  MilestoneDocument,
  MilestoneGenerateParams,
} from "@/types";
import { GenerationMode } from "@/types";

interface FishboneTimelineProps {
  progress: RoadmapProgress;
  currentMilestoneId?: number;
  onMilestoneClick?: (milestoneId: number) => void;
  onGenerateDocument?: (params: MilestoneGenerateParams) => void;
  onViewDocuments?: (milestoneId: number) => void;
  className?: string;
}

// Document tags displayed below milestone card
function DocumentTags({ docs }: { docs: MilestoneDocument[] }) {
  if (docs.length === 0) return null;

  // Show all docs if <= 4, otherwise show first 4 and "+N"
  const displayDocs = docs.length <= 4 ? docs : docs.slice(0, 4);
  const remaining = docs.length - 4;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {displayDocs.map((doc) => (
        <span
          key={doc.id}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium",
            "border bg-background/80 shadow-sm",
            "text-muted-foreground transition-colors hover:text-foreground"
          )}
          title={doc.topic}
        >
          <FileText className="h-3 w-3" />
          <span>{doc.topic}</span>
        </span>
      ))}
      {remaining > 0 && (
        <span className="px-1 text-[10px] text-muted-foreground">+{remaining} 篇</span>
      )}
    </div>
  );
}

// Milestone action popover content
function MilestonePopoverContent({
  milestone,
  sessionGoal,
  onGenerateDocument,
  onViewDocuments,
  onClose,
}: {
  milestone: RoadmapMilestoneProgress;
  sessionGoal: string;
  onGenerateDocument?: (params: MilestoneGenerateParams) => void;
  onViewDocuments?: (milestoneId: number) => void;
  onClose: () => void;
}) {
  const [showQuestionInput, setShowQuestionInput] = useState(false);
  const [question, setQuestion] = useState("");

  const handleGenerateNext = () => {
    onGenerateDocument?.({
      milestone,
      sessionTopic: sessionGoal,
      mode: GenerationMode.STANDARD,
    });
    onClose();
  };

  const handleAdvancedLearning = () => {
    onGenerateDocument?.({
      milestone,
      sessionTopic: sessionGoal,
      mode: GenerationMode.ADVANCED,
    });
    onClose();
  };

  const handleQuestionSubmit = () => {
    if (question.trim()) {
      onGenerateDocument?.({
        milestone,
        sessionTopic: sessionGoal,
        mode: GenerationMode.STANDARD,
        question: question.trim(),
      });
      onClose();
    }
  };

  const handleViewDocuments = () => {
    onViewDocuments?.(milestone.id);
    onClose();
  };

  const isLocked = milestone.status === "locked";
  const isActive = milestone.status === "active";
  const isCompleted = milestone.status === "completed";
  const docCount = milestone.document_count;

  // Get next document preview topic based on count
  const getNextDocPreview = () => {
    const previews = ["基础概念入门", "深入核心机制", "进阶应用与实践", "实战案例综合练习"];
    return previews[docCount] || "进阶拓展内容";
  };

  return (
    <div className="w-72 p-1">
      {/* Header */}
      <div className="mb-3 border-b pb-2">
        <div className="mb-1 flex items-center gap-2">
          <span
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded-full text-xs",
              isLocked && "bg-muted text-muted-foreground",
              isActive && "bg-primary text-primary-foreground",
              isCompleted && "bg-green-500 text-white"
            )}
          >
            {isCompleted ? (
              <Check className="h-3 w-3" />
            ) : isLocked ? (
              <Lock className="h-3 w-3" />
            ) : (
              docCount
            )}
          </span>
          <h4 className="text-sm font-semibold">{milestone.title}</h4>
        </div>
        <p className="text-xs text-muted-foreground">{milestone.description}</p>
      </div>

      {/* Document list */}
      {milestone.documents.length > 0 && (
        <div className="mb-3 space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">已生成文档 ({docCount}篇):</p>
          <div className="max-h-24 space-y-1 overflow-y-auto">
            {milestone.documents.map((doc, docIdx) => (
              <div
                key={doc.id}
                className="flex items-center gap-2 rounded bg-muted/50 px-2 py-1 text-xs"
              >
                <span className="font-mono text-muted-foreground">{docIdx + 1}.</span>
                <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="truncate">{doc.topic}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="space-y-1.5">
        {/* Locked: Generate first doc */}
        {isLocked && (
          <Button size="sm" className="h-8 w-full justify-start gap-2" onClick={handleGenerateNext}>
            <PlayCircle className="h-4 w-4" />
            开始学习
            <span className="ml-auto text-xs opacity-70">生成第1篇</span>
          </Button>
        )}

        {/* Active: Show continue learning options */}
        {isActive && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-full justify-start gap-2"
              onClick={handleViewDocuments}
            >
              <BookOpen className="h-4 w-4" />
              查看全部文档
            </Button>

            {docCount < 4 && (
              <Button
                size="sm"
                className="h-8 w-full justify-start gap-2"
                onClick={handleGenerateNext}
              >
                <Plus className="h-4 w-4" />
                继续学习
                <span className="ml-auto text-xs opacity-70">{getNextDocPreview()}</span>
              </Button>
            )}
          </>
        )}

        {/* Completed: Show advanced options */}
        {isCompleted && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-full justify-start gap-2"
              onClick={handleViewDocuments}
            >
              <BookOpen className="h-4 w-4" />
              查看全部 {docCount} 篇
            </Button>

            <Button
              variant="secondary"
              size="sm"
              className="h-8 w-full justify-start gap-2"
              onClick={handleAdvancedLearning}
            >
              <Rocket className="h-4 w-4" />
              进阶学习
            </Button>
          </>
        )}

        {/* Question input */}
        {!showQuestionInput ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
            onClick={() => setShowQuestionInput(true)}
          >
            <MessageCircle className="h-4 w-4" />
            针对此主题提问...
          </Button>
        ) : (
          <div className="space-y-2 border-t pt-2">
            <Input
              placeholder="输入你的问题..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="h-8 text-xs"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleQuestionSubmit();
              }}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                className="h-7 flex-1 text-xs"
                onClick={handleQuestionSubmit}
                disabled={!question.trim()}
              >
                发送
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  setShowQuestionInput(false);
                  setQuestion("");
                }}
              >
                取消
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function FishboneTimeline({
  progress,
  currentMilestoneId,
  onMilestoneClick,
  onGenerateDocument,
  onViewDocuments,
  className,
}: FishboneTimelineProps) {
  const completedCount = progress.milestones.filter((m) => m.status === "completed").length;

  const [openPopoverId, setOpenPopoverId] = useState<number | null>(null);

  const handleMilestoneClick = useCallback(
    (milestone: RoadmapMilestoneProgress) => {
      if (milestone.status === "locked" && onGenerateDocument) {
        onGenerateDocument({
          milestone,
          sessionTopic: progress.goal,
          mode: GenerationMode.STANDARD,
        });
      } else {
        onMilestoneClick?.(milestone.id);
      }
    },
    [onGenerateDocument, onMilestoneClick, progress.goal]
  );

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">{progress.goal}</h3>
        </div>
        <div className="text-xs text-muted-foreground">
          {completedCount} / {progress.milestones.length} 完成
        </div>
      </div>

      {/* Timeline */}
      <div className="rounded-lg border bg-card p-3">
        <div className="flex flex-col">
          {progress.milestones.map((milestone, index) => {
            const isLast = index === progress.milestones.length - 1;
            const isCurrent = milestone.id === currentMilestoneId;
            const progressPercent = Math.round(milestone.progress * 100);
            const isLocked = milestone.status === "locked";
            const isActive = milestone.status === "active";
            const isCompleted = milestone.status === "completed";
            const hasDocuments = milestone.documents.length > 0;

            return (
              <div key={milestone.id} className="group flex gap-3">
                {/* Left: timeline track */}
                <div className="flex w-8 shrink-0 flex-col items-center">
                  {/* Node with Popover */}
                  <Popover
                    open={openPopoverId === milestone.id}
                    onOpenChange={(open) => setOpenPopoverId(open ? milestone.id : null)}
                  >
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        onClick={(e) => e.stopPropagation()}
                        className={cn(
                          "relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-2 transition-all",
                          isLocked &&
                            "border-muted-foreground/30 bg-muted text-muted-foreground hover:border-muted-foreground/50",
                          isActive && "border-primary bg-primary text-primary-foreground shadow-sm",
                          isCompleted && getProgressButtonColor(milestone.progress),
                          isCurrent && "ring-2 ring-primary ring-offset-1"
                        )}
                      >
                        {isCompleted ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : isLocked ? (
                          <Lock className="h-3 w-3" />
                        ) : (
                          <span className="text-[10px] font-bold">{index + 1}</span>
                        )}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      side="right"
                      align="start"
                      sideOffset={8}
                      className="w-auto p-0"
                    >
                      <MilestonePopoverContent
                        milestone={milestone}
                        sessionGoal={progress.goal}
                        onGenerateDocument={onGenerateDocument}
                        onViewDocuments={onViewDocuments}
                        onClose={() => setOpenPopoverId(null)}
                      />
                    </PopoverContent>
                  </Popover>

                  {/* Connector line */}
                  {!isLast && (
                    <div className="relative my-1 min-h-[24px] w-0.5 flex-1">
                      <div className="absolute inset-0 bg-border" />
                      {!isLocked && <div className="absolute inset-0 bg-primary" />}
                    </div>
                  )}
                </div>

                {/* Right: milestone card */}
                <div className={cn("flex-1 pb-3", isLast && "pb-0")}>
                  <button
                    type="button"
                    onClick={() => handleMilestoneClick(milestone)}
                    className={cn(
                      "w-full rounded-lg border p-2.5 text-left transition-all",
                      "hover:border-primary/20 hover:shadow-sm",
                      isLocked && "border-muted bg-muted/30 opacity-70",
                      isActive && "border-primary/30 bg-primary/5",
                      isCompleted && getCompletedCardStyle(milestone.progress),
                      isCurrent && "ring-1 ring-primary"
                    )}
                  >
                    {/* Title row */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <h4
                          className={cn(
                            "truncate text-sm font-medium",
                            isLocked && "text-muted-foreground",
                            isActive && "text-primary",
                            isCompleted && getCompletedTitleColor(milestone.progress)
                          )}
                        >
                          {milestone.title}
                        </h4>
                        {isActive && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-primary" />}
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                          isLocked && "bg-muted text-muted-foreground",
                          isActive && "bg-primary/10 text-primary",
                          isCompleted && getCompletedBadgeStyle(milestone.progress)
                        )}
                      >
                        {progressPercent}%
                      </span>
                    </div>

                    {/* Description */}
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                      {milestone.description}
                    </p>

                    {/* Status indicator */}
                    <div className="mt-1.5 flex items-center gap-2">
                      {isLocked && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                          <PlayCircle className="h-3 w-3" />
                          点击开始学习
                        </span>
                      )}
                      {isCompleted && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-green-600">
                          <Check className="h-3 w-3" />
                          已完成 · {milestone.document_count} 篇
                        </span>
                      )}
                      {isActive && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-primary">
                          <Plus className="h-3 w-3" />
                          已生成 {milestone.document_count} 篇
                          {milestone.document_count < 4 && " · 点击继续"}
                        </span>
                      )}
                    </div>

                    {/* Document tags */}
                    {hasDocuments && <DocumentTags docs={milestone.documents} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <span>已完成</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-primary" />
          <span>进行中</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full border border-muted-foreground/30 bg-muted" />
          <span>未解锁</span>
        </div>
      </div>
    </div>
  );
}
