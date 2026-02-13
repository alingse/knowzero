/**
 * AIAssistant - Unified AI interaction component
 * 
 * This component manages different AI interaction modes:
 * - chat: Bottom chat area for general conversation
 * - dialog: Floating dialog for focused AI interaction
 * - comment: Inline comment/annotation on document
 * - entity: Entity click to explore
 * 
 * Usage:
 * - <AIAssistant mode="chat" /> - Always visible bottom chat
 * - <AIAssistant mode="dialog" /> - Floating dialog triggered by crystal ball
 * - <AIAssistant mode="comment" initialData={selection} /> - Annotation mode
 */

import { useEffect, useState } from "react";

import { FloatingAIButton } from "../Chat/FloatingAIButton";
import type { DisplayMessage } from "../Chat/MessagesList";
import type { ExecutionEvent } from "../Chat/ExecutionProgress";
import { ChatPanel } from "./ChatPanel";
import { CommentPanel } from "./CommentPanel";

export type AIAssistantMode = "chat" | "dialog" | "comment" | "entity";

interface AIAssistantProps {
  // Current interaction mode
  mode: AIAssistantMode;
  
  // Common props
  messages: DisplayMessage[];
  executionEvents?: ExecutionEvent[];
  isLoading?: boolean;
  onSendMessage: (message: string, context?: AIInteractionContext) => void;
  
  // Mode-specific props
  isOpen?: boolean;           // For dialog mode
  onClose?: () => void;       // For dialog/comment/entity mode
  
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
  sourceText?: string;        // For comment: selected text
  entityName?: string;        // For entity click
  entityType?: string;
  documentId?: number;
  position?: { start: number; end: number };  // Text position in document
  parentMessageId?: number;   // For threaded replies
}

export function AIAssistant({
  mode,
  messages,
  executionEvents = [],
  isLoading = false,
  onSendMessage,
  isOpen = false,
  onClose,
  context,
  selectedText,
  selectionPosition,
  className,
}: AIAssistantProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  
  // For dialog mode: use internal state if not controlled externally
  const dialogOpen = mode === "dialog" && (isOpen !== undefined ? isOpen : internalOpen);
  
  // Auto-open comment panel when there's selected text
  useEffect(() => {
    if (mode === "comment" && selectedText) {
      setInternalOpen(true);
    }
  }, [mode, selectedText]);

  const handleToggle = () => {
    if (mode === "dialog") {
      if (isOpen !== undefined && onClose) {
        // Controlled mode
        if (isOpen) {
          onClose();
        }
      } else {
        // Uncontrolled mode
        setInternalOpen(!internalOpen);
      }
    }
  };

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
          onSend={handleSend}
          className={className}
        />
      );

    case "dialog":
      return (
        <>
          <FloatingAIButton
            isOpen={dialogOpen}
            onToggle={handleToggle}
            variant="white"
          />
          <ChatPanel
            variant="dialog"
            isOpen={dialogOpen}
            onClose={onClose || (() => setInternalOpen(false))}
            messages={messages}
            executionEvents={executionEvents}
            isLoading={isLoading}
            onSend={handleSend}
            className={className}
          />
        </>
      );

    case "comment":
      if (!internalOpen || !selectedText) return null;
      return (
        <CommentPanel
          selectedText={selectedText}
          position={selectionPosition}
          messages={messages.filter(m => m.message_type === "comment")}
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
  const [isOpen, setIsOpen] = useState(false);
  const [context, setContext] = useState<AIInteractionContext | undefined>();

  const openDialog = () => {
    setMode("dialog");
    setIsOpen(true);
  };

  const closeDialog = () => {
    setIsOpen(false);
  };

  const openComment = (selectedText: string, _position?: { x: number; y: number }) => {
    setMode("comment");
    setContext({
      type: "comment",
      sourceText: selectedText,
    });
    setIsOpen(true);
  };

  const closeComment = () => {
    setIsOpen(false);
    setContext(undefined);
  };

  const switchToChat = () => {
    setMode("chat");
    setIsOpen(false);
    setContext(undefined);
  };

  return {
    mode,
    isOpen,
    context,
    openDialog,
    closeDialog,
    openComment,
    closeComment,
    switchToChat,
    setContext,
  };
}
