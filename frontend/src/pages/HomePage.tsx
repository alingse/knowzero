import { useMutation } from "@tanstack/react-query";
import { BookOpen, Sparkles } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-background to-muted/20 px-4">
      <div className="mx-auto max-w-2xl text-center">
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <BookOpen className="h-8 w-8" />
          </div>
        </div>

        {/* Title */}
        <h1 className="mb-4 text-4xl font-bold tracking-tight">
          欢迎来到 <span className="text-primary">KnowZero</span>
        </h1>
        <p className="mb-8 text-lg text-muted-foreground">
          AI 驱动的交互式学习平台，从零开始构建你的知识网络
        </p>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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

        {/* Features */}
        <div className="mt-16 grid grid-cols-3 gap-8 text-center">
          <div>
            <div className="mb-2 text-2xl font-semibold">🎯</div>
            <p className="text-sm text-muted-foreground">个性化学习路径</p>
          </div>
          <div>
            <div className="mb-2 text-2xl font-semibold">💡</div>
            <p className="text-sm text-muted-foreground">智能追问引导</p>
          </div>
          <div>
            <div className="mb-2 text-2xl font-semibold">📚</div>
            <p className="text-sm text-muted-foreground">知识网络构建</p>
          </div>
        </div>
      </div>
    </div>
  );
}
