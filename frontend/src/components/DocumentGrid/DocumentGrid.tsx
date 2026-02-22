import { RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { documentsApi } from "@/api/client";
import { cn } from "@/lib/utils";
import { DocumentCard } from "./DocumentCard";

export function DocumentGrid() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["random-documents"],
    queryFn: () => documentsApi.getRandom(8),
  });

  return (
    <div className="w-full max-w-6xl mx-auto mt-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">探索更多内容</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {data?.map((doc) => (
          <DocumentCard key={doc.id} document={doc} />
        ))}
      </div>
    </div>
  );
}
