import { Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExecutionEvent } from "./ExecutionProgress";

interface CompactExecutionProgressProps {
  events: ExecutionEvent[];
  className?: string;
}

// 节点名称的友好显示映射
const displayNameMap: Record<string, string> = {
  input_normalizer: "理解输入",
  intent_agent: "分析意图",
  route_agent: "规划处理",
  content_agent: "生成内容",
  planner_agent: "规划学习路径",
  navigator_node: "跳转文档",
  chitchat_agent: "闲聊对话",
  LLM: "AI 思考",
};

function getDisplayName(name: string): string {
  return displayNameMap[name] || name;
}

export function CompactExecutionProgress({ events, className }: CompactExecutionProgressProps) {
  // Get current and completed items
  const getStatus = () => {
    const active: ExecutionEvent[] = [];
    const completed: string[] = [];
    const seen = new Set<string>();

    for (const event of events) {
      const key = event.name || event.tool || "unknown";
      
      if (event.type === "node_start" || event.type === "tool_start") {
        if (!seen.has(key)) {
          active.push(event);
          seen.add(key);
        }
      } else if (event.type === "node_end" || event.type === "tool_end") {
        const index = active.findIndex(e => (e.name || e.tool) === key);
        if (index !== -1) {
          active.splice(index, 1);
        }
        if (!completed.includes(key)) {
          completed.push(key);
        }
      }
    }

    return { active, completed };
  };

  const { active, completed } = getStatus();

  if (active.length === 0 && completed.length === 0) {
    return null;
  }

  // Get the latest active item
  const currentItem = active[active.length - 1];
  
  // Build the status text
  const statusParts: string[] = [];
  
  // Add completed items (limit to last 2)
  if (completed.length > 0) {
    statusParts.push(...completed.slice(-2).map(getDisplayName));
  }
  
  // Add current active item
  if (currentItem) {
    const name = currentItem.tool 
      ? `调用 ${currentItem.tool}`
      : getDisplayName(currentItem.name || "处理中");
    statusParts.push(name);
  }

  if (statusParts.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex items-center gap-1.5 text-xs text-muted-foreground/70 mt-1.5 ml-0.5", className)}>
      {currentItem ? (
        <Loader2 className="h-3 w-3 animate-spin text-primary/70" />
      ) : (
        <CheckCircle2 className="h-3 w-3 text-green-500/70" />
      )}
      <span className="truncate">
        {statusParts.map((part, i) => (
          <span key={i}>
            {i > 0 && (
              <span className="mx-1 text-muted-foreground/40">›</span>
            )}
            <span className={i === statusParts.length - 1 && currentItem ? "text-primary/80" : ""}>
              {part}
            </span>
          </span>
        ))}
      </span>
    </div>
  );
}
