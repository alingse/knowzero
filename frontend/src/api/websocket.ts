// WebSocket client for real-time chat.

import { useEffect, useRef, useState, useCallback } from "react";

import type { ChatRequest, StreamResponse } from "@/types";

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

interface UseWebSocketOptions {
  sessionId: string;
  onMessage?: (response: StreamResponse) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY = 1000;

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

  // Store callbacks in refs to avoid re-triggering the effect
  const onMessageRef = useRef(onMessage);
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  const onErrorRef = useRef(onError);

  // Keep refs in sync
  onMessageRef.current = onMessage;
  onConnectRef.current = onConnect;
  onDisconnectRef.current = onDisconnect;
  onErrorRef.current = onError;

  // Reconnection state
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalCloseRef = useRef(false);

  const connect = useCallback(() => {
    if (!sessionId) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/${sessionId}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setStatus("connected");
      reconnectAttemptsRef.current = 0;
      onConnectRef.current?.();
    };

    ws.onclose = () => {
      setStatus("disconnected");
      setIsLoading(false);
      onDisconnectRef.current?.();

      // Auto-reconnect with exponential backoff
      if (
        !intentionalCloseRef.current &&
        reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS
      ) {
        const delay = BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current);
        reconnectAttemptsRef.current += 1;
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      }
    };

    ws.onerror = (error) => {
      setStatus("error");
      setIsLoading(false);
      onErrorRef.current?.(error);
    };

    ws.onmessage = (event) => {
      try {
        const response: StreamResponse = JSON.parse(event.data);

        if (response.type === "thinking") {
          setIsLoading(true);
        } else if (response.type === "done" || response.type === "error") {
          setIsLoading(false);
        }

        onMessageRef.current?.(response);
      } catch (e) {
        console.error("Failed to parse WebSocket message:", e);
      }
    };

    wsRef.current = ws;
    setStatus("connecting");
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;

    intentionalCloseRef.current = false;
    reconnectAttemptsRef.current = 0;
    connect();

    return () => {
      intentionalCloseRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [sessionId, connect]);

  const sendMessage = (request: ChatRequest) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(request));
      setIsLoading(true);
      return true;
    }
    return false;
  };

  const disconnect = () => {
    intentionalCloseRef.current = true;
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
