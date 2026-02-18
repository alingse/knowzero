import ReactMarkdown from "react-markdown";
import React, { useMemo, useRef, useEffect, useState } from "react";
import remarkGfm from "remark-gfm";

import { ScrollArea } from "@/components/ui/scroll-area";
import { EntityMention } from "@/components/DocumentView/EntityMention";
import { cn } from "@/lib/utils";
import type { Document, FollowUpQuestion } from "@/types";

import { EmptyState } from "../Chat/EmptyState";

// Memoized DocumentView component to prevent unnecessary re-renders

interface DocumentViewProps {
  document?: Document;
  followUpQuestions?: FollowUpQuestion[];
  onFollowUpClick?: (question: FollowUpQuestion) => void;
  onEntityClick?: (name: string, sourceDocId: number) => void;
  onDocumentClick?: (docId: number) => void;
  className?: string;
  isStreaming?: boolean;
}

// Find the last complete markdown block to split stable/streaming content
function splitContent(content: string): { stable: string; streaming: string } {
  if (!content) return { stable: "", streaming: "" };

  // Find positions of potential split points
  const lines = content.split("\n");
  let stableEndIndex = 0;
  let currentIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = lines[i + 1];

    // Check if current line ends a block
    const isBlockEnd =
      !nextLine || // Last line
      line === "" || // Empty line
      (line.startsWith("#") && !nextLine.startsWith("#")) || // End of heading
      (line.startsWith("```") && !nextLine.startsWith("```")) || // End of code block
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
    streaming: content.slice(stableEndIndex).trimStart(),
  };
}

function DocumentViewComponent({
  document,
  followUpQuestions,
  onFollowUpClick,
  onEntityClick,
  onDocumentClick,
  className,
  isStreaming = false,
}: DocumentViewProps) {
  // Memoize entity set for O(1) lookup and stable reference
  const entitySet = useMemo(() => {
    return new Set(document?.entities.map((e) => e.toLowerCase()) || []);
  }, [document?.entities]);

  // Split text into entity/non-entity fragments for individual highlighting
  function splitTextByEntities(text: string): Array<{ type: "entity" | "text"; content: string }> {
    if (!text || !entitySet.size) {
      return [{ type: "text", content: text }];
    }

    const fragments: Array<{ type: "entity" | "text"; content: string }> = [];
    let lastIndex = 0;
    const lowerText = text.toLowerCase();

    // Find all entity matches
    const matches: Array<{ start: number; end: number; entity: string }> = [];
    for (const ent of entitySet) {
      const entity = ent as string; // Type assertion
      let pos = lowerText.indexOf(entity, lastIndex);
      while (pos !== -1) {
        matches.push({ start: pos, end: pos + entity.length, entity });
        pos = lowerText.indexOf(entity, pos + entity.length);
      }
    }

    // Sort by start position and remove overlaps (keep longest match at each position)
    matches.sort((a, b) => a.start - b.start || b.end - a.end);
    const nonOverlappingMatches: typeof matches = [];
    for (const match of matches) {
      const overlaps = nonOverlappingMatches.some(
        (m) => match.start < m.end && match.end > m.start
      );
      if (!overlaps) {
        nonOverlappingMatches.push(match);
      }
    }

    // Build fragments from non-overlapping matches
    for (const match of nonOverlappingMatches) {
      if (match.start > lastIndex) {
        fragments.push({ type: "text", content: text.slice(lastIndex, match.start) });
      }
      fragments.push({ type: "entity", content: text.slice(match.start, match.end) });
      lastIndex = match.end;
    }

    if (lastIndex < text.length) {
      fragments.push({ type: "text", content: text.slice(lastIndex) });
    }

    return fragments;
  }

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
  const markdownComponents = useMemo(
    () => ({
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
      code: ({
        children,
        className: codeClass,
      }: {
        children?: React.ReactNode;
        className?: string;
      }) => {
        const isInline = !codeClass;
        return isInline ? (
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">{children}</code>
        ) : (
          <pre className="mb-4 overflow-x-auto rounded-lg bg-muted p-4">
            <code className="font-mono text-sm">{children}</code>
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

        if (!text || !document) {
          return <strong>{children}</strong>;
        }

        // Split text into entity/non-entity fragments
        const fragments = splitTextByEntities(text);

        // If single fragment and it's an entity, use EntityMention component
        if (fragments.length === 1 && fragments[0].type === "entity") {
          return (
            <EntityMention
              name={fragments[0].content}
              sourceDocId={document.id}
              sessionId={document.session_id}
              onEntityClick={onEntityClick}
              onDocumentClick={onDocumentClick}
            />
          );
        }

        // Render mixed fragments (entity and text)
        return (
          <strong
            className={cn("entity-highlight rounded px-0.5 transition-colors hover:bg-accent")}
          >
            {fragments.map((frag, i) => {
              if (frag.type === "entity") {
                return (
                  <EntityMention
                    key={i}
                    name={frag.content}
                    sourceDocId={document.id}
                    sessionId={document.session_id}
                    onEntityClick={onEntityClick}
                    onDocumentClick={onDocumentClick}
                  />
                );
              }
              return <span key={i}>{frag.content}</span>;
            })}
          </strong>
        );
      },
    }),
    [entitySet]
  );

  // Handle scroll events to detect user scrolling
  useEffect(() => {
    const scrollArea = scrollAreaRef.current?.querySelector("[data-radix-scroll-area-viewport]");
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

    scrollArea.addEventListener("scroll", handleScroll);
    return () => {
      scrollArea.removeEventListener("scroll", handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Scroll to top when switching documents
  const prevDocIdRef = useRef(document?.id);
  useEffect(() => {
    if (document?.id !== prevDocIdRef.current) {
      prevDocIdRef.current = document?.id;
      const viewport = scrollAreaRef.current?.querySelector("[data-radix-scroll-area-viewport]");
      if (viewport) {
        viewport.scrollTop = 0;
      }
    }
  }, [document?.id]);

  // Auto-scroll to bottom when streaming content updates (unless user is scrolling)
  useEffect(() => {
    if (isStreaming && !isUserScrolling && contentEndRef.current) {
      contentEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [streaming, stable, isStreaming, isUserScrolling]);

  if (!document) {
    return <EmptyState type="document" className={className} />;
  }

  const hasStableContent = stable.length > 0;
  const hasStreamingContent = streaming.length > 0;

  return (
    <div className={cn("flex flex-1 flex-col", className)}>
      {/* Header */}
      <div className="border-b px-6 py-4">
        <h1 className="text-2xl font-bold">{document.topic}</h1>
        {document.category_path && (
          <p className="mt-1 text-sm text-muted-foreground">{document.category_path}</p>
        )}
      </div>

      {/* Content */}
      <ScrollArea ref={scrollAreaRef} className="scroll-area-viewport flex-1 px-6 py-6">
        <article className="prose prose-stone document-content max-w-none">
          {/* Stable content - rendered as markdown */}
          {hasStableContent && (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {stable}
            </ReactMarkdown>
          )}

          {/* Streaming content - raw text to avoid re-parsing, only show cursor when streaming */}
          {hasStreamingContent && (
            <span className="streaming-text text-foreground">
              {streaming}
              {isStreaming && (
                <span className="streaming-cursor ml-0.5 inline-block h-4 w-2 bg-primary" />
              )}
            </span>
          )}
        </article>

        {/* Follow-up questions */}
        {followUpQuestions && followUpQuestions.length > 0 && (
          <div className="mt-8">
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">继续探索</h3>
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
  const docChanged =
    prev.document?.content !== next.document?.content ||
    prev.document?.topic !== next.document?.topic ||
    prev.document?.entities?.length !== next.document?.entities?.length;
  const questionsChanged = prev.followUpQuestions?.length !== next.followUpQuestions?.length;
  const classNameChanged = prev.className !== next.className;
  const isStreamingChanged = prev.isStreaming !== next.isStreaming;
  const callbacksChanged =
    prev.onEntityClick !== next.onEntityClick || prev.onDocumentClick !== next.onDocumentClick;

  // Debug logging
  const shouldRerender =
    docChanged || questionsChanged || classNameChanged || isStreamingChanged || callbacksChanged;
  if (questionsChanged) {
    console.log("[DocumentView] followUpQuestions changed:", {
      prevLength: prev.followUpQuestions?.length,
      nextLength: next.followUpQuestions?.length,
      shouldRerender,
    });
  }

  // Return true if props are equal (no re-render needed)
  return !shouldRerender;
});
