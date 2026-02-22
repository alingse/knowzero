import { useMutation } from "@tanstack/react-query";
import { BookOpen, Sparkles } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { DocumentGrid } from "@/components/DocumentGrid";
import { Input } from "@/components/ui/input";
import { sessionsApi } from "@/api/client";

export function HomePage() {
  const navigate = useNavigate();
  const [topic, setTopic] = useState("");

  const createSession = useMutation({
    mutationFn: sessionsApi.create,
    onSuccess: (session, variables) => {
      // Pass initial query via navigate state
      navigate(`/session/${session.id}`, {
        state: { initialQuery: variables.title },
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;
    createSession.mutate({
      title: topic.trim(),
      description: `学习主题: ${topic.trim()}`,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      {/* Top Navigation Bar */}
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex h-16 items-center px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
              <BookOpen className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold">KnowZero</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-6 py-12">
        <div className="mx-auto max-w-5xl text-center">
          {/* Title */}
          <h1 className="mb-4 text-4xl font-bold tracking-tight">
            欢迎来到 <span className="text-primary">KnowZero</span>
          </h1>
          <p className="mb-8 text-lg text-muted-foreground">
            AI 驱动的交互式学习平台，从零开始构建你的知识网络
          </p>

          {/* Input Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-2xl mx-auto">
            <div className="relative">
              <Sparkles className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="今天想学习什么主题？例如：React Hooks"
                className="h-14 pl-12 pr-4 text-lg shadow-sm"
                disabled={createSession.isPending}
              />
            </div>
            <Button
              type="submit"
              size="lg"
              className="h-12 text-lg"
              disabled={!topic.trim() || createSession.isPending}
            >
              {createSession.isPending ? "创建中..." : "开始学习"}
            </Button>
          </form>
        </div>

        {/* Random Documents Grid */}
        <DocumentGrid />
      </main>
    </div>
  );
}
