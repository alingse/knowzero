import { useState } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "@/lib/utils";
import { EntityCard } from "./EntityCard";

interface EntityMentionProps {
  name: string;
  sourceDocId: number;
  sessionId: string;
  onEntityClick?: (name: string, sourceDocId: number) => void;
  onDocumentClick?: (docId: number) => void;
  className?: string;
}

export function EntityMention({
  name,
  sourceDocId,
  sessionId,
  onEntityClick,
  onDocumentClick,
  className,
}: EntityMentionProps) {
  const [open, setOpen] = useState(false);

  const handleExploreClick = () => {
    setOpen(false);
    onEntityClick?.(name, sourceDocId);
  };

  const handleDocumentClick = (docId: number) => {
    setOpen(false);
    onDocumentClick?.(docId);
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <strong
          className={cn(
            "entity-mention cursor-pointer rounded border-b-2 border-dotted border-primary px-0.5 transition-colors hover:bg-accent/50",
            className
          )}
        >
          {name}
        </strong>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          className="z-50 w-80 rounded-lg border bg-popover p-0 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2"
          sideOffset={5}
          align="start"
        >
          <EntityCard
            entityName={name}
            sessionId={sessionId}
            onExploreClick={handleExploreClick}
            onDocumentClick={handleDocumentClick}
          />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
