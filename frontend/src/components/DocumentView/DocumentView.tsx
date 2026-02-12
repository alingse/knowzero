import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Document } from "@/types";

interface DocumentViewProps {
  document?: Document;
  className?: string;
}

export function DocumentView({ document, className }: DocumentViewProps) {
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
      <ScrollArea className="flex-1 px-6 py-6">
        <article className="prose prose-stone max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => (
                <h1 className="mb-4 text-2xl font-bold">{children}</h1>
              ),
              h2: ({ children }) => (
                <h2 className="mb-3 mt-6 text-xl font-semibold">{children}</h2>
              ),
              h3: ({ children }) => (
                <h3 className="mb-2 mt-4 text-lg font-medium">{children}</h3>
              ),
              p: ({ children }) => (
                <p className="mb-4 leading-relaxed">{children}</p>
              ),
              code: ({ children, className }) => {
                const isInline = !className;
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
              ul: ({ children }) => (
                <ul className="mb-4 list-disc space-y-1 pl-6">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="mb-4 list-decimal space-y-1 pl-6">{children}</ol>
              ),
              strong: ({ children }) => (
                <strong className="entity-highlight">{children}</strong>
              ),
            }}
          >
            {document.content}
          </ReactMarkdown>
        </article>

        {/* Spacer for chat area */}
        <div className="h-64" />
      </ScrollArea>
    </div>
  );
}
