import { useQuery } from "@tanstack/react-query";
import { BookOpen, FileText, Sparkles, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { entitiesApi } from "@/api/client";
import type { RelatedDocument } from "@/types";

// Entity type icons mapping
const ENTITY_TYPE_ICONS: Record<string, LucideIcon> = {
  concept: Sparkles,
  tool: BookOpen,
  library: FileText,
  technique: Sparkles,
};

interface EntityCardProps {
  entityName: string;
  sessionId: string;
  onExploreClick?: () => void;
  onDocumentClick?: (docId: number) => void;
  className?: string;
}

export function EntityCard({
  entityName,
  sessionId,
  onExploreClick,
  onDocumentClick,
  className,
}: EntityCardProps) {
  const {
    data: entity,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["entity", "query", sessionId, entityName],
    queryFn: () => entitiesApi.query(entityName, sessionId),
    enabled: !!sessionId && !!entityName,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  if (isLoading) {
    return (
      <div className={cn("p-4", className)}>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-pulse rounded bg-muted-foreground/20" />
          <div className="h-4 w-24 animate-pulse rounded bg-muted-foreground/20" />
        </div>
      </div>
    );
  }

  if (error || !entity) {
    return (
      <div className={cn("p-4 text-sm text-muted-foreground", className)}>无法加载实体详情</div>
    );
  }

  // Entity not found in database
  if (entity.id === 0) {
    return (
      <div className={cn("p-4", className)}>
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{entityName}</span>
        </div>
        <p className="mb-3 text-sm text-muted-foreground">这是一个新实体，想要了解更多吗？</p>
        <Button size="sm" variant="outline" className="w-full" onClick={onExploreClick}>
          深度探索
        </Button>
      </div>
    );
  }

  const IconComponent = ENTITY_TYPE_ICONS[entity.entity_type || ""] || Sparkles;

  return (
    <div className={cn("p-4", className)}>
      {/* Header: Entity name and type */}
      <div className="mb-3 flex items-center gap-2">
        <IconComponent className="h-4 w-4 text-primary" />
        <span className="font-medium">{entity.name}</span>
        {entity.entity_type && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            {entity.entity_type}
          </span>
        )}
      </div>

      {/* Summary */}
      {entity.summary && <p className="mb-3 text-sm text-muted-foreground">{entity.summary}</p>}

      {/* Main document indicator */}
      {entity.has_main_doc && entity.main_doc_id && (
        <div className="mb-3 rounded-lg bg-muted/50 p-2">
          <div className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <BookOpen className="h-3 w-3" />
            专门文档
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-auto justify-start px-2 py-1 text-sm"
            onClick={() => onDocumentClick?.(entity.main_doc_id!)}
          >
            查看文档
          </Button>
        </div>
      )}

      {/* Related documents */}
      {entity.related_docs && entity.related_docs.length > 0 && (
        <div className="mb-3">
          <div className="mb-2 flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <FileText className="h-3 w-3" />
            关联文档 ({entity.related_docs.length})
          </div>
          <div className="space-y-1">
            {entity.related_docs.slice(0, 3).map((doc: RelatedDocument) => (
              <Button
                key={doc.id}
                size="sm"
                variant="ghost"
                className="h-auto w-full justify-start px-2 py-1 text-sm"
                onClick={() => onDocumentClick?.(doc.id)}
              >
                {doc.topic}
              </Button>
            ))}
            {entity.related_docs.length > 3 && (
              <div className="px-2 text-xs text-muted-foreground">
                还有 {entity.related_docs.length - 3} 个文档...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Deep explore button */}
      <Button size="sm" variant="outline" className="w-full" onClick={onExploreClick}>
        深度探索
      </Button>
    </div>
  );
}
