/**
 * CommentPanel - Inline comment/annotation panel
 * 
 * Appears near selected text in the document.
 * Allows users to comment on specific sections and trigger AI actions.
 */

import { useEffect, useRef, useState } from "react";
import { X, Sparkles, Search, Wrench, Target, List, Copy, Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { DisplayMessage } from "../Chat/MessagesList";

interface CommentPanelProps {
  selectedText: string;
  position?: { x: number; y: number };
  messages: DisplayMessage[];
  isLoading?: boolean;
  onSend: (message: string) => void;
  onClose: () => void;
}

const quickActions = [
  {
    id: "analyze",
    label: "深入解析",
    icon: Search,
    prompt: "请深入解析这段内容的核心概念和原理",
  },
  {
    id: "apply",
    label: "实际应用",
    icon: Wrench,
    prompt: "请说明这段内容的应用场景和实际用法",
  },
  {
    id: "keypoints",
    label: "关键要点",
    icon: Target,
    prompt: "请提炼这段内容的关键要点",
  },
  {
    id: "example",
    label: "举例说明",
    icon: List,
    prompt: "请举例说明这段内容",
  },
];

export function CommentPanel({
  selectedText,
  position,
  messages,
  isLoading = false,
  onSend,
  onClose,
}: CommentPanelProps) {
  const [comment, setComment] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Auto-focus textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid immediate close on selection
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  const handleQuickAction = (action: (typeof quickActions)[0]) => {
    const fullPrompt = `${action.prompt}: "${selectedText.slice(0, 100)}${selectedText.length > 100 ? '...' : ''}"`;
    onSend(fullPrompt);
  };

  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(selectedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleSubmit = () => {
    if (!comment.trim() || isLoading) return;
    const fullPrompt = `关于这段内容"${selectedText.slice(0, 50)}${selectedText.length > 50 ? '...' : ''}"，${comment}`;
    onSend(fullPrompt);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleSubmit();
    }
  };

  // Calculate position - ensure panel stays within viewport bounds
  const style: React.CSSProperties = position
    ? {
        position: "fixed",
        // Ensure panel doesn't go off the right edge
        left: Math.min(Math.max(position.x, 16), window.innerWidth - 336),
        // Ensure panel doesn't go off the bottom edge
        top: Math.min(Math.max(position.y, 16), window.innerHeight - 400),
        zIndex: 50,
      }
    : {
        position: "fixed",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 50,
      };

  return (
    <div
      ref={panelRef}
      style={style}
      className={cn(
        "w-80 rounded-xl border bg-background shadow-2xl",
        "animate-in fade-in zoom-in-95 duration-200"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">AI 注释</span>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-muted"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Selected text preview */}
      <div className="border-b bg-muted/30 px-3 py-2">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs text-muted-foreground">选中的内容：</div>
          <button
            onClick={handleCopy}
            className={cn(
              "flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors",
              copied 
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" 
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {copied ? (
              <>
                <Check className="h-3 w-3" />
                已复制
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                复制
              </>
            )}
          </button>
        </div>
        <div className="text-sm line-clamp-3 text-foreground/80">
          "{selectedText}"
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-4 gap-1 border-b p-2">
        {quickActions.map((action) => (
          <button
            key={action.id}
            onClick={() => handleQuickAction(action)}
            disabled={isLoading}
            className={cn(
              "flex flex-col items-center gap-1 rounded-lg p-2 text-xs",
              "transition-colors hover:bg-accent",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            <action.icon className="h-4 w-4 text-primary" />
            <span>{action.label}</span>
          </button>
        ))}
      </div>

      {/* Comment input */}
      <div className="p-3">
        <Textarea
          ref={textareaRef}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入你的问题或评论... (Cmd+Enter 发送)"
          disabled={isLoading}
          className="min-h-[80px] resize-none text-sm"
        />
        
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            或选择上方快捷操作
          </span>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!comment.trim() || isLoading}
            className="h-8"
          >
            {isLoading ? (
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
            ) : (
              <>
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                发送
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Previous comments on this selection (if any) */}
      {messages.length > 0 && (
        <div className="border-t bg-muted/20 px-3 py-2">
          <div className="mb-2 text-xs font-medium text-muted-foreground">
            历史评论
          </div>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className="rounded bg-background p-2 text-xs"
              >
                <div className="text-muted-foreground">
                  {new Date(msg.timestamp).toLocaleString()}
                </div>
                <div className="mt-1">{msg.content}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
