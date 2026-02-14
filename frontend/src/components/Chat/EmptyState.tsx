import { BookOpen, MessageCircle, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  type: "chat" | "document";
  className?: string;
  onQuickAction?: (prompt: string) => void;
}

const quickPrompts = [
  { icon: Sparkles, label: "生成学习文档", prompt: "帮我生成一个关于 FastAPI 的学习文档" },
  { icon: MessageCircle, label: "开始对话", prompt: "你好，我想学习编程" },
  { icon: BookOpen, label: "探索知识", prompt: "请介绍一下 Python 的主要特性" },
];

export function EmptyState({ type, className, onQuickAction }: EmptyStateProps) {
  if (type === "chat") {
    return (
      <div className={cn("flex flex-col items-center justify-center py-16", className)}>
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-full bg-muted p-4">
            <MessageCircle className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-medium">开始新的对话</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              输入问题或选择快捷操作开始学习
            </p>
          </div>
          {onQuickAction && (
            <div className="mt-4 flex flex-col gap-2">
              {quickPrompts.map((action) => (
                <Button
                  key={action.label}
                  variant="outline"
                  size="sm"
                  onClick={() => onQuickAction(action.prompt)}
                  className="gap-2"
                >
                  <action.icon className="h-4 w-4" />
                  {action.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // document type
  return (
    <div className={cn("flex flex-col items-center justify-center py-16", className)}>
      <div className="flex flex-col items-center gap-4">
        <div className="rounded-full bg-muted p-4">
          <BookOpen className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="text-center">
          <h3 className="text-lg font-medium">选择一个文档开始阅读</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            或创建一个新的学习会话
          </p>
        </div>
      </div>
    </div>
  );
}
