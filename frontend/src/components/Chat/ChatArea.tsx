import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import { ChatInput } from "./ChatInput";
import { EmptyState } from "./EmptyState";
import { ExecutionProgress, type ExecutionEvent } from "./ExecutionProgress";
import { MessagesList, type DisplayMessage } from "./MessagesList";

interface ChatAreaProps {
  messages: DisplayMessage[];
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
        <div className="py-4">
          <MessagesList
            messages={messages}
            isLoading={isLoading}
            executionEvents={executionEvents}
            showAvatars={true}
            emptyState={<EmptyState type="chat" onQuickAction={onSendMessage} />}
          />

          {/* Legacy Execution Progress - only show when no placeholder message */}
          {!messages.some(m => m.isPlaceholder) && executionEvents.length > 0 && (
            <ExecutionProgress events={executionEvents} className="mt-4" />
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <ChatInput onSend={onSendMessage} disabled={isLoading} />
    </div>
  );
}
