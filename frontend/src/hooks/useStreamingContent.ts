import { useState, useRef, useCallback } from "react";

import type { ExecutionEvent } from "@/components/Chat/ExecutionProgress";

export function useStreamingContent() {
  const [executionEvents, setExecutionEvents] = useState<ExecutionEvent[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingTitle, setStreamingTitle] = useState("");
  const tokenBufferRef = useRef<string>("");
  const tokenBatchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushTokenBuffer = useCallback(() => {
    if (tokenBufferRef.current) {
      setStreamingContent((prev) => prev + tokenBufferRef.current);
      tokenBufferRef.current = "";
    }
    if (tokenBatchTimeoutRef.current) {
      clearTimeout(tokenBatchTimeoutRef.current);
      tokenBatchTimeoutRef.current = null;
    }
  }, []);

  const appendTokenBatched = useCallback((content: string) => {
    tokenBufferRef.current += content;
    const shouldFlushNow = tokenBufferRef.current.length > 100;

    if (!tokenBatchTimeoutRef.current || shouldFlushNow) {
      if (tokenBatchTimeoutRef.current) {
        clearTimeout(tokenBatchTimeoutRef.current);
      }

      if (shouldFlushNow) {
        setStreamingContent((prev) => prev + tokenBufferRef.current);
        tokenBufferRef.current = "";
        tokenBatchTimeoutRef.current = null;
      } else {
        tokenBatchTimeoutRef.current = setTimeout(() => {
          setStreamingContent((prev) => prev + tokenBufferRef.current);
          tokenBufferRef.current = "";
          tokenBatchTimeoutRef.current = null;
        }, 100);
      }
    }
  }, []);

  const resetStreaming = useCallback(() => {
    setStreamingContent("");
    setStreamingTitle("");
  }, []);

  return {
    executionEvents,
    setExecutionEvents,
    streamingContent,
    setStreamingContent,
    streamingTitle,
    setStreamingTitle,
    flushTokenBuffer,
    appendTokenBatched,
    resetStreaming,
  };
}
