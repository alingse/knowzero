import { useCallback } from "react";

import type { AIInteractionContext } from "@/components/AIAssistant";
import type { DisplayMessage } from "@/components/Chat/MessagesList";
import { useSessionStore } from "@/stores/sessionStore";
import type { ChatRequest, InputSource, MessageTypeValue, Roadmap } from "@/types";
import { MessageType } from "@/types";

interface UseSessionMessagesOptions {
  sessionId: string | undefined;
  isConnected: boolean;
  sendMessage: (request: ChatRequest) => boolean;
  setViewMode: (mode: "document" | "roadmap") => void;
}

export function useSessionMessages({
  sessionId,
  isConnected,
  sendMessage,
  setViewMode,
}: UseSessionMessagesOptions) {
  const {
    currentDocument,
    documents,
    addMessage,
    setCurrentDocument,
    setFollowUpQuestions,
    updateRoadmap,
  } = useSessionStore();

  const handleSendMessage = useCallback(
    (message: string, context?: AIInteractionContext) => {
      if (!sessionId || !isConnected) return;

      const userMessage: DisplayMessage = {
        id: Date.now(),
        role: "user",
        content: message,
        message_type: (context?.type || MessageType.CHAT) as MessageTypeValue,
        timestamp: new Date().toISOString(),
      };
      addMessage(userMessage);

      const requestData: ChatRequest = {
        session_id: sessionId,
        message,
        source: (context?.type || "chat") as InputSource,
      };

      if (context?.type === "comment") {
        requestData.comment_data = {
          comment: message,
          selected_text: context.sourceText || "",
          context_before: context.contextBefore,
          context_after: context.contextAfter,
          document_id: currentDocument?.id || 0,
        };
      }

      sendMessage(requestData);
    },
    [sessionId, isConnected, addMessage, currentDocument?.id, sendMessage]
  );

  const handleFollowUpClick = useCallback(
    (question: { question: string }) => {
      handleSendMessage(question.question, { type: "follow_up" });
    },
    [handleSendMessage]
  );

  const handleEntityClick = useCallback(
    (entityName: string, sourceDocId: number) => {
      if (!sessionId || !isConnected) return;

      const requestData: ChatRequest = {
        session_id: sessionId,
        message: "",
        source: "entity",
        entity_data: {
          entity_name: entityName,
          source_doc_id: sourceDocId,
        },
      };

      sendMessage(requestData);
    },
    [sessionId, isConnected, sendMessage]
  );

  const handleDocumentClick = useCallback(
    (docId: number) => {
      const targetDoc = documents.find((d) => d.id === docId);
      if (targetDoc) {
        setCurrentDocument(targetDoc);
        setViewMode("document");
        setFollowUpQuestions(targetDoc.follow_up_questions || []);
      }
    },
    [documents, setCurrentDocument, setFollowUpQuestions, setViewMode]
  );

  const handleRoadmapUpdate = useCallback(
    (updated: Roadmap) => {
      updateRoadmap(updated);
    },
    [updateRoadmap]
  );

  return {
    handleSendMessage,
    handleFollowUpClick,
    handleEntityClick,
    handleDocumentClick,
    handleRoadmapUpdate,
  };
}
