import { Bot, User, Loader2 } from "lucide-react";
import React, { useEffect, useRef, memo } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { Message } from "@/types";
import { MessageType } from "@/types";
import type { ExecutionEvent } from "./ExecutionProgress";
import { CompactExecutionProgress } from "./CompactExecutionProgress";
import { DocumentCardMessage } from "./DocumentCardMessage";

// Re-export Message type as DisplayMessage for component usage
export type DisplayMessage = Message;

interface MessagesListProps {
  messages: DisplayMessage[];
  isLoading?: boolean;
  executionEvents?: ExecutionEvent[];
  className?: string;
  emptyState?: React.ReactNode;
  showAvatars?: boolean;
  onDocumentClick?: (docId: number) => void;
}

interface MessageItemProps {
  message: DisplayMessage;
  executionEvents?: ExecutionEvent[];
  showAvatar?: boolean;
  onDocumentClick?: (docId: number) => void;
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
const LoadingIndicator = memo(function LoadingIndicator({
  showAvatar = true,
  executionEvents = [],
}: LoadingIndicatorProps) {
  return (
    <div className="flex gap-2 py-2 sm:gap-3">
      {showAvatar && (
        <Avatar className="h-7 w-7 shrink-0 bg-muted sm:h-8 sm:w-8">
          <AvatarFallback className="bg-muted">
            <Bot className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </AvatarFallback>
        </Avatar>
      )}
      <div className="max-w-[85%]">
        <div className="flex items-center gap-1 rounded-lg bg-muted px-3 py-2 sm:px-4 sm:py-2.5">
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
  showAvatar = true,
}: PlaceholderMessageProps) {
  return (
    <div className="flex gap-2 py-2 sm:gap-3">
      {showAvatar && (
        <Avatar className="h-7 w-7 shrink-0 bg-muted sm:h-8 sm:w-8">
          <AvatarFallback className="bg-muted">
            <Bot className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </AvatarFallback>
        </Avatar>
      )}
      <div className="max-w-[85%]">
        <div className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground sm:px-4 sm:py-2.5 sm:text-sm">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin sm:h-3.5 sm:w-3.5" />
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
const MessageItem = memo(function MessageItem({
  message,
  executionEvents = [],
  showAvatar = true,
  onDocumentClick,
}: MessageItemProps) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  // Hidden internal document tracking messages
  if (message.message_type === MessageType.DOCUMENT_REF) {
    return null;
  }

  // Placeholder messages (transient UI state) - must be checked BEFORE DOCUMENT_CARD
  // because placeholders use DOCUMENT_CARD type but have isPlaceholder flag
  if (message.isPlaceholder) {
    return (
      <PlaceholderMessage
        content={message.content}
        executionEvents={executionEvents}
        showAvatar={showAvatar}
      />
    );
  }

  // Document card messages with rich extra_data (from backend WebSocket event)
  if (message.message_type === MessageType.DOCUMENT_CARD && message.extra_data) {
    const extra_data = message.extra_data as {
      document_id?: number;
      title?: string;
      excerpt?: string;
      processing_time_seconds?: number;
      stages_completed?: string[];
    };

    if (extra_data.document_id) {
      return (
        <DocumentCardMessage
          documentId={extra_data.document_id}
          title={extra_data.title || message.content}
          excerpt={extra_data.excerpt}
          processingTimeSeconds={extra_data.processing_time_seconds}
          stagesCompleted={extra_data.stages_completed}
          timestamp={message.timestamp}
          onDocumentClick={onDocumentClick}
        />
      );
    }
  }

  // Fallback for simple DOCUMENT_CARD without extra_data (should not happen with new flow)
  if (message.message_type === MessageType.DOCUMENT_CARD) {
    return (
      <div className="flex gap-2 py-2 sm:gap-3">
        {showAvatar && (
          <Avatar className="h-7 w-7 shrink-0 bg-muted sm:h-8 sm:w-8">
            <AvatarFallback>
              <Bot className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </AvatarFallback>
          </Avatar>
        )}
        <div className="max-w-[85%] rounded-lg bg-muted px-3 py-2 text-xs sm:px-4 sm:py-2.5 sm:text-sm">
          {message.content}
        </div>
      </div>
    );
  }

  // System messages (like "Session started")
  if (isSystem) {
    return (
      <div className="flex justify-center py-1">
        <span className="text-[10px] text-muted-foreground sm:text-xs">{message.content}</span>
      </div>
    );
  }

  // Regular messages
  return (
    <div className={cn("flex gap-2 py-2 sm:gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      {showAvatar && (
        <Avatar
          className={cn("h-7 w-7 shrink-0 sm:h-8 sm:w-8", isUser ? "bg-primary" : "bg-muted")}
        >
          <AvatarFallback className={cn(isUser ? "bg-primary" : "bg-muted")}>
            {isUser ? (
              <User className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            ) : (
              <Bot className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            )}
          </AvatarFallback>
        </Avatar>
      )}

      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-xs sm:px-4 sm:py-2.5 sm:text-sm",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
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
  onDocumentClick,
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
          onDocumentClick={onDocumentClick}
        />
      ))}

      {/* Loading indicator - only show when loading and no placeholder message */}
      {isLoading && !messages.some((m) => m.isPlaceholder) && (
        <LoadingIndicator showAvatar={showAvatars} executionEvents={executionEvents} />
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}

export const MessagesList = memo(MessagesListComponent);
