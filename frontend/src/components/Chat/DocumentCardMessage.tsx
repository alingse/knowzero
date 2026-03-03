import { FileText, ChevronRight, Clock, Layers } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface DocumentCardMessageProps {
  documentId: number;
  title: string;
  excerpt?: string;
  processingTimeSeconds?: number;
  stagesCompleted?: string[];
  timestamp: string;
  onDocumentClick?: (docId: number) => void;
}

export function DocumentCardMessage({
  documentId,
  title,
  excerpt,
  processingTimeSeconds,
  stagesCompleted,
  onDocumentClick,
}: DocumentCardMessageProps) {
  const handleClick = () => {
    onDocumentClick?.(documentId);
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}秒`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return secs > 0 ? `${mins}分${secs}秒` : `${mins}分钟`;
  };

  return (
    <div className="flex gap-2 py-2 sm:gap-3">
      <Avatar className="h-7 w-7 shrink-0 bg-muted sm:h-8 sm:w-8">
        <AvatarFallback>
          <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </AvatarFallback>
      </Avatar>

      <div
        className={cn(
          "min-w-[200px] max-w-[85%] cursor-pointer sm:min-w-[300px]",
          "group transition-all duration-200",
          "hover:translate-y-[-1px]"
        )}
        onClick={handleClick}
      >
        <div className="rounded-lg border border-transparent bg-muted px-3 py-2.5 hover:border-border/50 hover:shadow-sm sm:px-4 sm:py-3">
          {/* 标题栏 */}
          <div className="mb-1.5 flex items-center gap-2 text-xs font-medium sm:mb-2 sm:text-sm">
            <span>📚 已生成学习文档</span>
          </div>

          {/* 文档预览卡片 */}
          <div className="mb-2 rounded-md border border-border/50 bg-background p-2.5 transition-colors group-hover:border-primary/30 sm:p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h4 className="mb-1 truncate text-xs font-medium text-foreground sm:text-sm">
                  {title}
                </h4>
                {excerpt && (
                  <p className="line-clamp-2 text-[10px] text-muted-foreground sm:text-xs">
                    {excerpt}
                  </p>
                )}
              </div>
              <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-primary sm:h-4 sm:w-4" />
            </div>
          </div>

          {/* 元信息栏 */}
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground sm:gap-3 sm:text-xs">
            {processingTimeSeconds !== undefined && (
              <span className="flex items-center gap-1">
                <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                生成耗时 {formatDuration(processingTimeSeconds)}
              </span>
            )}
            {stagesCompleted && stagesCompleted.length > 0 && (
              <span className="flex items-center gap-1">
                <Layers className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                {stagesCompleted.length}个阶段完成
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
