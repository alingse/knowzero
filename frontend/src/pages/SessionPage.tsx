import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "react-router-dom";

import { ChatArea } from "@/components/Chat/ChatArea";
import { DocumentView } from "@/components/DocumentView/DocumentView";
import { Layout, MainContent } from "@/components/Layout/Layout";
import { Sidebar } from "@/components/Sidebar/Sidebar";
import { FloatingAIButton } from "@/components/Chat/FloatingAIButton";
import { AIDialog } from "@/components/Chat/AIDialog";
import { useWebSocket } from "@/api/websocket";
import { sessionsApi } from "@/api/client";
import { useSessionStore } from "@/stores/sessionStore";
import type { ExecutionEvent } from "@/components/Chat/ExecutionProgress";
import type { Document, Message, StreamResponse } from "@/types";

export function SessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const initialQuery = location.state?.initialQuery as string | undefined;
  const initialQuerySent = useRef(false);

  // Track execution events for progress display
  const [executionEvents, setExecutionEvents] = useState<ExecutionEvent[]>([]);

  // AI Dialog state
  const [isAIDialogOpen, setIsAIDialogOpen] = useState(false);

  const {
    currentDocument,
    messages,
    setCurrentSession,
    setCurrentDocument,
    setMessages,
    addMessage,
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
      return data;
    },
    enabled: !!sessionId,
  });

  // Handle WebSocket messages
  const handleWebSocketMessage = (response: StreamResponse) => {
    switch (response.type) {
      case "thinking":
        setLoading(true);
        // Clear previous execution events on new request
        setExecutionEvents([]);
        break;

      case "token":
        // Stream LLM token to existing assistant message
        setStreaming(true);
        break;

      case "node_start":
        // Node execution started
        const nodeName = response.data?.name as string;
        if (nodeName) {
          setExecutionEvents((prev) => [
            ...prev,
            {
              id: `node-${Date.now()}`,
              type: "node_start",
              name: nodeName,
              timestamp: Date.now(),
            },
          ]);
        }
        break;

      case "node_end":
        // Node execution ended
        const nodeEndName = response.data?.name as string;
        if (nodeEndName) {
          setExecutionEvents((prev) => [
            ...prev,
            {
              id: `node-end-${Date.now()}`,
              type: "node_end",
              name: nodeEndName,
              timestamp: Date.now(),
            },
          ]);
        }
        break;

      case "tool_start":
        // Tool execution started
        const toolName = response.data?.tool as string;
        if (toolName) {
          setExecutionEvents((prev) => [
            ...prev,
            {
              id: `tool-${Date.now()}`,
              type: "tool_start",
              tool: toolName,
              data: response.data?.input,
              timestamp: Date.now(),
            },
          ]);
        }
        break;

      case "tool_end":
        // Tool execution ended
        const toolEndName = response.data?.tool as string;
        if (toolEndName) {
          setExecutionEvents((prev) => [
            ...prev,
            {
              id: `tool-end-${Date.now()}`,
              type: "tool_end",
              tool: toolEndName,
              data: response.data?.output,
              timestamp: Date.now(),
            },
          ]);
        }
        break;

      case "progress":
        // Custom progress update
        setExecutionEvents((prev) => [
          ...prev,
          {
            id: `progress-${Date.now()}`,
            type: "progress",
            data: response.data,
            timestamp: Date.now(),
          },
        ]);
        break;

      case "content":
        if (response.data?.content) {
          const assistantMessage: Message = {
            id: Date.now(),
            role: "assistant",
            content: response.data.content as string,
            message_type: "chat",
            timestamp: new Date().toISOString(),
          };
          addMessage(assistantMessage);
        }
        break;

      case "document":
        if (response.data) {
          setCurrentDocument(response.data as unknown as Document);
        }
        break;

      case "follow_ups":
        // Handle follow-up questions
        console.log("Follow-up questions:", response.data);
        break;

      case "error":
        setLoading(false);
        console.error("Agent error:", response.message);
        break;

      case "done":
        setLoading(false);
        setStreaming(false);
        break;
    }
  };

  // Setup WebSocket
  const { sendMessage, isConnected, isLoading: isAgentLoading } = useWebSocket({
    sessionId: sessionId || "",
    onMessage: handleWebSocketMessage,
  });

  const handleSendMessage = (message: string) => {
    if (!sessionId || !isConnected) return;

    // Add user message to UI
    const userMessage: Message = {
      id: Date.now(),
      role: "user",
      content: message,
      message_type: "chat",
      timestamp: new Date().toISOString(),
    };
    addMessage(userMessage);

    // Send to WebSocket
    sendMessage({
      session_id: sessionId,
      message,
      source: "chat",
    });
  };

  // Auto-send initial query if provided from HomePage
  useEffect(() => {
    if (
      initialQuery &&
      isConnected &&
      !initialQuerySent.current &&
      !isLoading
    ) {
      handleSendMessage(initialQuery);
      initialQuerySent.current = true;
    }
  }, [initialQuery, isConnected, isLoading]);

  // Handle ESC key to close AI dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isAIDialogOpen) {
        setIsAIDialogOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAIDialogOpen]);

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
          <DocumentView document={currentDocument || undefined} />
          <ChatArea
            messages={messages}
            onSendMessage={handleSendMessage}
            isLoading={isAgentLoading}
            executionEvents={executionEvents}
            className="h-80 border-t"
          />
        </div>
      </MainContent>

      {/* Floating AI Button - only show when there's a document */}
      {currentDocument && (
        <FloatingAIButton
          isOpen={isAIDialogOpen}
          onToggle={() => setIsAIDialogOpen(!isAIDialogOpen)}
          variant="white"
        />
      )}

      {/* AI Dialog - shown when open */}
      <AIDialog
        isOpen={isAIDialogOpen}
        onClose={() => setIsAIDialogOpen(false)}
        onSend={(msg) => {
          handleSendMessage(msg);
          setIsAIDialogOpen(false);
        }}
        isLoading={isAgentLoading}
        messages={messages}
      />
    </Layout>
  );
}
