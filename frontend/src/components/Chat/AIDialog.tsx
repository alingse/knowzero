import { Send, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import { MessagesList, type DisplayMessage } from "./MessagesList";
import type { ExecutionEvent } from "./ExecutionProgress";

interface AIDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (message: string) => void;
  isLoading?: boolean;
  messages?: DisplayMessage[];
  executionEvents?: ExecutionEvent[];
  className?: string;
}

interface QuickAction {
  id: string;
  label: string;
  prompt: string;
  icon: string;
}

const quickActions: QuickAction[] = [
  { id: "explain", label: "解释当前内容", prompt: "请详细解释一下当前文档的内容", icon: "💡" },
  { id: "examples", label: "举例说明", prompt: "请举几个例子说明这个知识点", icon: "📝" },
  { id: "practice", label: "练习题", prompt: "请给我几道练习题", icon: "✏️" },
  { id: "deepen", label: "深入学习", prompt: "请深入讲解这个主题的更多细节", icon: "🔍" },
];

export function AIDialog({
  isOpen,
  onClose,
  onSend,
  isLoading = false,
  messages = [],
  executionEvents = [],
  className,
}: AIDialogProps) {
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when dialog opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSend = () => {
    if (!message.trim() || isLoading) return;
    onSend(message.trim());
    setMessage("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickAction = (action: QuickAction) => {
    if (isLoading) return;
    onSend(action.prompt);
  };

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        "fixed bottom-0 right-0 z-40 flex h-[500px] w-full max-w-md flex-col border-l bg-background shadow-2xl transition-transform duration-300 sm:bottom-0 sm:right-[280px] sm:h-[600px] sm:rounded-l-2xl sm:border-t",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-blue-500">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold">AI 助手</div>
            <div className="text-xs text-muted-foreground">随时为你服务</div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted"
        >
          <span className="text-xs">按 ESC 关闭</span>
        </button>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 px-4 py-3">
        {messages.length > 0 ? (
          <MessagesList
            messages={messages}
            isLoading={isLoading}
            executionEvents={executionEvents}
            showAvatars={true}
          />
        ) : (
          <EmptyState onQuickAction={handleQuickAction} isLoading={isLoading} />
        )}
      </ScrollArea>

      {/* Input area */}
      <div className="border-t p-4">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="输入你的问题... (Shift+Enter 换行)"
            disabled={isLoading}
            className="flex-1"
          />
          <Button
            onClick={handleSend}
            disabled={!message.trim() || isLoading}
            size="icon"
            className="h-10 w-10 shrink-0"
          >
            {isLoading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface EmptyStateProps {
  onQuickAction: (action: QuickAction) => void;
  isLoading: boolean;
}

function EmptyState({ onQuickAction, isLoading }: EmptyStateProps) {
  return (
    <div className="space-y-4">
      {/* Quick actions */}
      <div>
        <div className="mb-3 text-xs font-medium text-muted-foreground">快捷操作</div>
        <div className="grid grid-cols-2 gap-2">
          {quickActions.map((action) => (
            <button
              key={action.id}
              onClick={() => onQuickAction(action)}
              disabled={isLoading}
              className={cn(
                "flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition-all",
                "hover:border-primary/50 hover:bg-accent",
                "disabled:cursor-not-allowed disabled:opacity-50"
              )}
            >
              <span className="text-lg">{action.icon}</span>
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <span className="relative bg-background px-2 text-xs text-muted-foreground">
          自定义提问
        </span>
      </div>

      {/* Custom question hints */}
      <div className="space-y-2">
        <div className="text-xs text-muted-foreground">你可以问：</div>
        <div className="space-y-1 text-xs text-muted-foreground/80">
          <div className="flex items-start gap-2">
            <span>•</span>
            <span>"解释一下这个概念"</span>
          </div>
          <div className="flex items-start gap-2">
            <span>•</span>
            <span>"给我更多例子"</span>
          </div>
          <div className="flex items-start gap-2">
            <span>•</span>
            <span>"这和 XXX 有什么区别"</span>
          </div>
        </div>
      </div>
    </div>
  );
}
