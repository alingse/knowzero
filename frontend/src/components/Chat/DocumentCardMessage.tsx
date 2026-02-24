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
    <div className="flex gap-3 py-2">
      <Avatar className="h-8 w-8 shrink-0 bg-muted">
        <AvatarFallback>
          <FileText className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>

      <div
        className={cn(
          "min-w-[300px] max-w-[85%] cursor-pointer",
          "group transition-all duration-200",
          "hover:translate-y-[-1px]"
        )}
        onClick={handleClick}
      >
        <div className="rounded-lg border border-transparent bg-muted px-4 py-3 hover:border-border/50 hover:shadow-sm">
          {/* 标题栏 */}
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <span>📚 已生成学习文档</span>
          </div>

          {/* 文档预览卡片 */}
          <div className="mb-2 rounded-md border border-border/50 bg-background p-3 transition-colors group-hover:border-primary/30">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h4 className="mb-1 truncate font-medium text-foreground">{title}</h4>
                {excerpt && <p className="line-clamp-2 text-xs text-muted-foreground">{excerpt}</p>}
              </div>
              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
            </div>
          </div>

          {/* 元信息栏 */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {processingTimeSeconds !== undefined && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                生成耗时 {formatDuration(processingTimeSeconds)}
              </span>
            )}
            {stagesCompleted && stagesCompleted.length > 0 && (
              <span className="flex items-center gap-1">
                <Layers className="h-3 w-3" />
                {stagesCompleted.length}个阶段完成
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
