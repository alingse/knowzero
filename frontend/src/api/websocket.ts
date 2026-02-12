// WebSocket client for real-time chat.

import { useEffect, useRef, useState } from "react";

import type { ChatRequest, StreamResponse } from "@/types";

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

interface UseWebSocketOptions {
  sessionId: string;
  onMessage?: (response: StreamResponse) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
}

export function useWebSocket({
  sessionId,
  onMessage,
  onConnect,
  onDisconnect,
  onError,
}: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!sessionId) return;

    const wsUrl = `ws://${window.location.host}/ws/${sessionId}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setStatus("connected");
      onConnect?.();
    };

    ws.onclose = () => {
      setStatus("disconnected");
      setIsLoading(false);
      onDisconnect?.();
    };

    ws.onerror = (error) => {
      setStatus("error");
      setIsLoading(false);
      onError?.(error);
    };

    ws.onmessage = (event) => {
      try {
        const response: StreamResponse = JSON.parse(event.data);
        
        // Update loading state based on response type
        if (response.type === "thinking") {
          setIsLoading(true);
        } else if (response.type === "done" || response.type === "error") {
          setIsLoading(false);
        }
        
        onMessage?.(response);
      } catch (e) {
        console.error("Failed to parse WebSocket message:", e);
      }
    };

    wsRef.current = ws;
    setStatus("connecting");

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [sessionId]);

  const sendMessage = (request: ChatRequest) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(request));
      setIsLoading(true);
      return true;
    }
    return false;
  };

  const disconnect = () => {
    wsRef.current?.close();
  };

  return {
    sendMessage,
    disconnect,
    status,
    isLoading,
    isConnected: status === "connected",
  };
}
