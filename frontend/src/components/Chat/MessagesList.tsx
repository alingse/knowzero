import { Bot, User, Loader2 } from "lucide-react";
import React, { useEffect, useRef, memo } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { Message } from "@/types";
import { MessageType } from "@/types";
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

interface MessageItemProps {
  message: DisplayMessage;
  executionEvents?: ExecutionEvent[];
  showAvatar?: boolean;
}

interface PlaceholderMessageProps {
  content: string;
  executionEvents?: ExecutionEvent[];
  showAvatar?: boolean;
}

interface LoadingIndicatorProps {
  showAvatar?: boolean;
  executionEvents?: ExecutionEvent[];
}

// Loading Indicator Component
const LoadingIndicator = memo(function LoadingIndicator({ showAvatar = true, executionEvents = [] }: LoadingIndicatorProps) {
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
});

// Placeholder Message Component
const PlaceholderMessage = memo(function PlaceholderMessage({
  content,
  executionEvents = [],
  showAvatar = true
}: PlaceholderMessageProps) {
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
            {content}
          </span>
        </div>
        {/* Show compact execution progress below the placeholder */}
        <CompactExecutionProgress events={executionEvents} />
      </div>
    </div>
  );
});

// Individual Message Item Component
const MessageItem = memo(function MessageItem({ message, executionEvents = [], showAvatar = true }: MessageItemProps) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  // Hidden internal document tracking messages
  if (message.message_type === MessageType.DOCUMENT_REF) {
    return null;
  }

  // Document card messages (completion notifications from backend)
  if (message.message_type === MessageType.DOCUMENT_CARD) {
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
          {message.content}
        </div>
      </div>
    );
  }

  // Placeholder messages (transient UI state)
  if (message.isPlaceholder) {
    return (
      <PlaceholderMessage
        content={message.content}
        executionEvents={executionEvents}
        showAvatar={showAvatar}
      />
    );
  }

  // System messages (like "Session started")
  if (isSystem) {
    return (
      <div className="flex justify-center py-1">
        <span className="text-xs text-muted-foreground">{message.content}</span>
      </div>
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
});

// Main Messages List Component
function MessagesListComponent({
  messages,
  isLoading = false,
  executionEvents = [],
  className,
  emptyState,
  showAvatars = true,
}: MessagesListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMessagesLengthRef = useRef(messages.length);

  // Auto-scroll to bottom only when new messages are added (not on executionEvents changes)
  useEffect(() => {
    // Only scroll if messages length changed (new message added)
    if (messages.length !== prevMessagesLengthRef.current) {
      prevMessagesLengthRef.current = messages.length;
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [messages]);

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
      {isLoading && !messages.some(m => m.isPlaceholder) && (
        <LoadingIndicator showAvatar={showAvatars} executionEvents={executionEvents} />
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}

export const MessagesList = memo(MessagesListComponent);
