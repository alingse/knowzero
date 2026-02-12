import { BookOpen, FolderTree, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const navigate = useNavigate();

  const handleNewSession = () => {
    navigate("/");
  };
  return (
    <aside
      className={cn(
        "flex h-full w-72 flex-col border-r bg-card",
        className
      )}
    >
      {/* Header */}
      <div className="flex h-14 items-center border-b px-4">
        <BookOpen className="mr-2 h-5 w-5 text-primary" />
        <span className="font-semibold">KnowZero</span>
      </div>

      {/* New Session Button */}
      <div className="p-4">
        <Button
          className="w-full"
          variant="outline"
          onClick={handleNewSession}
        >
          <Plus className="mr-2 h-4 w-4" />
          新会话
        </Button>
      </div>

      <Separator />

      {/* Category Tree */}
      <ScrollArea className="flex-1 px-3 py-4">
        <div className="flex items-center gap-2 px-2 py-2 text-sm font-medium text-muted-foreground">
          <FolderTree className="h-4 w-4" />
          知识库
        </div>
        
        {/* Placeholder for category tree */}
        <div className="mt-2 space-y-1">
          <div className="rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer">
            前端
          </div>
          <div className="rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer">
            后端
          </div>
          <div className="rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer">
            算法
          </div>
        </div>
      </ScrollArea>

      <Separator />

      {/* Footer */}
      <div className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          已连接
        </div>
      </div>
    </aside>
  );
}
