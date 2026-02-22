import { FileText, Plus, Clock, Wifi, WifiOff, Loader2, AlertCircle } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useSessionStore } from "@/stores/sessionStore";

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

interface SidebarProps {
  className?: string;
  onDocumentSelect?: () => void;
  connectionStatus?: ConnectionStatus;
}

const statusConfig: Record<ConnectionStatus, { 
  icon: React.ReactNode; 
  label: string; 
  color: string;
  animate?: boolean;
}> = {
  connected: { 
    icon: <Wifi className="h-3.5 w-3.5" />, 
    label: "已连接", 
    color: "text-green-600 dark:text-green-400",
    animate: false,
  },
  connecting: { 
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, 
    label: "连接中...", 
    color: "text-amber-600 dark:text-amber-400",
    animate: true,
  },
  disconnected: { 
    icon: <WifiOff className="h-3.5 w-3.5" />, 
    label: "未连接", 
    color: "text-muted-foreground",
    animate: false,
  },
  error: { 
    icon: <AlertCircle className="h-3.5 w-3.5" />, 
    label: "连接错误", 
    color: "text-red-600 dark:text-red-400",
    animate: false,
  },
};

export function Sidebar({ className, onDocumentSelect, connectionStatus = "disconnected" }: SidebarProps) {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();

  const { documents, selectedDocumentId, selectDocument, isStreaming } = useSessionStore();

  const handleNewSession = () => {
    navigate("/");
  };

  const handleDocumentClick = (documentId: number) => {
    // Don't switch if currently streaming
    if (isStreaming) return;
    selectDocument(documentId);
    onDocumentSelect?.();
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    try {
      const normalized = dateString.endsWith("Z") ? dateString : dateString + "Z";
      return format(new Date(normalized), "MM-dd HH:mm", { locale: zhCN });
    } catch {
      return "";
    }
  };

  // Sort documents by creation date (newest first)
  const sortedDocuments = [...documents].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const status = statusConfig[connectionStatus];

  return (
    <aside className={cn("flex h-full w-72 flex-col border-r bg-card", className)}>
      {/* Header */}
      <button
        onClick={handleNewSession}
        className="flex h-14 items-center border-b px-4 w-full hover:bg-accent/50 transition-colors"
      >
        <Logo />
      </button>

      {/* New Session Button */}
      <div className="p-4">
        <Button className="w-full" variant="outline" onClick={handleNewSession}>
          <Plus className="mr-2 h-4 w-4" />
          新会话
        </Button>
      </div>

      <Separator />

      {/* Documents Section */}
      <ScrollArea className="flex-1">
        {/* Current Session Documents */}
        {sessionId && (
          <div className="px-3 py-4">
            <div className="flex items-center gap-2 px-2 py-2 text-sm font-medium text-muted-foreground">
              <FileText className="h-4 w-4" />
              会话文档
              {sortedDocuments.length > 0 && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {sortedDocuments.length}
                </span>
              )}
            </div>

            {sortedDocuments.length === 0 ? (
              <div className="mt-2 px-2 py-3 text-sm text-muted-foreground bg-muted/50 rounded-md">
                <p className="font-medium text-foreground/80">暂无文档</p>
                <p className="mt-1 text-xs">在聊天中生成第一个文档</p>
              </div>
            ) : (
              <div className="mt-2 space-y-1">
                {sortedDocuments.map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => handleDocumentClick(doc.id)}
                    disabled={isStreaming}
                    className={cn(
                      "w-full rounded-md px-2 py-2 text-left text-sm transition-colors",
                      "hover:bg-accent hover:text-accent-foreground",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selectedDocumentId === doc.id
                        ? "bg-accent font-medium text-accent-foreground"
                        : "text-foreground",
                      isStreaming && "cursor-not-allowed opacity-50"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <FileText
                        className={cn(
                          "mt-0.5 h-4 w-4 flex-shrink-0",
                          selectedDocumentId === doc.id ? "text-primary" : "text-muted-foreground"
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate leading-tight">{doc.topic}</p>
                        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>{formatDate(doc.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      <Separator />

      {/* Footer - Connection Status */}
      <div className="p-4">
        <div className={cn(
          "flex items-center gap-2 text-sm",
          status.color
        )}>
          {status.icon}
          <span>{status.label}</span>
        </div>
      </div>
    </aside>
  );
}
