import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Message } from "@/types";

import { ChatInput } from "./ChatInput";
import { ChatMessage } from "./ChatMessage";
import { ExecutionProgress, type ExecutionEvent } from "./ExecutionProgress";

interface ChatAreaProps {
  messages: Message[];
  onSendMessage: (message: string) => void;
  isLoading?: boolean;
  className?: string;
  executionEvents?: ExecutionEvent[];
}

export function ChatArea({
  messages,
  onSendMessage,
  isLoading,
  className,
  executionEvents = [],
}: ChatAreaProps) {
  return (
    <div className={cn("flex flex-col border-t bg-card", className)}>
      {/* Messages */}
      <ScrollArea className="flex-1 px-4">
        <div className="space-y-2 py-4">
          {messages.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              开始一个新的对话
            </div>
          ) : (
            messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))
          )}

          {/* Execution Progress */}
          {executionEvents.length > 0 && (
            <ExecutionProgress events={executionEvents} />
          )}

          {isLoading && executionEvents.length === 0 && (
            <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
              <div className="h-2 w-2 animate-bounce rounded-full bg-primary" />
              <div
                className="h-2 w-2 animate-bounce rounded-full bg-primary"
                style={{ animationDelay: "0.1s" }}
              />
              <div
                className="h-2 w-2 animate-bounce rounded-full bg-primary"
                style={{ animationDelay: "0.2s" }}
              />
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <ChatInput onSend={onSendMessage} disabled={isLoading} />
    </div>
  );
}
