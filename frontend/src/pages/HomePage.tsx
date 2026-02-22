import { useMutation } from "@tanstack/react-query";
import { Sparkles, BookOpen, Network, Route, ArrowRight } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { DocumentGrid } from "@/components/DocumentGrid";
import { Input } from "@/components/ui/input";
import { sessionsApi } from "@/api/client";
import { cn } from "@/lib/utils";

// Feature card component
function FeatureCard({
  icon,
  title,
  description,
  delay = 0,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  delay?: number;
}) {
  return (
    <div
      className={cn(
        "group relative p-6 rounded-xl border bg-card/50 backdrop-blur-sm",
        "hover:bg-card hover:shadow-lg hover:shadow-primary/5",
        "transition-all duration-300",
        "opacity-0 animate-fade-in-up"
      )}
      style={{ animationDelay: `${delay}ms`, animationFillMode: "forwards" }}
    >
      <div className="mb-4 inline-flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <h3 className="font-display font-semibold text-lg mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">
        {description}
      </p>
    </div>
  );
}

// Animated background with floating orbs
function AnimatedBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Gradient orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/20 rounded-full blur-3xl animate-float-delayed" />
      <div className="absolute top-1/2 right-1/3 w-64 h-64 bg-secondary/30 rounded-full blur-3xl animate-float-delayed-2" />
      
      {/* Grid pattern overlay */}
      <div 
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />
    </div>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const [topic, setTopic] = useState("");
  const [isFocused, setIsFocused] = useState(false);

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

  const features = [
    {
      icon: <Sparkles className="h-5 w-5" />,
      title: "AI 智能生成",
      description: "输入任何主题，AI 即刻为你生成结构化的学习文档",
    },
    {
      icon: <Network className="h-5 w-5" />,
      title: "知识网络",
      description: "自动提取关键概念，构建可视化的知识关联图谱",
    },
    {
      icon: <Route className="h-5 w-5" />,
      title: "学习路径",
      description: "智能规划学习里程碑，循序渐进掌握新知识",
    },
  ];

  return (
    <div className="min-h-screen relative bg-gradient-to-b from-background via-background to-muted/30">
      {/* Animated Background */}
      <AnimatedBackground />

      {/* Top Navigation Bar */}
      <header className="relative border-b bg-background/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex h-16 items-center px-6">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <Logo size="md" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative px-6 py-16">
        {/* Hero Section */}
        <div className="mx-auto max-w-4xl text-center">
          {/* Logo Animation */}
          <div className="mb-6 inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/20 animate-float">
            <BookOpen className="h-8 w-8 text-white" />
          </div>

          {/* Title */}
          <h1 className="font-display text-5xl md:text-6xl font-bold tracking-tight mb-6">
            从零开始，{" "}
            <span className="gradient-text">构建你的知识网络</span>
          </h1>

          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-12 leading-relaxed">
            KnowZero 是 AI 驱动的交互式学习平台，
            <br className="hidden sm:block" />
            让每一次探索都成为知识的积累
          </p>

          {/* Input Form - Glassmorphism */}
          <form onSubmit={handleSubmit} className="max-w-2xl mx-auto mb-16">
            <div
              className={cn(
                "relative p-2 rounded-2xl transition-all duration-300",
                "bg-card/80 backdrop-blur-xl border shadow-xl",
                isFocused
                  ? "border-primary/50 shadow-primary/10 ring-2 ring-primary/20"
                  : "border-border/50 hover:border-primary/30"
              )}
            >
              <div className="flex items-center gap-3 px-4">
                <Sparkles
                  className={cn(
                    "h-5 w-5 flex-shrink-0 transition-colors",
                    isFocused ? "text-primary" : "text-muted-foreground"
                  )}
                />
                <Input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  placeholder="今天想学习什么主题？例如：量子力学、React Hooks、中国古代史..."
                  className="flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0 text-lg placeholder:text-muted-foreground/60 h-14"
                  disabled={createSession.isPending}
                />
                <Button
                  type="submit"
                  size="lg"
                  disabled={!topic.trim() || createSession.isPending}
                  className={cn(
                    "px-6 h-12 rounded-xl font-medium transition-all",
                    "bg-primary hover:bg-primary/90 text-primary-foreground",
                    "disabled:opacity-50"
                  )}
                >
                  {createSession.isPending ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                      创建中...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      开始学习
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  )}
                </Button>
              </div>
            </div>

            {/* Quick suggestions */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <span className="text-xs text-muted-foreground">热门主题：</span>
              {["Python 入门", "机器学习", "世界历史", "经济学原理"].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setTopic(suggestion)}
                  className="text-xs px-3 py-1 rounded-full bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </form>

          {/* Feature Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-20">
            {features.map((feature, i) => (
              <FeatureCard
                key={feature.title}
                icon={feature.icon}
                title={feature.title}
                description={feature.description}
                delay={i * 100}
              />
            ))}
          </div>
        </div>

        {/* Random Documents Grid */}
        <DocumentGrid />
      </main>

      {/* Footer */}
      <footer className="relative py-8 border-t bg-muted/30">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <p className="text-sm text-muted-foreground">
            © 2025 KnowZero. AI 驱动的知识探索之旅。
          </p>
        </div>
      </footer>

      {/* CSS for fade-in animation */}
      <style>{`
        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.6s ease-out;
        }
      `}</style>
    </div>
  );
}
