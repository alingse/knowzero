/**
 * MobileChatInput - Fixed bottom input bar for mobile devices
 *
 * Features:
 * - Fixed bottom input bar (always visible)
 * - Expandable message history panel (bottom sheet style)
 * - Send button with loading state
 * - Disabled state when agent is running
 */

import { Send, MessageSquare } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

import { EMPTY_STATE_TITLE, QUICK_QUESTIONS } from "@/constants/chat";

import { MessagesList, type DisplayMessage } from "../Chat/MessagesList";
import type { ExecutionEvent } from "../Chat/ExecutionProgress";

export interface MobileChatInputProps {
  messages: DisplayMessage[];
  executionEvents?: ExecutionEvent[];
  isLoading?: boolean;
  disabled?: boolean;
  onSend: (message: string) => void;
  onDocumentClick?: (docId: number) => void;
  unreadCount?: number;
}

export function MobileChatInput({
  messages,
  executionEvents = [],
  isLoading = false,
  disabled = false,
  onSend,
  onDocumentClick,
  unreadCount = 0,
}: MobileChatInputProps) {
  const [input, setInput] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const handleExpand = () => {
    setIsExpanded(true);
  };

  // Focus input when dialog opens
  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isExpanded]);

  return (
    <>
      {/* Fixed Bottom Input Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center gap-2 p-3">
          {/* Expand button with message history */}
          <button
            type="button"
            onClick={handleExpand}
            className="flex flex-1 items-center gap-2 rounded-full border bg-muted px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/80 active:bg-muted/60"
          >
            <MessageSquare className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">
              {disabled ? "正在生成文档，请稍候..." : "输入你的问题..."}
            </span>
            {unreadCount > 0 && !isExpanded && (
              <span className="flex h-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {/* Send button */}
          <Button
            type="button"
            onClick={handleSend}
            disabled={disabled || isLoading}
            size="icon"
            className="h-11 w-11 shrink-0 rounded-full"
          >
            {isLoading ? <Spinner size="md" /> : <Send className="h-5 w-5" />}
          </Button>
        </div>

        {/* Safe area for iOS home indicator */}
        <div className="h-safe-bottom" />
      </div>

      {/* Expandable Message Panel (Bottom Sheet) */}
      <Dialog open={isExpanded} onOpenChange={setIsExpanded}>
        <DialogContent
          className={cn(
            "fixed bottom-0 left-0 right-0 top-auto max-h-mobile-sheet w-full rounded-b-none rounded-t-2xl border-t",
            "flex flex-col p-0 animate-in slide-in-from-bottom",
            // Override DialogContent's default centering styles
            "!translate-x-0 !translate-y-0 !left-0 !top-auto",
            "[&>span:last-child]:hidden" // Hide the close button span from Radix
          )}
          onPointerDownOutside={() => {
            // Allow closing by clicking outside
          }}
          onEscapeKeyDown={() => {
            // Allow closing with Escape key
            setIsExpanded(false);
          }}
        >
          {/* Drag Handle */}
          <div className="flex flex-shrink-0 items-center justify-center border-b px-4 py-3">
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="flex h-8 w-16 items-center justify-center rounded-full bg-muted"
            >
              <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
            </button>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 px-4">
            <div className="py-4 w-full">
              <MessagesList
                messages={messages}
                isLoading={isLoading}
                executionEvents={executionEvents}
                showAvatars={true}
                onDocumentClick={onDocumentClick}
                emptyState={
                  <div className="space-y-4 py-8 text-sm">
                    <div className="text-center text-muted-foreground">{EMPTY_STATE_TITLE}</div>
                    <div className="space-y-2 px-2">
                      {QUICK_QUESTIONS.map((q) => (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() => {
                            onSend(q.message);
                            setIsExpanded(false);
                          }}
                          className="block w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent active:bg-accent/60"
                        >
                          {q.icon} {q.label}
                        </button>
                      ))}
                    </div>
                  </div>
                }
              />
            </div>
          </ScrollArea>

          {/* Input inside expanded panel */}
          <div className="flex-shrink-0 border-t p-4">
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
                type="button"
                onClick={handleSend}
                disabled={!input.trim() || isLoading || disabled}
                size="icon"
                className="h-10 w-10 shrink-0"
              >
                {isLoading ? <Spinner size="sm" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Safe area for iOS home indicator */}
          <div className="h-safe-bottom shrink-0 bg-background" />
        </DialogContent>
      </Dialog>
    </>
  );
}
