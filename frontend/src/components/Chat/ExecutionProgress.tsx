import { CheckCircle2, Circle, Loader2, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ExecutionEvent {
  id: string;
  type: "node_start" | "node_end" | "tool_start" | "tool_end" | "progress";
  name?: string;
  tool?: string;
  data?: unknown;
  timestamp: number;
}

interface ExecutionProgressProps {
  events: ExecutionEvent[];
  className?: string;
}

export function ExecutionProgress({ events, className }: ExecutionProgressProps) {
  // Get the latest status by grouping related events
  const getActiveItems = () => {
    const active: Record<string, ExecutionEvent> = {};
    const completed: string[] = [];

    for (const event of events) {
      if (event.type === "node_start" || event.type === "tool_start") {
        const key = event.name || event.tool || "unknown";
        active[key] = event;
      } else if (event.type === "node_end" || event.type === "tool_end") {
        const key = event.name || event.tool || "unknown";
        delete active[key];
        completed.push(key);
      }
    }

    return { active, completed };
  };

  const { active, completed } = getActiveItems();

  const activeItems = Object.values(active);
  const hasActivity = activeItems.length > 0 || completed.length > 0;

  if (!hasActivity) {
    return null;
  }

  return (
    <div className={cn("border rounded-lg bg-muted/30 p-3", className)}>
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {activeItems.length > 0 ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            执行中...
          </>
        ) : (
          <>
            <CheckCircle2 className="h-3 w-3 text-green-500" />
            执行完成
          </>
        )}
      </div>

      {/* Active items */}
      {activeItems.length > 0 && (
        <div className="mb-2 space-y-1">
          {activeItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 rounded bg-background px-2 py-1.5 text-xs"
            >
              {item.type === "tool_start" ? (
                <Wrench className="h-3 w-3 text-orange-500" />
              ) : (
                <Circle className="h-3 w-3 animate-pulse text-blue-500" />
              )}
              <span className="flex-1 truncate">
                {item.tool
                  ? `调用工具: ${item.tool}`
                  : item.name || "处理中..."}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Completed items (show last 3) */}
      {completed.length > 0 && (
        <div className="space-y-1">
          <div className="mb-1 text-xs text-muted-foreground">已完成步骤:</div>
          {completed.slice(-3).map((name) => (
            <div
              key={name}
              className="flex items-center gap-2 rounded px-2 py-1 text-xs text-muted-foreground"
            >
              <CheckCircle2 className="h-3 w-3 text-green-500" />
              <span>{name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
