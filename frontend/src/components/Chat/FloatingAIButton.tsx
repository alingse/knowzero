import { MessageCircle, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FloatingAIButtonProps {
  isOpen: boolean;
  onToggle: () => void;
  hasUnread?: boolean;
  className?: string;
  variant?: "colored" | "white";
}

export function FloatingAIButton({
  isOpen,
  onToggle,
  hasUnread = false,
  className,
  variant = "colored",
}: FloatingAIButtonProps) {
  const [isHovered, setIsHovered] = useState(false);

  const isWhite = variant === "white";

  return (
    <div
      className={cn(
        "fixed right-8 bottom-8 z-50",
        className
      )}
    >
      {/* Crystal ball button */}
      <Button
        size="lg"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={onToggle}
        className={cn(
          "relative h-16 w-16 rounded-full shadow-2xl transition-all duration-300",
          "hover:scale-110 hover:shadow-xl",
          // White variant - glass effect
          isWhite && [
            "bg-gradient-to-br from-slate-50 to-slate-100",
            "border-2 border-slate-300/80",
            "shadow-[0_8px_30px_rgb(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.8)]",
            "hover:border-slate-400 hover:from-white hover:to-slate-50",
            "hover:shadow-[0_12px_40px_rgb(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.9)]",
            "before:absolute before:-inset-1 before:rounded-full before:bg-gradient-to-br",
            "before:from-blue-100/40 before:to-slate-300/40",
            "before:blur-lg before:opacity-0 before:transition-opacity",
            "hover:before:opacity-80",
          ],
          // Colored variant
          !isWhite && [
            "bg-gradient-to-br from-primary to-primary/80",
            "before:absolute before:-inset-1 before:rounded-full before:bg-gradient-to-br",
            "before:from-primary/50 before:to-blue-500/50",
            "before:blur-lg before:opacity-0 before:transition-opacity",
            "hover:before:opacity-100",
          ]
        )}
      >
        {isOpen ? (
          <X className={cn(
            "h-6 w-6",
            isWhite ? "text-slate-600" : "text-primary-foreground"
          )} />
        ) : (
          <MessageCircle className={cn(
            "h-7 w-7",
            isWhite ? "text-slate-600" : "text-primary-foreground"
          )} />
        )}

        {/* Pulse animation for unread */}
        {hasUnread && !isOpen && (
          <span className="absolute right-0 top-0 flex h-4 w-4">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-4 w-4 rounded-full bg-red-500" />
          </span>
        )}

        {/* Ripple effect on hover */}
        {isHovered && (
          <span className={cn(
            "absolute -inset-4 rounded-full border-2 animate-pulse",
            isWhite ? "border-slate-400/50" : "border-primary/30"
          )} />
        )}
      </Button>

      {/* Tooltip hint */}
      <div className="absolute bottom-full right-0 mb-3 hidden whitespace-nowrap rounded-lg bg-foreground px-3 py-1.5 text-xs text-background group-hover:block">
        {isOpen ? "关闭对话框" : "打开 AI 助手"}
      </div>
    </div>
  );
}
