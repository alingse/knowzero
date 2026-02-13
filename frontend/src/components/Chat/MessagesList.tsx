import { Bot, User, FileText, Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { Message } from "@/types";
import type { ExecutionEvent } from "./ExecutionProgress";
import { CompactExecutionProgress } from "./CompactExecutionProgress";

// Re-export Message type as DisplayMessage for component usage
export type DisplayMessage = Message;

interface MessagesListProps {
  messages: DisplayMessage[];
  isLoading?: boolean;
  executionEvents?: ExecutionEvent[];
  className?: string;
  emptyState?: React.ReactNode;
  showAvatars?: boolean;
}

export function MessagesList({
  messages,
  isLoading = false,
  executionEvents = [],
  className,
  emptyState,
  showAvatars = true,
}: MessagesListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, executionEvents]);

  if (messages.length === 0 && emptyState) {
    return <div className={className}>{emptyState}</div>;
  }

  return (
    <div className={cn("space-y-3", className)}>
      {messages.map((message) => (
        <MessageItem
          key={message.id}
          message={message}
          executionEvents={executionEvents}
          showAvatar={showAvatars}
        />
      ))}

      {/* Loading indicator - only show when loading and no placeholder message */}
      {isLoading && !messages.some(m => m.isPlaceholder && m.placeholderType === 'generating') && (
        <LoadingIndicator showAvatar={showAvatars} executionEvents={executionEvents} />
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}

interface MessageItemProps {
  message: DisplayMessage;
  executionEvents?: ExecutionEvent[];
  showAvatar?: boolean;
}

function MessageItem({ message, executionEvents = [], showAvatar = true }: MessageItemProps) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  // System messages (like "Session started")
  if (isSystem) {
    return (
      <div className="flex justify-center py-1">
        <span className="text-xs text-muted-foreground">{message.content}</span>
      </div>
    );
  }

  // Placeholder messages
  if (message.isPlaceholder) {
    return (
      <PlaceholderMessage
        type={message.placeholderType || 'generating'}
        documentTitle={message.documentTitle}
        executionEvents={executionEvents}
        showAvatar={showAvatar}
      />
    );
  }

  // Regular messages
  return (
    <div
      className={cn(
        "flex gap-3 py-2",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      {showAvatar && (
        <Avatar className={cn("h-8 w-8 shrink-0", isUser ? "bg-primary" : "bg-muted")}>
          <AvatarFallback>
            {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
          </AvatarFallback>
        </Avatar>
      )}

      <div
        className={cn(
          "max-w-[85%] rounded-lg px-4 py-2.5 text-sm",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        )}
      >
        {message.content}
      </div>
    </div>
  );
}

interface PlaceholderMessageProps {
  type: 'generating' | 'complete' | 'error';
  documentTitle?: string;
  executionEvents?: ExecutionEvent[];
  showAvatar?: boolean;
}

function PlaceholderMessage({ 
  type, 
  documentTitle, 
  executionEvents = [], 
  showAvatar = true 
}: PlaceholderMessageProps) {
  if (type === 'generating') {
    return (
      <div className="flex gap-3 py-2">
        {showAvatar && (
          <Avatar className="h-8 w-8 shrink-0 bg-muted">
            <AvatarFallback>
              <Bot className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
        )}
        <div className="max-w-[85%]">
          <div className="rounded-lg bg-muted px-4 py-2.5 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              正在生成学习文档...
            </span>
          </div>
          {/* Show compact execution progress below the placeholder */}
          <CompactExecutionProgress events={executionEvents} />
        </div>
      </div>
    );
  }

  if (type === 'complete') {
    return (
      <div className="flex gap-3 py-2">
        {showAvatar && (
          <Avatar className="h-8 w-8 shrink-0 bg-muted">
            <AvatarFallback>
              <Bot className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
        )}
        <div className="max-w-[85%] rounded-lg bg-muted px-4 py-2.5 text-sm">
          <span className="inline-flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            已为你生成
            {documentTitle ? (
              <span className="font-medium">《{documentTitle}》</span>
            ) : (
              "学习文档"
            )}
            📄
          </span>
        </div>
      </div>
    );
  }

  // Error state
  return (
    <div className="flex gap-3 py-2">
      {showAvatar && (
        <Avatar className="h-8 w-8 shrink-0 bg-destructive/10">
          <AvatarFallback>
            <Bot className="h-4 w-4 text-destructive" />
          </AvatarFallback>
        </Avatar>
      )}
      <div className="max-w-[85%] rounded-lg bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
        抱歉，生成文档时出现了问题，请重试。
      </div>
    </div>
  );
}

interface LoadingIndicatorProps {
  showAvatar?: boolean;
  executionEvents?: ExecutionEvent[];
}

function LoadingIndicator({ showAvatar = true, executionEvents = [] }: LoadingIndicatorProps) {
  return (
    <div className="flex gap-3 py-2">
      {showAvatar && (
        <Avatar className="h-8 w-8 shrink-0 bg-muted">
          <AvatarFallback>
            <Bot className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
      )}
      <div className="max-w-[85%]">
        <div className="flex items-center gap-1 rounded-lg bg-muted px-4 py-2.5">
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
        <CompactExecutionProgress events={executionEvents} />
      </div>
    </div>
  );
}
