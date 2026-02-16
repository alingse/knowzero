import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useLocation } from "react-router-dom";

import { AIAssistant, useAIAssistant, type AIInteractionContext } from "@/components/AIAssistant";
import { DocumentView } from "@/components/DocumentView/DocumentView";
import { Layout, MainContent } from "@/components/Layout/Layout";
import { RoadmapView } from "@/components/RoadmapView";
import { Sidebar } from "@/components/Sidebar/Sidebar";
import { useWebSocket } from "@/api/websocket";
import { sessionsApi } from "@/api/client";
import { useSessionStore } from "@/stores/sessionStore";
import { cn } from "@/lib/utils";
import type { ExecutionEvent } from "@/components/Chat/ExecutionProgress";
import type { DisplayMessage } from "@/components/Chat/MessagesList";
import type { Document, FollowUpQuestion, StreamResponse, Message } from "@/types";
import { MessageType } from "@/types";

export function SessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const queryClient = useQueryClient();
  const initialQuery = location.state?.initialQuery as string | undefined;

  // AI Assistant state management
  const {
    isOpen: aiDialogOpen,
    context: aiContext,
    closeDialog,
    setContext: setAIContext,
  } = useAIAssistant("chat");

  // Track execution events for progress display
  const [executionEvents, setExecutionEvents] = useState<ExecutionEvent[]>([]);
  // Track streaming content for real-time document preview
  const [streamingContent, setStreamingContent] = useState("");
  // Track streaming document title for preview
  const [streamingTitle, setStreamingTitle] = useState("");
  // Buffer for batching tokens to reduce render frequency
  const tokenBufferRef = useRef<string>("");
  const tokenBatchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Text selection for comment mode
  const [selectedText, setSelectedText] = useState("");
  const [selectionPosition, setSelectionPosition] = useState<{ x: number; y: number } | undefined>();

  // View mode: document | roadmap
  const [viewMode, setViewMode] = useState<"document" | "roadmap">("document");

  // Placeholder message ID for tracking via ref (avoids setState-in-setState warning)
  const placeholderIdRef = useRef<number | null>(null);

  const {
    currentDocument,
    messages,
    followUpQuestions,
    agentStatus,
    documents,
    addDocument,
    setCurrentSession,
    setCurrentDocument,
    setDocuments,
    setMessages,
    addMessage,
    updateMessage,
    setLoading,
    setStreaming,
    setFollowUpQuestions,
    updateDocumentEntities,
    setAgentStatus,
    setRoadmap,
    roadmap,
    updateRoadmap,
  } = useSessionStore();

  // Restore session on load
  const { isLoading } = useQuery({
    queryKey: ["session", sessionId, "restore"],
    queryFn: async () => {
      if (!sessionId) return null;
      const data = await sessionsApi.restore(sessionId);
      setCurrentSession(data.session);
      setCurrentDocument(data.current_document || null);
      setMessages(data.messages);
      setDocuments(data.documents || []); // Fix: set documents list from backend

      // Restore agent status from backend
      if (data.agent_status) {
        setAgentStatus(data.agent_status, data.agent_started_at || undefined);
      }

      // Restore follow-up questions from current document
      if (data.current_document?.follow_up_questions) {
        setFollowUpQuestions(data.current_document.follow_up_questions);
      }

      // Restore last document topic for streaming title (faster UX)
      if (data.current_document?.topic) {
        setStreamingTitle(data.current_document.topic);
      }

      // Restore roadmap if available
      if (data.roadmap) {
        setRoadmap(data.roadmap);
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
      const messages = await sessionsApi.getMessages(sessionId);
      setMessages(messages);
      return messages;
    },
    enabled: !!sessionId,
    staleTime: 0, // Always fetch fresh data when invalidated
  });

  // Helper to add placeholder message
  const addPlaceholder = useCallback((content: string) => {
    const id = -Date.now();
    const placeholderMsg: DisplayMessage = {
      id,
      role: "assistant",
      content,
      message_type: MessageType.DOCUMENT_CARD,
      timestamp: new Date().toISOString(),
      isPlaceholder: true,
    };
    addMessage(placeholderMsg);
    placeholderIdRef.current = id;
    return id;
  }, [addMessage]);

  // Helper to update placeholder message
  const updatePlaceholder = useCallback((id: number, content: string) => {
    updateMessage(id, { content });
  }, [updateMessage]);

  // Helper to remove placeholder
  const removePlaceholder = useCallback(() => {
    const id = placeholderIdRef.current;
    if (id) {
      setMessages((prev: Message[]) => prev.filter(m => m.id !== id));
    }
    placeholderIdRef.current = null;
  }, [setMessages]);

  // Handle WebSocket messages
  const handleWebSocketMessage = (response: StreamResponse) => {
    switch (response.type) {
      case "thinking":
        setLoading(true);
        setExecutionEvents([]);
        setStreamingContent("");
        setStreamingTitle("正在生成文档...");
        setFollowUpQuestions([]);
        // Save placeholder id synchronously for immediate use
        addPlaceholder("...");
        break;

      case "token": {
        const tokenContent = response.data?.content as string;
        if (tokenContent) {
          if (!streamingContent) {
            setCurrentDocument(null);
          }
          setStreamingContent((prev) => prev + tokenContent);
        }
        setStreaming(true);
        break;
      }

      case "document_start": {
        const docTopic = response.data?.topic as string;
        if (docTopic) {
          setStreamingTitle(docTopic);
          setCurrentDocument(null);
          // Update placeholder to show document generation
          if (placeholderIdRef.current) {
            updatePlaceholder(placeholderIdRef.current, `正在生成《${docTopic}》...`);
          }
        }
        break;
      }

      case "node_start": {
        const nodeName = response.data?.name as string;
        console.log("node_start event:", nodeName, response.data);
        if (nodeName) {
          setExecutionEvents((prev) => [
            ...prev,
            { id: `node-${Date.now()}`, type: "node_start", name: nodeName, timestamp: Date.now() },
          ]);
          // Update placeholder based on node name
          if (placeholderIdRef.current) {
            const displayNameMap: Record<string, string> = {
              input_normalizer: "正在理解输入...",
              intent_agent: "正在分析意图...",
              route_agent: "正在规划处理...",
              content_agent: "正在生成内容...",
              post_process: "正在提取关键概念和生成追问...",
              planner_agent: "正在规划学习路径...",
              navigator_agent: "正在跳转文档...",
              chitchat_agent: "正在回复...",
              LLM: "AI 正在生成中...",
            };
            const displayName = displayNameMap[nodeName] || `正在执行 ${nodeName}...`;
            updatePlaceholder(placeholderIdRef.current, displayName);
          }
        }
        break;
      }

      case "node_end": {
        const nodeEndName = response.data?.name as string;
        if (nodeEndName) {
          setExecutionEvents((prev) => [
            ...prev,
            { id: `node-end-${Date.now()}`, type: "node_end", name: nodeEndName, timestamp: Date.now() },
          ]);
        }
        break;
      }

      case "tool_start": {
        const toolName = response.data?.tool as string;
        if (toolName) {
          setExecutionEvents((prev) => [
            ...prev,
            { id: `tool-${Date.now()}`, type: "tool_start", tool: toolName, data: response.data?.input, timestamp: Date.now() },
          ]);
        }
        break;
      }

      case "tool_end": {
        const toolEndName = response.data?.tool as string;
        if (toolEndName) {
          setExecutionEvents((prev) => [
            ...prev,
            { id: `tool-end-${Date.now()}`, type: "tool_end", tool: toolEndName, data: response.data?.output, timestamp: Date.now() },
          ]);
        }
        break;
      }

      case "progress":
        setExecutionEvents((prev) => [
          ...prev,
          { id: `progress-${Date.now()}`, type: "progress", data: response.data, timestamp: Date.now() },
        ]);
        // Update placeholder with progress message for background task status
        if (response.data?.message && placeholderIdRef.current) {
          updatePlaceholder(placeholderIdRef.current, response.data.message as string);
        }
        break;

      case "content":
        if (response.data?.content) {
          removePlaceholder();
          const assistantMessage: DisplayMessage = {
            id: Date.now(),
            role: "assistant",
            content: response.data.content as string,
            message_type: MessageType.CHAT,
            timestamp: new Date().toISOString(),
          };
          addMessage(assistantMessage);
        }
        setStreamingContent("");
        setStreamingTitle("");
        break;

      case "document_token": {
        const docTokenContent = response.data?.content as string;
        if (docTokenContent) {
          // Batch tokens to reduce render frequency (every 100ms)
          tokenBufferRef.current += docTokenContent;

          // Flush immediately if buffer gets large
          const shouldFlushNow = tokenBufferRef.current.length > 100;

          if (!tokenBatchTimeoutRef.current || shouldFlushNow) {
            if (tokenBatchTimeoutRef.current) {
              clearTimeout(tokenBatchTimeoutRef.current);
            }

            if (shouldFlushNow) {
              // Immediate flush for large buffers
              setStreamingContent((prev) => prev + tokenBufferRef.current);
              tokenBufferRef.current = "";
              tokenBatchTimeoutRef.current = null;
            } else {
              // Debounced update for small buffers
              tokenBatchTimeoutRef.current = setTimeout(() => {
                setStreamingContent((prev) => prev + tokenBufferRef.current);
                tokenBufferRef.current = "";
                tokenBatchTimeoutRef.current = null;
              }, 100);
            }
          }
        }
        setStreaming(true);
        break;
      }

      case "document":
        // Flush any remaining buffered tokens
        if (tokenBufferRef.current) {
          setStreamingContent((prev) => prev + tokenBufferRef.current);
          tokenBufferRef.current = "";
        }
        if (tokenBatchTimeoutRef.current) {
          clearTimeout(tokenBatchTimeoutRef.current);
          tokenBatchTimeoutRef.current = null;
        }
        if (response.data) {
          const doc = response.data as unknown as Document;
          setCurrentDocument(doc);
          addDocument(doc); // Fix: add document to store list

          // Update placeholder - post_process node_start will update it further
          if (placeholderIdRef.current) {
            updatePlaceholder(placeholderIdRef.current, `已生成《${doc.topic}》`);
          }
        }
        setStreamingContent("");
        break;

      case "entities": {
        const entitiesData = response.data as { document_id?: number; entities?: string[] } | undefined;
        // Use fresh store state to avoid stale closure
        const currentDoc = useSessionStore.getState().currentDocument;
        const shouldUpdateEntities = entitiesData?.entities && (
          !entitiesData.document_id ||  // No document ID specified, allow update
          !currentDoc ||       // No current document, allow update (new doc)
          entitiesData.document_id === currentDoc?.id  // ID matches current document
        );
        if (shouldUpdateEntities) {
          updateDocumentEntities(entitiesData.entities!);
        }
        break;
      }

      case "follow_ups": {
        const fuData = response.data as { document_id?: number; questions?: FollowUpQuestion[] } | undefined;
        // Use fresh store state to avoid stale closure
        const currentDocForFU = useSessionStore.getState().currentDocument;
        const shouldUpdateFU = fuData?.questions && (
          !fuData.document_id ||  // No document ID specified, allow update
          !currentDocForFU ||       // No current document, allow update (new doc)
          fuData.document_id === currentDocForFU?.id  // ID matches current document
        );
        console.log("[follow_ups] Received:", {
          hasData: !!fuData,
          hasQuestions: !!fuData?.questions,
          questionsCount: fuData?.questions?.length,
          documentId: fuData?.document_id,
          currentDocId: currentDocForFU?.id,
          shouldUpdate: shouldUpdateFU,
        });
        if (shouldUpdateFU && fuData.questions) {
          const mapped = fuData.questions.map((q, i) => ({
            ...q,
            id: q.id ?? i,
            is_clicked: q.is_clicked ?? false,
          }));
          console.log("[follow_ups] Setting follow-up questions:", mapped.length);
          setFollowUpQuestions(mapped);
        }
        break;
      }

      case "roadmap": {
        if (response.data) {
          setRoadmap(response.data as import("@/types").Roadmap);
          // Remove placeholder when roadmap is received
          removePlaceholder();
        }
        break;
      }

      case "error":
        setLoading(false);
        if (placeholderIdRef.current) {
          updatePlaceholder(placeholderIdRef.current, "抱歉，出现了问题，请重试。");
        }
        placeholderIdRef.current = null;
        console.error("Agent error:", response.message);
        break;

      case "done":
        // Flush any remaining buffered tokens
        if (tokenBufferRef.current) {
          setStreamingContent((prev) => prev + tokenBufferRef.current);
          tokenBufferRef.current = "";
        }
        if (tokenBatchTimeoutRef.current) {
          clearTimeout(tokenBatchTimeoutRef.current);
          tokenBatchTimeoutRef.current = null;
        }
        setLoading(false);
        setStreaming(false);
        setStreamingContent("");
        setStreamingTitle("");
        // Clear placeholder ref (message stays until query refresh replaces it)
        placeholderIdRef.current = null;
        // Refresh messages from server to get persisted messages
        if (sessionId) {
          queryClient.invalidateQueries({ queryKey: ["session", sessionId, "messages"] });
        }
        break;
    }
  };

  // Setup WebSocket
  const { sendMessage, isConnected, isLoading: isAgentLoading } = useWebSocket({
    sessionId: sessionId || "",
    onMessage: handleWebSocketMessage,
  });

  // Unified message handler
  const handleSendMessage = (message: string, context?: AIInteractionContext) => {
    if (!sessionId || !isConnected) return;

    // Add user message to UI
    const userMessage: DisplayMessage = {
      id: Date.now(),
      role: "user",
      content: message,
      message_type: (context?.type || MessageType.CHAT) as import("@/types").MessageTypeValue,
      timestamp: new Date().toISOString(),
    };
    addMessage(userMessage);

    // Build request data with context
    const requestData: import("@/types").ChatRequest = {
      session_id: sessionId,
      message,
      source: (context?.type || "chat") as import("@/types").InputSource,
    };

    // Add comment data with context if applicable
    if (context?.type === "comment") {
      requestData.comment_data = {
        comment: message,
        selected_text: context.sourceText || "",
        context_before: context.contextBefore,
        context_after: context.contextAfter,
        document_id: currentDocument?.id || 0,
      };
    }

    // Send to WebSocket
    sendMessage(requestData);
  };

  // Handle follow-up question click
  const handleFollowUpClick = useCallback((question: FollowUpQuestion) => {
    handleSendMessage(question.question, { type: "follow_up" });
  }, [handleSendMessage]);

  // Handle entity click for deep exploration
  const handleEntityClick = useCallback((entityName: string, sourceDocId: number) => {
    if (!sessionId || !isConnected) return;

    // Send entity exploration request through WebSocket
    const requestData: import("@/types").ChatRequest = {
      session_id: sessionId,
      message: "",
      source: "entity",
      entity_data: {
        entity_name: entityName,
        source_doc_id: sourceDocId,
      },
    };

    sendMessage(requestData);
  }, [sessionId, isConnected, sendMessage]);

  // Handle document click from entity card
  const handleDocumentClick = useCallback((docId: number) => {
    // Find the document in the store and navigate to it
    const targetDoc = documents.find(d => d.id === docId);
    if (targetDoc) {
      setCurrentDocument(targetDoc);
      // Update follow-up questions from the selected document
      setFollowUpQuestions((targetDoc as Document & { follow_up_questions?: FollowUpQuestion[] }).follow_up_questions || []);
    }
  }, [documents, setCurrentDocument, setFollowUpQuestions]);

  // Handle roadmap update
  const handleRoadmapUpdate = useCallback((updated: import("@/types").Roadmap) => {
    updateRoadmap(updated);
  }, [updateRoadmap]);

  // Handle text selection for comment mode
  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      const text = selection.toString().trim();
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      // Extract context around the selected text
      // Get the full document content
      const fullContent = currentDocument?.content || "";

      // Find the selected text position in the document
      const selectedIndex = fullContent.indexOf(text);
      let contextBefore = "";
      let contextAfter = "";

      if (selectedIndex >= 0) {
        // Get 200 characters before and after for context
        const contextLength = 200;
        const beforeStart = Math.max(0, selectedIndex - contextLength);
        const afterEnd = Math.min(fullContent.length, selectedIndex + text.length + contextLength);

        contextBefore = fullContent.slice(beforeStart, selectedIndex);
        contextAfter = fullContent.slice(selectedIndex + text.length, afterEnd);
      }

      setSelectedText(text);
      // Position near the start of selection (left side) for better UX
      // Add small offsets to position the panel just below and to the right of the selection start
      setSelectionPosition({
        x: rect.left + 20, // Slightly offset from the left edge of selection
        y: rect.bottom + 8, // Just below the selection with small gap
      });
      // Include context in the AI context
      setAIContext({
        type: "comment",
        sourceText: text,
        contextBefore,
        contextAfter,
      });
    }
  }, [setAIContext, currentDocument?.content]);

  // Listen for text selection
  useEffect(() => {
    const handleMouseUp = () => {
      // Small delay to let selection complete
      setTimeout(handleTextSelection, 10);
    };

    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, [handleTextSelection]);

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
  }, [initialQuery, isConnected, isLoading, sessionId]);

  // Debug: log followUpQuestions changes
  useEffect(() => {
    console.log("[SessionPage] followUpQuestions changed:", followUpQuestions?.length, "questions");
  }, [followUpQuestions]);

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
      <Sidebar />
      <MainContent>
        <div className="flex flex-1 flex-col">
          {/* View mode toggle */}
          {roadmap && (
            <div className="flex items-center gap-2 border-b px-4 py-2">
              <button
                type="button"
                onClick={() => setViewMode("document")}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
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
                  "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
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
              />
            ) : (
              <DocumentView
                document={currentDocument || undefined}
                followUpQuestions={followUpQuestions}
                onFollowUpClick={handleFollowUpClick}
                onEntityClick={handleEntityClick}
                onDocumentClick={handleDocumentClick}
                isStreaming={false}
              />
            )
          ) : (
            /* Roadmap View */
            <div className="flex-1 overflow-auto p-4">
              {roadmap ? (
                <RoadmapView roadmap={roadmap} onUpdate={handleRoadmapUpdate} />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  暂无学习路线图
                </div>
              )}
            </div>
          )}

          {/* Bottom Chat Area - Embedded Mode */}
          <AIAssistant
            mode="chat"
            messages={displayMessages}
            executionEvents={executionEvents}
            isLoading={isAgentLoading}
            disabled={agentStatus === "running"}
            onSendMessage={handleSendMessage}
            className="h-80 border-t"
          />
        </div>
      </MainContent>

      {/* Floating AI Dialog - for focused interaction */}
      {currentDocument && (
        <AIAssistant
          mode="dialog"
          isOpen={aiDialogOpen}
          onClose={closeDialog}
          messages={displayMessages}
          executionEvents={executionEvents}
          isLoading={isAgentLoading}
          disabled={agentStatus === "running"}
          onSendMessage={handleSendMessage}
        />
      )}

      {/* Comment Panel - appears when text is selected */}
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
            setSelectedText(""); // Close after sending
          }}
          onClose={() => setSelectedText("")}
        />
      )}
    </Layout>
  );
}
