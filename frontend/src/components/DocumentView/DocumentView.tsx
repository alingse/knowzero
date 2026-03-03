import ReactMarkdown from "react-markdown";
import React, { useMemo, useRef, useEffect, useState } from "react";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import mermaid from "mermaid";

import { ScrollArea } from "@/components/ui/scroll-area";
import { EntityMention } from "@/components/DocumentView/EntityMention";
import { cn } from "@/lib/utils";
import { DOCUMENT_PROSE_CLASSES } from "@/constants/styles";
import type { Document, FollowUpQuestion } from "@/types";

import { EmptyState } from "../Chat/EmptyState";

// Mermaid diagram component
function MermaidDiagram({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: "default",
      securityLevel: "strict",
    });
  }, []);

  useEffect(() => {
    const renderDiagram = async () => {
      if (!code || !containerRef.current) return;
      
      try {
        // Normalize quotes and whitespace for Mermaid compatibility
        // Convert Chinese quotes to English quotes, normalize spaces
        const normalizedCode = code
          .replace(/[\u201C\u201D]/g, '"') // Chinese double quotes “ ” -> "
          .replace(/[\u2018\u2019]/g, "'") // Chinese single quotes ' ' -> '
          .replace(/\u3000/g, " ") // Full-width space -> half-width
          .trim();
        
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
        const { svg: renderedSvg } = await mermaid.render(id, normalizedCode);
        setSvg(renderedSvg);
        setError("");
      } catch (err) {
        console.error("Mermaid render error:", err);
        setError("无法渲染图表");
      }
    };

    renderDiagram();
  }, [code]);

  if (error) {
    return (
      <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
        <p className="text-sm text-destructive">{error}</p>
        <pre className="mt-2 text-xs text-muted-foreground">{code}</pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="mb-4 flex justify-center overflow-x-auto rounded-lg bg-white p-4 dark:bg-gray-900"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

// Memoized DocumentView component to prevent unnecessary re-renders

// Split text into entity/non-entity fragments for individual highlighting
function splitTextByEntities(
  text: string,
  entitySet: Set<string>
): Array<{ type: "entity" | "text"; content: string }> {
  if (!text || !entitySet.size) {
    return [{ type: "text", content: text }];
  }

  const fragments: Array<{ type: "entity" | "text"; content: string }> = [];
  let lastIndex = 0;
  const lowerText = text.toLowerCase();

  // Find all entity matches
  const matches: Array<{ start: number; end: number; entity: string }> = [];
  for (const ent of entitySet) {
    const entity = ent as string;
    let pos = lowerText.indexOf(entity, 0);
    while (pos !== -1) {
      matches.push({ start: pos, end: pos + entity.length, entity });
      pos = lowerText.indexOf(entity, pos + entity.length);
    }
  }

  // Sort by start position and remove overlaps (keep longest match at each position)
  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  const nonOverlappingMatches: typeof matches = [];
  for (const match of matches) {
    const overlaps = nonOverlappingMatches.some((m) => match.start < m.end && match.end > m.start);
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
        <h1 className="mb-4 text-xl font-bold md:text-2xl">{children}</h1>
      ),
      h2: ({ children }: { children?: React.ReactNode }) => (
        <h2 className="mb-3 mt-6 text-lg font-semibold md:text-xl">{children}</h2>
      ),
      h3: ({ children }: { children?: React.ReactNode }) => (
        <h3 className="mb-2 mt-4 text-base font-medium md:text-lg">{children}</h3>
      ),
      p: ({ children }: { children?: React.ReactNode }) => (
        <p className="mb-4 text-base leading-relaxed md:text-base">{children}</p>
      ),
      code: ({
        children,
        className: codeClass,
      }: {
        children?: React.ReactNode;
        className?: string;
      }) => {
        const isInline = !codeClass;
        const match = /language-(\w+)/.exec(codeClass || "");
        const language = match ? match[1] : "";
        const codeString = String(children).replace(/\n$/, "");

        // Handle Mermaid diagrams
        if (language === "mermaid") {
          return <MermaidDiagram code={codeString} />;
        }

        return isInline ? (
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">{children}</code>
        ) : (
          <div className="mb-4 overflow-hidden rounded-lg">
            <div className="flex items-center justify-between bg-[#1e1e1e] px-4 py-2">
              <span className="text-xs text-gray-400">{language || "code"}</span>
              <button
                onClick={() => navigator.clipboard.writeText(codeString)}
                className="text-xs text-gray-400 hover:text-white transition-colors"
              >
                复制
              </button>
            </div>
            <SyntaxHighlighter
              language={language || "text"}
              style={vscDarkPlus}
              customStyle={{
                margin: 0,
                borderRadius: "0 0 0.5rem 0.5rem",
                fontSize: "0.875rem",
              }}
              showLineNumbers
            >
              {codeString}
            </SyntaxHighlighter>
          </div>
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
        const fragments = splitTextByEntities(text, entitySet);

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

        // No entity matches - render as plain bold text
        if (!fragments.some((f) => f.type === "entity")) {
          return <strong>{children}</strong>;
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
    [entitySet, document, onEntityClick, onDocumentClick]
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
      <div className="doc-header">
        <h1 className="doc-title">{document.topic}</h1>
        {document.category_path && <p className="doc-subtitle">{document.category_path}</p>}
      </div>

      {/* Content */}
      <ScrollArea ref={scrollAreaRef} className={cn("scroll-area-viewport flex-1", "doc-content")}>
        <article className={DOCUMENT_PROSE_CLASSES}>
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
          <div className="doc-followup-section">
            <h3 className="doc-followup-title">继续探索</h3>
            <div className="doc-followup-group">
              {followUpQuestions.map((q) => (
                <button
                  key={q.id}
                  onClick={() => onFollowUpClick?.(q)}
                  className="doc-followup-btn"
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

  const shouldRerender =
    docChanged || questionsChanged || classNameChanged || isStreamingChanged || callbacksChanged;

  // Return true if props are equal (no re-render needed)
  return !shouldRerender;
});
