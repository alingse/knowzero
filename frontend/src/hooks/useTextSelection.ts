import { useState, useCallback, useEffect } from "react";

import type { AIInteractionContext } from "@/components/AIAssistant";

interface UseTextSelectionOptions {
  documentContent?: string;
  setAIContext: (context: AIInteractionContext) => void;
}

export function useTextSelection({ documentContent, setAIContext }: UseTextSelectionOptions) {
  const [selectedText, setSelectedText] = useState("");
  const [selectionPosition, setSelectionPosition] = useState<
    { x: number; y: number } | undefined
  >();

  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      const text = selection.toString().trim();
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      const fullContent = documentContent || "";
      const selectedIndex = fullContent.indexOf(text);
      let contextBefore = "";
      let contextAfter = "";

      if (selectedIndex >= 0) {
        const contextLength = 200;
        const beforeStart = Math.max(0, selectedIndex - contextLength);
        const afterEnd = Math.min(fullContent.length, selectedIndex + text.length + contextLength);
        contextBefore = fullContent.slice(beforeStart, selectedIndex);
        contextAfter = fullContent.slice(selectedIndex + text.length, afterEnd);
      }

      setSelectedText(text);
      setSelectionPosition({
        x: rect.left + 20,
        y: rect.bottom + 8,
      });
      setAIContext({
        type: "comment",
        sourceText: text,
        contextBefore,
        contextAfter,
      });
    }
  }, [setAIContext, documentContent]);

  useEffect(() => {
    const handleMouseUp = () => {
      setTimeout(handleTextSelection, 10);
    };
    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, [handleTextSelection]);

  return {
    selectedText,
    setSelectedText,
    selectionPosition,
  };
}
