import { FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useMemo } from "react";
import type { Document } from "@/types";
import { createContentPreview } from "@/utils/markdown";

interface DocumentCardProps {
  document: Document;
}

export function DocumentCard({ document }: DocumentCardProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/session/${document.session_id}`);
  };

  // Strip markdown and truncate for preview
  const contentPreview = useMemo(() => {
    return createContentPreview(document.content, 120);
  }, [document.content]);

  return (
    <button
      onClick={handleClick}
      className="text-left p-5 rounded-xl border bg-card hover:bg-accent/50 hover:shadow-md transition-all duration-200 h-36 flex flex-col group"
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
          <FileText className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1 flex flex-col">
          <h3 className="font-display font-medium text-base truncate group-hover:text-primary transition-colors">
            {document.topic}
          </h3>
          <p className="text-sm text-muted-foreground mt-2 line-clamp-2 flex-1 leading-relaxed">
            {contentPreview}
          </p>
        </div>
      </div>
    </button>
  );
}
