import ReactMarkdown from "react-markdown";
import React, { useMemo, useRef, useEffect, useState } from "react";
import remarkGfm from "remark-gfm";

import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Document, FollowUpQuestion } from "@/types";

// Memoized DocumentView component to prevent unnecessary re-renders

interface DocumentViewProps {
  document?: Document;
  followUpQuestions?: FollowUpQuestion[];
  onFollowUpClick?: (question: FollowUpQuestion) => void;
  className?: string;
  isStreaming?: boolean;
}

// Find the last complete markdown block to split stable/streaming content
function splitContent(content: string): { stable: string; streaming: string } {
  if (!content) return { stable: "", streaming: "" };
  
  // Find positions of potential split points
  const lines = content.split('\n');
  let stableEndIndex = 0;
  let currentIndex = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = lines[i + 1];
    
    // Check if current line ends a block
    const isBlockEnd = 
      !nextLine || // Last line
      line === '' || // Empty line
      (line.startsWith('#') && !nextLine.startsWith('#')) || // End of heading
      (line.startsWith('```') && !nextLine.startsWith('```')) || // End of code block
      (/^\s*[-*+]\s/.test(line) && !/^\s*[-*+]\s/.test(nextLine)); // End of list
    
    if (isBlockEnd && i < lines.length - 1) {
      stableEndIndex = currentIndex + line.length + 1; // +1 for newline
    }
    
    currentIndex += line.length + 1;
  }
  
  // If content is short or no good split point found, render all as streaming
  if (stableEndIndex < 50 || content.length - stableEndIndex > 500) {
    return { stable: "", streaming: content };
  }
  
  return {
    stable: content.slice(0, stableEndIndex).trimEnd(),
    streaming: content.slice(stableEndIndex).trimStart()
  };
}

function DocumentViewComponent({ document, followUpQuestions, onFollowUpClick, className, isStreaming = false }: DocumentViewProps) {
  // Memoize entity set for O(1) lookup and stable reference
  const entitySet = useMemo(() => {
    return new Set(document?.entities.map(e => e.toLowerCase()) || []);
  }, [document?.entities]);

  // Split content into stable (rendered as markdown) and streaming (raw text)
  const { stable, streaming } = useMemo(() => {
    return splitContent(document?.content || "");
  }, [document?.content]);

  // Ref for auto-scrolling
  const contentEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Memoize markdown components
  const markdownComponents = useMemo(() => ({
    h1: ({ children }: { children?: React.ReactNode }) => (
      <h1 className="mb-4 text-2xl font-bold">{children}</h1>
    ),
    h2: ({ children }: { children?: React.ReactNode }) => (
      <h2 className="mb-3 mt-6 text-xl font-semibold">{children}</h2>
    ),
    h3: ({ children }: { children?: React.ReactNode }) => (
      <h3 className="mb-2 mt-4 text-lg font-medium">{children}</h3>
    ),
    p: ({ children }: { children?: React.ReactNode }) => (
      <p className="mb-4 leading-relaxed">{children}</p>
    ),
    code: ({ children, className: codeClass }: { children?: React.ReactNode; className?: string }) => {
      const isInline = !codeClass;
      return isInline ? (
        <code className="rounded bg-muted px-1.5 py-0.5 text-sm font-mono">
          {children}
        </code>
      ) : (
        <pre className="mb-4 overflow-x-auto rounded-lg bg-muted p-4">
          <code className="text-sm font-mono">{children}</code>
        </pre>
      );
    },
    ul: ({ children }: { children?: React.ReactNode }) => (
      <ul className="mb-4 list-disc space-y-1 pl-6">{children}</ul>
    ),
    ol: ({ children }: { children?: React.ReactNode }) => (
      <ol className="mb-4 list-decimal space-y-1 pl-6">{children}</ol>
    ),
    strong: ({ children }: { children?: React.ReactNode }) => {
      const text = typeof children === "string" ? children : "";
      const isEntity = text && Array.from(entitySet).some(e => 
        text.toLowerCase().includes(e)
      );
      return (
        <strong
          className={cn(
            "entity-highlight",
            isEntity && "bg-yellow-100/60 dark:bg-yellow-900/30 rounded px-0.5"
          )}
        >
          {children}
        </strong>
      );
    },
  }), [entitySet]);

  // Handle scroll events to detect user scrolling
  useEffect(() => {
    const scrollArea = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (!scrollArea) return;

    const handleScroll = () => {
      setIsUserScrolling(true);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        setIsUserScrolling(false);
      }, 1000);
    };

    scrollArea.addEventListener('scroll', handleScroll);
    return () => {
      scrollArea.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Auto-scroll to bottom when content updates (unless user is scrolling)
  useEffect(() => {
    if (!isUserScrolling && contentEndRef.current) {
      contentEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [streaming, stable, isUserScrolling]);

  if (!document) {
    return (
      <div
        className={cn(
          "flex flex-1 flex-col items-center justify-center text-muted-foreground",
          className
        )}
      >
        <p>选择一个文档开始阅读</p>
        <p className="text-sm">或创建一个新的学习会话</p>
      </div>
    );
  }

  const hasStableContent = stable.length > 0;
  const hasStreamingContent = streaming.length > 0;

  return (
    <div className={cn("flex flex-1 flex-col", className)}>
      {/* Header */}
      <div className="border-b px-6 py-4">
        <h1 className="text-2xl font-bold">{document.topic}</h1>
        {document.category_path && (
          <p className="mt-1 text-sm text-muted-foreground">
            {document.category_path}
          </p>
        )}
      </div>

      {/* Content */}
      <ScrollArea ref={scrollAreaRef} className="flex-1 px-6 py-6 scroll-area-viewport">
        <article className="prose prose-stone max-w-none document-content">
          {/* Stable content - rendered as markdown */}
          {hasStableContent && (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {stable}
            </ReactMarkdown>
          )}
          
          {/* Streaming content - raw text to avoid re-parsing, only show cursor when streaming */}
          {hasStreamingContent && (
            <span className="text-foreground streaming-text">
              {streaming}
              {isStreaming && (
                <span className="inline-block w-2 h-4 ml-0.5 bg-primary streaming-cursor" />
              )}
            </span>
          )}
        </article>

        {/* Follow-up questions */}
        {followUpQuestions && followUpQuestions.length > 0 && (
          <div className="mt-8">
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              继续探索
            </h3>
            <div className="flex flex-col gap-2">
              {followUpQuestions.map((q) => (
                <button
                  key={q.id}
                  onClick={() => onFollowUpClick?.(q)}
                  className="rounded-lg border px-4 py-2.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  {q.question}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Spacer and scroll anchor */}
        <div className="h-64" ref={contentEndRef} />
      </ScrollArea>
    </div>
  );
}

// Export memoized version to prevent parent re-renders from causing jitter
export const DocumentView = React.memo(DocumentViewComponent, (prev, next) => {
  // Custom comparison: only re-render if these props actually changed
  const docChanged = prev.document?.content !== next.document?.content ||
                     prev.document?.topic !== next.document?.topic ||
                     prev.document?.entities?.length !== next.document?.entities?.length;
  const questionsChanged = prev.followUpQuestions?.length !== next.followUpQuestions?.length;
  const classNameChanged = prev.className !== next.className;
  const isStreamingChanged = prev.isStreaming !== next.isStreaming;
  
  // Return true if props are equal (no re-render needed)
  return !docChanged && !questionsChanged && !classNameChanged && !isStreamingChanged;
});
