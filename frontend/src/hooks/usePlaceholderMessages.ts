import { useRef, useCallback } from "react";

import type { DisplayMessage } from "@/components/Chat/MessagesList";
import { useSessionStore } from "@/stores/sessionStore";
import type { Message } from "@/types";
import { MessageType } from "@/types";

export function usePlaceholderMessages() {
  const placeholderIdRef = useRef<number | null>(null);
  const { addMessage, updateMessage, setMessages } = useSessionStore();

  const addPlaceholder = useCallback(
    (content: string) => {
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
    },
    [addMessage]
  );

  const updatePlaceholder = useCallback(
    (id: number, content: string) => {
      updateMessage(id, { content });
    },
    [updateMessage]
  );

  const removePlaceholder = useCallback(() => {
    const id = placeholderIdRef.current;
    if (id) {
      setMessages((prev: Message[]) => prev.filter((m) => m.id !== id));
    }
    placeholderIdRef.current = null;
  }, [setMessages]);

  return {
    placeholderIdRef,
    addPlaceholder,
    updatePlaceholder,
    removePlaceholder,
  };
}
