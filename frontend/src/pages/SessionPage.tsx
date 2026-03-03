import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useParams, useLocation } from "react-router-dom";

import { AIAssistant, MobileChatInput, useAIAssistant } from "@/components/AIAssistant";
import { DocumentView } from "@/components/DocumentView/DocumentView";
import { Layout, MainContent } from "@/components/Layout/Layout";
import { RoadmapBar } from "@/components/RoadmapView";
import { RoadmapView } from "@/components/RoadmapView";
import { Sidebar } from "@/components/Sidebar/Sidebar";
import { MobileNav } from "@/components/MobileNav";
import { Logo } from "@/components/Logo";
import { useWebSocket } from "@/api/websocket";
import { sessionsApi, roadmapsApi } from "@/api/client";
import { useSessionStore } from "@/stores/sessionStore";
import { cn } from "@/lib/utils";
import { usePlaceholderMessages } from "@/hooks/usePlaceholderMessages";
import { useStreamingContent } from "@/hooks/useStreamingContent";
import { useTextSelection } from "@/hooks/useTextSelection";
import { useWebSocketHandler } from "@/hooks/useWebSocketHandler";
import { useNavigation } from "@/hooks/useNavigation";
import { useSessionMessages } from "@/hooks/useSessionMessages";
import type { DisplayMessage } from "@/components/Chat/MessagesList";
import { MessageType } from "@/types";

export function SessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const { handleNewSession } = useNavigation();
  const queryClient = useQueryClient();
  const initialQuery = location.state?.initialQuery as string | undefined;

  const { context: aiContext, setContext: setAIContext } = useAIAssistant("chat");

  // View mode: document | roadmap
  const [viewMode, setViewMode] = useState<"document" | "roadmap">("document");

  const {
    currentDocument,
    messages,
    followUpQuestions,
    agentStatus,
    roadmap,
    roadmapProgress,
    setCurrentSession,
    setCurrentDocument,
    setDocuments,
    setMessages,
    setFollowUpQuestions,
    setAgentStatus,
    setRoadmap,
    setRoadmapProgress,
    clearSession,
  } = useSessionStore();

  // Custom hooks
  const {
    executionEvents,
    setExecutionEvents,
    streamingContent,
    setStreamingContent,
    streamingTitle,
    setStreamingTitle,
    flushTokenBuffer,
    appendTokenBatched,
  } = useStreamingContent();

  const {
    placeholderIdRef,
    addPlaceholder,
    updatePlaceholder,
    removePlaceholder,
    removePlaceholderById,
  } = usePlaceholderMessages();

  const handleWebSocketMessage = useWebSocketHandler({
    sessionId,
    queryClient,
    setStreamingContent,
    setStreamingTitle,
    setExecutionEvents,
    flushTokenBuffer,
    appendTokenBatched,
    placeholderIdRef,
    addPlaceholder,
    updatePlaceholder,
    removePlaceholder,
    removePlaceholderById,
    setViewMode,
  });

  // Clear stale state immediately when sessionId changes
  useEffect(() => {
    clearSession();
  }, [sessionId, clearSession]);

  // Restore session on load
  const { isLoading } = useQuery({
    queryKey: ["session", sessionId, "restore"],
    queryFn: async () => {
      if (!sessionId) return null;
      const data = await sessionsApi.restore(sessionId);
      setCurrentSession(data.session);
      setCurrentDocument(data.current_document || null);
      setMessages(data.messages);
      setDocuments(data.documents || []);

      if (data.agent_status) {
        setAgentStatus(data.agent_status, data.agent_started_at || undefined);
      }

      if (data.current_document?.follow_up_questions) {
        setFollowUpQuestions(data.current_document.follow_up_questions);
      }

      if (data.current_document?.topic) {
        setStreamingTitle(data.current_document.topic);
      }

      if (data.roadmap) {
        setRoadmap(data.roadmap);
        try {
          const progress = await roadmapsApi.getProgress(data.roadmap.id);
          setRoadmapProgress(progress);
        } catch (error) {
          console.error("Failed to load roadmap progress:", error);
        }
      } else {
        setRoadmap(null);
        setRoadmapProgress(null);
      }

      return data;
    },
    enabled: !!sessionId,
  });

  // Separate query for messages to support refreshing
  useQuery({
    queryKey: ["session", sessionId, "messages"],
    queryFn: async () => {
      if (!sessionId) return [];
      const msgs = await sessionsApi.getMessages(sessionId);

      // Smart merge: remove temporary messages that have been persisted to database
      setMessages((current) => {
        // Build set of database message IDs and a lookup for content-based deduplication
        const dbMsgIds = new Set(msgs.map((m) => m.id));
        const dbMsgKeySet = new Set(
          msgs.map((m) => `${m.message_type}:${m.content}:${m.timestamp}`)
        );

        // Keep local-only messages that don't exist in database
        // Filter out temporary messages that have been persisted (matched by content)
        const localOnly = current.filter((m) => {
          // If message has DB ID, check if it's in the database result
          if (dbMsgIds.has(m.id)) {
            return false; // This message exists in DB, don't keep local copy
          }

          // For temporary messages (negative IDs), check if a similar message exists in DB
          // This handles the case where WebSocket added a temporary message that was
          // later persisted to database with a different ID
          if (m.id < 0) {
            const msgKey = `${m.message_type}:${m.content}:${m.timestamp}`;
            return !dbMsgKeySet.has(msgKey);
          }

          // Keep messages that are truly local-only
          return true;
        });

        // Merge: database messages + local-only messages
        return [...msgs, ...localOnly];
      });

      return msgs;
    },
    enabled: !!sessionId,
    staleTime: 0,
  });

  // Setup WebSocket
  const {
    sendMessage,
    isConnected,
    isLoading: isAgentLoading,
    status: connectionStatus,
  } = useWebSocket({
    sessionId: sessionId || "",
    onMessage: handleWebSocketMessage,
  });

  // Session message handlers
  const {
    handleSendMessage,
    handleFollowUpClick,
    handleEntityClick,
    handleDocumentClick,
    handleRoadmapUpdate,
    handleMilestoneClick,
  } = useSessionMessages({
    sessionId,
    isConnected,
    sendMessage,
    setViewMode,
  });

  // Handle document card click - switch to document view and load the document
  const handleDocumentCardClick = (docId: number) => {
    // Switch to document view mode
    setViewMode("document");
    // Set the current document
    // Note: The document should already be in the documents list from session restore
    // If not, we may need to fetch it separately
    const targetDoc = useSessionStore.getState().documents.find((d) => d.id === docId);
    if (targetDoc) {
      setCurrentDocument(targetDoc);
    } else {
      // Fallback: Refresh the page data to get the latest documents
      queryClient.invalidateQueries({ queryKey: ["session", sessionId, "restore"] });
    }
  };

  // Text selection for comment mode
  const { selectedText, setSelectedText, selectionPosition } = useTextSelection({
    documentContent: currentDocument?.content,
    setAIContext,
  });

  // Auto-send initial query if provided from HomePage
  useEffect(() => {
    if (initialQuery && isConnected && !isLoading && sessionId) {
      const storageKey = `initialQuerySent_${sessionId}`;
      const hasSent = sessionStorage.getItem(storageKey);

      if (!hasSent) {
        handleSendMessage(initialQuery);
        sessionStorage.setItem(storageKey, "true");
        window.history.replaceState({}, document.title);
      }
    }
  }, [initialQuery, isConnected, isLoading, sessionId, handleSendMessage]);

  // Convert messages to DisplayMessages for display
  const displayMessages: DisplayMessage[] = messages
    .filter((msg) => msg.message_type !== MessageType.DOCUMENT_REF)
    .map((msg) => msg as DisplayMessage);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <Layout>
      {/* Desktop Sidebar - hidden on mobile */}
      <Sidebar
        onDocumentSelect={() => setViewMode("document")}
        connectionStatus={connectionStatus}
      />

      <MainContent className="md:pt-0">
        {/* Mobile Header - fixed at top on mobile */}
        <header className="fixed left-0 right-0 top-0 z-50 flex h-14 items-center justify-between border-b bg-background px-4 pl-safe-left pr-safe-right md:hidden">
          <button
            onClick={handleNewSession}
            className="flex items-center gap-2 transition-opacity hover:opacity-75"
          >
            <Logo size="sm" />
          </button>
          <MobileNav
            connectionStatus={connectionStatus}
            onDocumentSelect={() => setViewMode("document")}
          />
        </header>
        <div className="flex flex-1 flex-col pt-14 md:pt-0">
          {/* Roadmap Bar */}
          {roadmap && roadmapProgress && (
            <RoadmapBar
              progress={roadmapProgress}
              isExpanded={viewMode === "roadmap"}
              onToggle={(expanded) => setViewMode(expanded ? "roadmap" : "document")}
            />
          )}

          {/* View mode toggle - fallback if no progress data */}
          {roadmap && !roadmapProgress && (
            <div className="flex items-center gap-2 border-b px-4 py-2">
              <button
                type="button"
                onClick={() => setViewMode("document")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  viewMode === "document"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                学习文档
              </button>
              <button
                type="button"
                onClick={() => setViewMode("roadmap")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  viewMode === "roadmap"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                学习路线
              </button>
            </div>
          )}

          {/* Document View */}
          {viewMode === "document" ? (
            streamingContent && !currentDocument ? (
              <DocumentView
                document={{
                  id: 0,
                  session_id: sessionId || "",
                  topic: streamingTitle || "正在生成文档...",
                  content: streamingContent,
                  version: 1,
                  entities: [],
                  prerequisites: [],
                  related: [],
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                }}
                onEntityClick={handleEntityClick}
                onDocumentClick={handleDocumentClick}
                isStreaming={true}
                className="pb-20 md:pb-0"
              />
            ) : (
              <DocumentView
                document={currentDocument || undefined}
                followUpQuestions={followUpQuestions}
                onFollowUpClick={handleFollowUpClick}
                onEntityClick={handleEntityClick}
                onDocumentClick={handleDocumentClick}
                isStreaming={false}
                className="pb-20 md:pb-0"
              />
            )
          ) : (
            <div className="flex-1 overflow-auto p-4">
              {roadmap ? (
                <RoadmapView
                  roadmap={roadmap}
                  progress={roadmapProgress ?? undefined}
                  onUpdate={handleRoadmapUpdate}
                  onGenerateDocument={handleMilestoneClick}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  暂无学习路线图
                </div>
              )}
            </div>
          )}

          {/* Bottom Chat Area - Desktop */}
          <AIAssistant
            mode="chat"
            messages={displayMessages}
            executionEvents={executionEvents}
            isLoading={isAgentLoading}
            disabled={agentStatus === "running"}
            onSendMessage={handleSendMessage}
            onDocumentClick={handleDocumentCardClick}
            className="hidden h-80 border-t md:flex"
          />
        </div>

        {/* Mobile Chat Input - Fixed bottom bar on mobile only */}
        <div className="md:hidden">
          <MobileChatInput
            messages={displayMessages}
            executionEvents={executionEvents}
            isLoading={isAgentLoading}
            disabled={agentStatus === "running"}
            onSend={handleSendMessage}
            onDocumentClick={handleDocumentCardClick}
          />
        </div>
      </MainContent>

      {/* Comment Panel */}
      {selectedText && (
        <AIAssistant
          mode="comment"
          selectedText={selectedText}
          selectionPosition={selectionPosition}
          messages={displayMessages}
          isLoading={isAgentLoading}
          disabled={agentStatus === "running"}
          onSendMessage={(msg) => {
            handleSendMessage(msg, aiContext);
            setSelectedText("");
          }}
          onClose={() => setSelectedText("")}
        />
      )}
    </Layout>
  );
}
