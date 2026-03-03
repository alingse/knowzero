import { FileText, Plus, Wifi, WifiOff, Loader2, AlertCircle } from "lucide-react";
import { useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useSessionStore } from "@/stores/sessionStore";
import { useNavigation } from "@/hooks/useNavigation";
import { DocumentTree } from "./DocumentTree";

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

interface SidebarProps {
  className?: string;
  onDocumentSelect?: () => void;
  connectionStatus?: ConnectionStatus;
}

const statusConfig: Record<
  ConnectionStatus,
  {
    icon: React.ReactNode;
    label: string;
    color: string;
    animate?: boolean;
  }
> = {
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

export function Sidebar({
  className,
  onDocumentSelect,
  connectionStatus = "disconnected",
}: SidebarProps) {
  const { handleNewSession } = useNavigation();
  const { sessionId } = useParams<{ sessionId: string }>();

  const { documents, selectedDocumentId, selectDocument, isStreaming } = useSessionStore();

  const handleDocumentClick = (documentId: number) => {
    // Don't switch if currently streaming
    if (isStreaming) return;
    selectDocument(documentId);
    onDocumentSelect?.();
  };

  const status = statusConfig[connectionStatus];

  return (
    <aside className={cn("hidden h-full w-72 flex-col border-r bg-card md:flex", className)}>
      {/* Header */}
      <button
        onClick={handleNewSession}
        className="flex h-14 w-full items-center border-b px-4 transition-colors hover:bg-accent/50"
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
              {documents.length > 0 && (
                <span className="ml-auto text-xs text-muted-foreground">{documents.length}</span>
              )}
            </div>

            <DocumentTree
              documents={documents}
              selectedDocumentId={selectedDocumentId}
              isStreaming={isStreaming}
              onDocumentSelect={handleDocumentClick}
            />
          </div>
        )}
      </ScrollArea>

      <Separator />

      {/* Footer - Connection Status */}
      <div className="p-4">
        <div className={cn("flex items-center gap-2 text-sm", status.color)}>
          {status.icon}
          <span>{status.label}</span>
        </div>
      </div>
    </aside>
  );
}
