import { Skeleton } from "@/components/ui/skeleton";
import { FileText } from "lucide-react";

export function DocumentCardSkeleton() {
  return (
    <div className="p-5 rounded-lg border bg-card h-32 flex flex-col">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <FileText className="h-5 w-5 text-muted-foreground/40 mt-0.5 flex-shrink-0" />
        <div className="min-w-0 flex-1 flex flex-col gap-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-full mt-1" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    </div>
  );
}

export function DocumentGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <DocumentCardSkeleton key={i} />
      ))}
    </div>
  );
}
