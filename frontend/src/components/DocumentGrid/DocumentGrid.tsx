import { RefreshCw, BookOpen, Compass } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { documentsApi } from "@/api/client";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/EmptyState";
import { DocumentCard } from "./DocumentCard";
import { DocumentGridSkeleton } from "./DocumentCardSkeleton";

export function DocumentGrid() {
  const navigate = useNavigate();
  const { data, isLoading, refetch, isError } = useQuery({
    queryKey: ["random-documents"],
    queryFn: () => documentsApi.getRandom(8),
  });

  return (
    <div className="w-full max-w-6xl mx-auto mt-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Compass className="h-5 w-5 text-primary" />
          <h2 className="font-display text-xl font-semibold">探索更多内容</h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
          className="gap-2"
        >
          <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          换一批
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        // Loading State
        <DocumentGridSkeleton count={8} />
      ) : isError ? (
        // Error State
        <EmptyState
          icon={<BookOpen className="h-12 w-12" />}
          title="加载失败"
          description="无法获取文档列表，请稍后重试"
          action={
            <Button onClick={() => refetch()} variant="outline">
              重新加载
            </Button>
          }
        />
      ) : data?.length === 0 ? (
        // Empty State
        <div className="rounded-xl border border-dashed bg-muted/30 p-12">
          <EmptyState
            icon={<BookOpen className="h-12 w-12" />}
            title="还没有文档"
            description="成为第一个创建学习文档的人吧！"
            action={
              <Button onClick={() => navigate("/")}>
                开始创建
              </Button>
            }
          />
        </div>
      ) : (
        // Data Display
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {data?.map((doc) => (
            <DocumentCard key={doc.id} document={doc} />
          ))}
        </div>
      )}
    </div>
  );
}
