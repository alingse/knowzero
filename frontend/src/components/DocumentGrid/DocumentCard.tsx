import { FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Document } from "@/types";

interface DocumentCardProps {
  document: Document;
}

export function DocumentCard({ document }: DocumentCardProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/session/${document.session_id}`);
  };

  // Truncate content preview
  const contentPreview = document.content.slice(0, 100) +
    (document.content.length > 100 ? "..." : "");

  return (
    <button
      onClick={handleClick}
      className="text-left p-5 rounded-lg border bg-card hover:bg-accent/50 transition-colors h-32 flex flex-col"
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <FileText className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
        <div className="min-w-0 flex-1 flex flex-col">
          <h3 className="font-medium text-base truncate">{document.topic}</h3>
          <p className="text-sm text-muted-foreground mt-2 line-clamp-2 flex-1">
            {contentPreview}
          </p>
        </div>
      </div>
    </button>
  );
}
