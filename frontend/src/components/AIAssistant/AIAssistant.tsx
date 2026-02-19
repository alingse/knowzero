/**
 * AIAssistant - Unified AI interaction component
 *
 * This component manages different AI interaction modes:
 * - chat: Bottom chat area for general conversation
 * - comment: Inline comment/annotation on document
 * - entity: Entity click to explore
 *
 * Usage:
 * - <AIAssistant mode="chat" /> - Always visible bottom chat
 * - <AIAssistant mode="comment" initialData={selection} /> - Annotation mode
 */

import { useEffect, useState } from "react";

import type { DisplayMessage } from "../Chat/MessagesList";
import type { ExecutionEvent } from "../Chat/ExecutionProgress";
import { ChatPanel } from "./ChatPanel";
import { CommentPanel } from "./CommentPanel";

export type AIAssistantMode = "chat" | "comment" | "entity";

interface AIAssistantProps {
  // Current interaction mode
  mode: AIAssistantMode;

  // Common props
  messages: DisplayMessage[];
  executionEvents?: ExecutionEvent[];
  isLoading?: boolean;
  disabled?: boolean; // External disabled state (e.g., from agent status)
  onSendMessage: (message: string, context?: AIInteractionContext) => void;

  // Mode-specific props
  onClose?: () => void; // For comment/entity mode

  // Context data for specific interactions
  context?: AIInteractionContext;

  // For comment mode - selected text
  selectedText?: string;
  selectionPosition?: { x: number; y: number };

  className?: string;
}

// Context passed with each interaction
export interface AIInteractionContext {
  type: "chat" | "comment" | "entity" | "follow_up" | "context_menu";
  sourceText?: string; // For comment: selected text
  contextBefore?: string; // For comment: text before selection
  contextAfter?: string; // For comment: text after selection
  entityName?: string; // For entity click
  entityType?: string;
  documentId?: number;
  position?: { start: number; end: number }; // Text position in document
  parentMessageId?: number; // For threaded replies
}

export function AIAssistant({
  mode,
  messages,
  executionEvents = [],
  isLoading = false,
  disabled = false,
  onSendMessage,
  onClose,
  context,
  selectedText,
  selectionPosition,
  className,
}: AIAssistantProps) {
  const [internalOpen, setInternalOpen] = useState(false);

  // Auto-open comment panel when there's selected text
  useEffect(() => {
    if (mode === "comment" && selectedText) {
      setInternalOpen(true);
    }
  }, [mode, selectedText]);

  const handleSend = (message: string) => {
    onSendMessage(message, context);

    // Auto-close comment panel after sending
    if (mode === "comment") {
      setInternalOpen(false);
      onClose?.();
    }
  };

  // Render based on mode
  switch (mode) {
    case "chat":
      return (
        <ChatPanel
          messages={messages}
          executionEvents={executionEvents}
          isLoading={isLoading}
          disabled={disabled}
          onSend={handleSend}
          className={className}
        />
      );

    case "comment":
      if (!internalOpen || !selectedText) return null;
      return (
        <CommentPanel
          selectedText={selectedText}
          position={selectionPosition}
          messages={messages.filter((m) => m.message_type === "comment")}
          isLoading={isLoading}
          onSend={handleSend}
          onClose={() => {
            setInternalOpen(false);
            onClose?.();
          }}
        />
      );

    case "entity":
      // Future: Entity exploration panel
      return null;

    default:
      return null;
  }
}

// Hook to manage AIAssistant state
export function useAIAssistant(defaultMode: AIAssistantMode = "chat") {
  const [mode, setMode] = useState<AIAssistantMode>(defaultMode);
  const [context, setContext] = useState<AIInteractionContext | undefined>();

  const openComment = (selectedText: string, _position?: { x: number; y: number }) => {
    setMode("comment");
    setContext({
      type: "comment",
      sourceText: selectedText,
    });
  };

  const closeComment = () => {
    setContext(undefined);
  };

  const switchToChat = () => {
    setMode("chat");
    setContext(undefined);
  };

  return {
    mode,
    context,
    openComment,
    closeComment,
    switchToChat,
    setContext,
  };
}
