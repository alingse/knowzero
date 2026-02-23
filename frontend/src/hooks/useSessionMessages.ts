import { useCallback } from "react";

import type { AIInteractionContext } from "@/components/AIAssistant";
import type { DisplayMessage } from "@/components/Chat/MessagesList";
import { useSessionStore } from "@/stores/sessionStore";
import type {
  ChatRequest,
  InputSource,
  MessageTypeValue,
  Roadmap,
  MilestoneGenerateParams,
} from "@/types";
import { GenerationMode, MessageType } from "@/types";

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

      // Pass current_doc_id for follow_up and entity requests
      if ((context?.type === "follow_up" || context?.type === "entity") && currentDocument?.id) {
        requestData.current_doc_id = currentDocument.id;
      }

      sendMessage(requestData);
    },
    [sessionId, isConnected, addMessage, currentDocument?.id, sendMessage]
  );

  const handleFollowUpClick = useCallback(
    (question: { question: string }) => {
      if (!currentDocument?.id) return;
      handleSendMessage(question.question, { type: "follow_up" });
    },
    [handleSendMessage, currentDocument?.id]
  );

  const handleEntityClick = useCallback(
    (entityName: string, sourceDocId: number) => {
      if (!sessionId || !isConnected) return;

      const userMessage: DisplayMessage = {
        id: Date.now(),
        role: "user",
        content: `深度探索：${entityName}`,
        message_type: MessageType.CHAT as MessageTypeValue,
        timestamp: new Date().toISOString(),
      };
      addMessage(userMessage);

      const requestData: ChatRequest = {
        session_id: sessionId,
        message: `深度探索：${entityName}`,
        source: "entity",
        entity_data: {
          entity_name: entityName,
          source_doc_id: sourceDocId,
        },
      };

      sendMessage(requestData);
    },
    [sessionId, isConnected, addMessage, sendMessage]
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

  const handleMilestoneClick = useCallback(
    (params: MilestoneGenerateParams) => {
      if (!sessionId || !isConnected) return;

      const { milestone, sessionTopic, mode, question } = params;

      // Create message based on mode and question
      let message: string;
      if (question) {
        message = `关于「${milestone.title}」: ${question}`;
      } else if (mode === GenerationMode.ADVANCED) {
        message = `进阶学习「${sessionTopic}」的「${milestone.title}」章节`;
      } else {
        message = `学习「${sessionTopic}」的「${milestone.title}」章节`;
      }

      const userMessage: DisplayMessage = {
        id: Date.now(),
        role: "user",
        content: message,
        message_type: MessageType.CHAT as MessageTypeValue,
        timestamp: new Date().toISOString(),
      };
      addMessage(userMessage);

      // Build milestone context for backend
      const requestData: ChatRequest = {
        session_id: sessionId,
        message,
        source: "chat",
        intent_hint: "milestone_learning",
        milestone_context: {
          milestone_id: milestone.id,
          milestone_title: milestone.title,
          document_index: milestone.document_count + 1, // Next document to generate
          existing_documents: milestone.documents.map((d) => ({
            id: d.id,
            topic: d.topic,
          })),
          mode,
        },
      };

      sendMessage(requestData);

      // Switch to document view to see the generated content
      setViewMode("document");
    },
    [sessionId, isConnected, addMessage, sendMessage, setViewMode]
  );

  const handleViewMilestoneDocuments = useCallback(
    (_milestoneId: number) => {
      // Find documents for this milestone and show them
      // This could navigate to a filtered document view
      // For now, we'll just switch to document view
      setViewMode("document");
    },
    [setViewMode]
  );

  return {
    handleSendMessage,
    handleFollowUpClick,
    handleEntityClick,
    handleDocumentClick,
    handleRoadmapUpdate,
    handleMilestoneClick,
    handleViewMilestoneDocuments,
  };
}
