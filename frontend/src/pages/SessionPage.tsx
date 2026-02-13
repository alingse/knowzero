import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useCallback } from "react";
import { useParams, useLocation } from "react-router-dom";

import { AIAssistant, useAIAssistant, type AIInteractionContext } from "@/components/AIAssistant";
import { DocumentView } from "@/components/DocumentView/DocumentView";
import { Layout, MainContent } from "@/components/Layout/Layout";
import { Sidebar } from "@/components/Sidebar/Sidebar";
import { useWebSocket } from "@/api/websocket";
import { sessionsApi } from "@/api/client";
import { useSessionStore } from "@/stores/sessionStore";
import type { ExecutionEvent } from "@/components/Chat/ExecutionProgress";
import type { DisplayMessage } from "@/components/Chat/MessagesList";
import type { Document, StreamResponse, Message } from "@/types";

export function SessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const location = useLocation();
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

  // Text selection for comment mode
  const [selectedText, setSelectedText] = useState("");
  const [selectionPosition, setSelectionPosition] = useState<{ x: number; y: number } | undefined>();

  // Placeholder message ID for tracking
  const [placeholderId, setPlaceholderId] = useState<number | null>(null);

  const {
    currentDocument,
    messages,
    setCurrentSession,
    setCurrentDocument,
    setMessages,
    addMessage,
    updateMessage,
    setLoading,
    setStreaming,
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

      // Restore last document topic for streaming title (faster UX)
      if (data.current_document?.topic) {
        setStreamingTitle(data.current_document.topic);
      }

      return data;
    },
    enabled: !!sessionId,
  });

  // Helper to add placeholder message
  const addPlaceholder = useCallback((type: 'generating' | 'complete' | 'error', title?: string) => {
    const id = Date.now();
    const placeholderMsg: DisplayMessage = {
      id,
      role: "assistant",
      content: type === 'generating' ? "正在生成学习文档..." : type === 'complete' ? `已为你生成《${title || '学习文档'}》📄` : "生成失败",
      message_type: "placeholder",
      timestamp: new Date().toISOString(),
      isPlaceholder: true,
      placeholderType: type,
      documentTitle: title,
    };
    addMessage(placeholderMsg);
    setPlaceholderId(id);
    return id;
  }, [addMessage]);

  // Helper to update placeholder message
  const updatePlaceholder = useCallback((id: number, type: 'generating' | 'complete' | 'error', title?: string) => {
    const content = type === 'generating' 
      ? "正在生成学习文档..." 
      : type === 'complete' 
        ? `已为你生成《${title || '学习文档'}》📄` 
        : "生成失败";
    
    updateMessage(id, {
      content,
      isPlaceholder: true,
      placeholderType: type,
      documentTitle: title,
    });
    
    if (type === 'complete' || type === 'error') {
      setPlaceholderId(null);
    }
  }, [updateMessage]);

  // Helper to remove placeholder
  const removePlaceholder = useCallback(() => {
    if (placeholderId) {
      setMessages((prev: Message[]) => prev.filter(m => m.id !== placeholderId));
      setPlaceholderId(null);
    }
  }, [placeholderId, setMessages]);

  // Handle WebSocket messages
  const handleWebSocketMessage = (response: StreamResponse) => {
    switch (response.type) {
      case "thinking":
        setLoading(true);
        setExecutionEvents([]);
        setStreamingContent("");
        setStreamingTitle("正在生成文档...");
        addPlaceholder('generating');
        break;

      case "token":
        const tokenContent = response.data?.content as string;
        if (tokenContent) {
          if (!streamingContent) {
            setCurrentDocument(null);
          }
          setStreamingContent((prev) => prev + tokenContent);
        }
        setStreaming(true);
        break;

      case "node_start":
        const nodeName = response.data?.name as string;
        if (nodeName) {
          setExecutionEvents((prev) => [
            ...prev,
            { id: `node-${Date.now()}`, type: "node_start", name: nodeName, timestamp: Date.now() },
          ]);
        }
        break;

      case "node_end":
        const nodeEndName = response.data?.name as string;
        if (nodeEndName) {
          setExecutionEvents((prev) => [
            ...prev,
            { id: `node-end-${Date.now()}`, type: "node_end", name: nodeEndName, timestamp: Date.now() },
          ]);
        }
        break;

      case "tool_start":
        const toolName = response.data?.tool as string;
        if (toolName) {
          setExecutionEvents((prev) => [
            ...prev,
            { id: `tool-${Date.now()}`, type: "tool_start", tool: toolName, data: response.data?.input, timestamp: Date.now() },
          ]);
        }
        break;

      case "tool_end":
        const toolEndName = response.data?.tool as string;
        if (toolEndName) {
          setExecutionEvents((prev) => [
            ...prev,
            { id: `tool-end-${Date.now()}`, type: "tool_end", tool: toolEndName, data: response.data?.output, timestamp: Date.now() },
          ]);
        }
        break;

      case "progress":
        setExecutionEvents((prev) => [
          ...prev,
          { id: `progress-${Date.now()}`, type: "progress", data: response.data, timestamp: Date.now() },
        ]);
        break;

      case "content":
        if (response.data?.content) {
          removePlaceholder();
          const assistantMessage: DisplayMessage = {
            id: Date.now(),
            role: "assistant",
            content: response.data.content as string,
            message_type: "chat",
            timestamp: new Date().toISOString(),
          };
          addMessage(assistantMessage);
        }
        setStreamingContent("");
        setStreamingTitle("");
        break;

      case "document":
        if (response.data) {
          const doc = response.data as unknown as Document;
          setCurrentDocument(doc);
          if (placeholderId) {
            updatePlaceholder(placeholderId, 'complete', doc.topic);
          }
        }
        setStreamingContent("");
        setStreamingTitle("");
        break;

      case "follow_ups":
        console.log("Follow-up questions:", response.data);
        break;

      case "error":
        setLoading(false);
        if (placeholderId) {
          updatePlaceholder(placeholderId, 'error');
        }
        console.error("Agent error:", response.message);
        break;

      case "done":
        setLoading(false);
        setStreaming(false);
        setStreamingContent("");
        setStreamingTitle("");
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
      message_type: context?.type || "chat",
      timestamp: new Date().toISOString(),
    };
    addMessage(userMessage);

    // Send to WebSocket with context
    sendMessage({
      session_id: sessionId,
      message,
      source: (context?.type || "chat") as import("@/types").InputSource,
    });
  };

  // Handle text selection for comment mode
  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      const text = selection.toString().trim();
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      setSelectedText(text);
      setSelectionPosition({
        x: rect.left + rect.width / 2,
        y: rect.bottom,
      });
      setAIContext({ type: "comment", sourceText: text });
    }
  }, [setAIContext]);

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

  // Convert messages to DisplayMessages for display
  const displayMessages: DisplayMessage[] = messages
    .filter((msg) => msg.message_type !== "document")
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
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Document View */}
          {streamingContent && !currentDocument ? (
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
            />
          ) : (
            <DocumentView document={currentDocument || undefined} />
          )}

          {/* Bottom Chat Area - Embedded Mode */}
          <AIAssistant
            mode="chat"
            messages={displayMessages}
            executionEvents={executionEvents}
            isLoading={isAgentLoading}
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
