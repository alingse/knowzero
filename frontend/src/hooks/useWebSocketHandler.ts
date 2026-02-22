import { useCallback } from "react";
import type { QueryClient } from "@tanstack/react-query";

import type { DisplayMessage } from "@/components/Chat/MessagesList";
import { roadmapsApi } from "@/api/client";
import { useSessionStore } from "@/stores/sessionStore";
import type { Document, FollowUpQuestion, StreamResponse, Roadmap } from "@/types";
import { MessageType } from "@/types";

interface UseWebSocketHandlerOptions {
  sessionId: string | undefined;
  queryClient: QueryClient;
  // Streaming
  setStreamingContent: React.Dispatch<React.SetStateAction<string>>;
  setStreamingTitle: React.Dispatch<React.SetStateAction<string>>;
  setExecutionEvents: React.Dispatch<React.SetStateAction<import("@/components/Chat/ExecutionProgress").ExecutionEvent[]>>;
  flushTokenBuffer: () => void;
  appendTokenBatched: (content: string) => void;
  // Placeholder
  placeholderIdRef: React.MutableRefObject<number | null>;
  addPlaceholder: (content: string) => number;
  updatePlaceholder: (id: number, content: string) => void;
  removePlaceholder: () => void;
  // View
  setViewMode: (mode: "document" | "roadmap") => void;
}

export function useWebSocketHandler({
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
  setViewMode,
}: UseWebSocketHandlerOptions) {
  const {
    addDocument,
    setCurrentDocument,
    setLoading,
    setStreaming,
    setFollowUpQuestions,
    updateDocumentEntities,
    addMessage,
    setRoadmap,
    setRoadmapProgress,
  } = useSessionStore();

  const handleWebSocketMessage = useCallback(
    (response: StreamResponse) => {
      switch (response.type) {
        case "thinking":
          setLoading(true);
          setExecutionEvents([]);
          setStreamingContent("");
          setStreamingTitle("正在生成文档...");
          setFollowUpQuestions([]);
          addPlaceholder("...");
          break;

        case "token": {
          const tokenContent = response.data?.content as string;
          if (tokenContent) {
            setStreamingContent((prev) => {
              if (!prev) setCurrentDocument(null);
              return prev + tokenContent;
            });
          }
          setStreaming(true);
          break;
        }

        case "document_start": {
          const docTopic = response.data?.topic as string;
          if (docTopic) {
            setStreamingTitle(docTopic);
            setCurrentDocument(null);
            if (placeholderIdRef.current) {
              updatePlaceholder(placeholderIdRef.current, `正在生成《${docTopic}》...`);
            }
          }
          break;
        }

        case "node_start": {
          const nodeName = response.data?.name as string;
          if (nodeName) {
            setExecutionEvents((prev) => [
              ...prev,
              { id: `node-${Date.now()}`, type: "node_start", name: nodeName, timestamp: Date.now() },
            ]);
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
            appendTokenBatched(docTokenContent);
          }
          setStreaming(true);
          break;
        }

        case "document":
          flushTokenBuffer();
          if (response.data) {
            const doc = response.data as unknown as Document;
            setCurrentDocument(doc);
            addDocument(doc);
            if (placeholderIdRef.current) {
              updatePlaceholder(placeholderIdRef.current, `已生成《${doc.topic}》`);
            }
          }
          setStreamingContent("");
          break;

        case "entities": {
          const entitiesData = response.data as
            | { document_id?: number; entities?: string[] }
            | undefined;
          const currentDoc = useSessionStore.getState().currentDocument;
          const shouldUpdateEntities =
            entitiesData?.entities &&
            (!entitiesData.document_id || !currentDoc || entitiesData.document_id === currentDoc?.id);
          if (shouldUpdateEntities) {
            updateDocumentEntities(entitiesData.entities!);
          }
          break;
        }

        case "follow_ups": {
          const fuData = response.data as
            | { document_id?: number; questions?: FollowUpQuestion[] }
            | undefined;
          const currentDocForFU = useSessionStore.getState().currentDocument;
          const shouldUpdateFU =
            fuData?.questions &&
            (!fuData.document_id || !currentDocForFU || fuData.document_id === currentDocForFU?.id);
          if (shouldUpdateFU && fuData.questions) {
            const mapped = fuData.questions.map((q, i) => ({
              ...q,
              id: q.id ?? i,
              is_clicked: q.is_clicked ?? false,
            }));
            setFollowUpQuestions(mapped);
          }
          break;
        }

        case "roadmap": {
          if (response.data) {
            const roadmapData = response.data as unknown as Roadmap;
            setRoadmap(roadmapData);
            roadmapsApi
              .getProgress(roadmapData.id)
              .then((progress) => setRoadmapProgress(progress))
              .catch((error) => console.error("Failed to load roadmap progress:", error));
            removePlaceholder();
          }
          break;
        }

        case "navigation": {
          const navData = response.data as { document_id?: number | null; message?: string } | undefined;
          if (navData?.document_id) {
            const targetDoc = useSessionStore.getState().documents.find((d) => d.id === navData.document_id);
            if (targetDoc) {
              setCurrentDocument(targetDoc);
              setViewMode("document");
              setFollowUpQuestions(targetDoc.follow_up_questions || []);
            } else {
              console.warn("[navigation] Document not found in store:", navData.document_id);
            }
          }
          removePlaceholder();
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
          flushTokenBuffer();
          setLoading(false);
          setStreaming(false);
          setStreamingContent("");
          setStreamingTitle("");
          placeholderIdRef.current = null;
          if (sessionId) {
            queryClient.invalidateQueries({ queryKey: ["session", sessionId, "messages"] });
          }
          break;
      }
    },
    [
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
      setViewMode,
      addDocument,
      setCurrentDocument,
      setLoading,
      setStreaming,
      setFollowUpQuestions,
      updateDocumentEntities,
      addMessage,
      setRoadmap,
      setRoadmapProgress,
    ]
  );

  return handleWebSocketMessage;
}
