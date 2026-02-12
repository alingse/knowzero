import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useParams } from "react-router-dom";

import { ChatArea } from "@/components/Chat/ChatArea";
import { DocumentView } from "@/components/DocumentView/DocumentView";
import { Layout, MainContent } from "@/components/Layout/Layout";
import { Sidebar } from "@/components/Sidebar/Sidebar";
import { useWebSocket } from "@/api/websocket";
import { sessionsApi } from "@/api/client";
import { useSessionStore } from "@/stores/sessionStore";
import type { Message, StreamResponse } from "@/types";

export function SessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const {
    currentDocument,
    messages,
    setCurrentSession,
    setCurrentDocument,
    setMessages,
    addMessage,
    setLoading,
    setStreaming,
    clearStreamingContent,
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
          setCurrentDocument(response.data as typeof currentDocument);
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
            className="h-80 border-t"
          />
        </div>
      </MainContent>
    </Layout>
  );
}
