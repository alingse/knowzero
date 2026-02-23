import { Skeleton } from "@/components/ui/skeleton";
import { FileText } from "lucide-react";

export function DocumentCardSkeleton() {
  return (
    <div className="flex h-32 flex-col rounded-lg border bg-card p-5">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <FileText className="mt-0.5 h-5 w-5 flex-shrink-0 text-muted-foreground/40" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="mt-1 h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    </div>
  );
}

export function DocumentGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <DocumentCardSkeleton key={i} />
      ))}
    </div>
  );
}
