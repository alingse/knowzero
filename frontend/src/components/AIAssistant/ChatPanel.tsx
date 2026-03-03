/**
 * ChatPanel - Reusable chat panel component
 *
 * Supports two variants:
 * - embedded: Fixed height panel (for bottom chat area)
 * - dialog: Floating dialog (for crystal ball trigger)
 */

import { X, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { MessagesList, type DisplayMessage } from "../Chat/MessagesList";
import type { ExecutionEvent } from "../Chat/ExecutionProgress";

interface ChatPanelProps {
  variant?: "embedded" | "dialog";
  isOpen?: boolean;
  onClose?: () => void;
  messages: DisplayMessage[];
  executionEvents?: ExecutionEvent[];
  isLoading?: boolean;
  disabled?: boolean; // External disabled state (e.g., from agent status)
  onSend: (message: string) => void;
  onDocumentClick?: (docId: number) => void;
  className?: string;
}

export function ChatPanel({
  variant = "embedded",
  isOpen = true,
  onClose,
  messages,
  executionEvents = [],
  isLoading = false,
  disabled = false,
  onSend,
  onDocumentClick,
  className,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when dialog opens
  useEffect(() => {
    if (variant === "dialog" && isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [variant, isOpen]);

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    onSend(input.trim());
    setInput("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Embedded variant (bottom chat area)
  if (variant === "embedded") {
    return (
      <div className={cn("flex flex-col bg-card", className)}>
        <ScrollArea className="flex-1 px-4">
          <div className="py-4 w-full">
            <MessagesList
              messages={messages}
              isLoading={isLoading}
              executionEvents={executionEvents}
              showAvatars={true}
              onDocumentClick={onDocumentClick}
              emptyState={
                <div className="py-8 text-center text-sm text-muted-foreground">
                  开始一个新的对话
                </div>
              }
            />
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="border-t p-4">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder={disabled ? "正在生成文档，请稍候..." : "输入你的问题..."}
              disabled={isLoading || disabled}
              className="flex-1"
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isLoading || disabled}
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

  // Dialog variant (floating panel)
  if (!isOpen) return null;

  return (
    <div
      className={cn(
        "fixed bottom-0 right-0 z-40 flex h-[500px] w-full max-w-md flex-col border-l bg-background shadow-2xl sm:bottom-4 sm:right-[280px] sm:h-[600px] sm:rounded-2xl sm:border",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-blue-500">
            <span className="text-lg">✨</span>
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
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4 py-3">
        <MessagesList
          messages={messages}
          isLoading={isLoading}
          executionEvents={executionEvents}
          showAvatars={true}
          onDocumentClick={onDocumentClick}
          emptyState={
            <div className="space-y-4 text-sm">
              <div className="text-muted-foreground">你可以问我：</div>
              <div className="space-y-2">
                <button
                  onClick={() => onSend("请详细解释一下当前文档的内容")}
                  className="block w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent"
                >
                  💡 解释当前内容
                </button>
                <button
                  onClick={() => onSend("请举几个例子说明这个知识点")}
                  className="block w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent"
                >
                  📝 举例说明
                </button>
                <button
                  onClick={() => onSend("请给我几道练习题")}
                  className="block w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent"
                >
                  ✏️ 练习题
                </button>
                <button
                  onClick={() => onSend("请深入讲解这个主题的更多细节")}
                  className="block w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent"
                >
                  🔍 深入学习
                </button>
              </div>
            </div>
          }
        />
      </ScrollArea>

      {/* Input */}
      <div className="border-t p-4">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={
              disabled ? "正在生成文档，请稍候..." : "输入你的问题... (Shift+Enter 换行)"
            }
            disabled={isLoading || disabled}
            className="flex-1"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isLoading || disabled}
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
