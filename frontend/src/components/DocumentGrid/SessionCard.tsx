import { FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useMemo } from "react";
import type { SessionCard } from "@/types";
import { createContentPreview } from "@/utils/markdown";

interface SessionCardProps {
  card: SessionCard;
}

export function SessionCard({ card }: SessionCardProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/session/${card.session_id}`);
  };

  // Strip markdown and truncate for preview
  const contentPreview = useMemo(() => {
    return createContentPreview(card.content, 120);
  }, [card.content]);

  return (
    <button
      onClick={handleClick}
      className="group flex h-36 flex-col rounded-xl border bg-card p-5 text-left transition-all duration-200 hover:bg-accent/50 hover:shadow-md"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 transition-colors group-hover:bg-primary/20">
          <FileText className="h-4 w-4 text-primary" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <h3 className="font-display truncate text-base font-medium transition-colors group-hover:text-primary">
            {card.session_title}
          </h3>
          <p className="mt-2 line-clamp-2 flex-1 text-sm leading-relaxed text-muted-foreground">
            {contentPreview}
          </p>
        </div>
      </div>
    </button>
  );
}
