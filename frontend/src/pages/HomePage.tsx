import { useMutation } from "@tanstack/react-query";
import { Sparkles, Network, Route, ArrowRight, Compass, Feather } from "lucide-react";
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
        "group relative rounded-xl border bg-card/80 p-4 backdrop-blur-sm md:p-6",
        "hover:shadow-soft-lg hover:bg-card",
        "card-lift transition-all duration-300",
        "animate-fade-in-up opacity-0"
      )}
      style={{ animationDelay: `${delay}ms`, animationFillMode: "forwards" }}
    >
      {/* Decorative corner */}
      <div className="absolute right-0 top-0 h-16 w-16 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
        <div className="absolute right-3 top-3 h-[1px] w-6 bg-primary/30" />
        <div className="absolute right-3 top-3 h-6 w-[1px] bg-primary/30" />
      </div>

      <div className="bg-primary/8 group-hover:bg-primary/12 mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl text-primary transition-all duration-300 group-hover:scale-110">
        {icon}
      </div>
      <h3 className="font-display mb-2.5 text-lg font-semibold text-foreground md:text-lg">
        {title}
      </h3>
      <p className="text-base leading-relaxed text-muted-foreground md:text-sm">{description}</p>
    </div>
  );
}

// Animated background with subtle paper texture feel
function AnimatedBackground() {
  return (
    <div className="paper-texture pointer-events-none absolute inset-0 overflow-hidden">
      {/* Soft gradient orbs - 柔和的渐变光晕 */}
      <div className="bg-gradient-radial animate-float absolute left-1/4 top-0 h-[600px] w-[600px] rounded-full from-primary/5 via-transparent to-transparent blur-3xl" />
      <div className="bg-gradient-radial animate-float-delayed absolute bottom-0 right-1/4 h-[500px] w-[500px] rounded-full from-accent/5 via-transparent to-transparent blur-3xl" />
      <div className="bg-gradient-radial absolute left-1/2 top-1/2 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full from-secondary/30 via-transparent to-transparent blur-3xl" />

      {/* Subtle grid pattern - 淡雅的网格 */}
      <div
        className="absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage: `linear-gradient(to right, hsl(var(--foreground)) 1px, transparent 1px),
                           linear-gradient(to bottom, hsl(var(--foreground)) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />
    </div>
  );
}

// Decorative line element - 书卷装饰线
function DecorativeLine({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-border" />
      <Feather className="h-4 w-4 text-muted-foreground/40" />
      <div className="h-px flex-1 bg-gradient-to-l from-transparent via-border to-border" />
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
      description: "输入任何主题，AI 即刻为你生成结构化的学习文档，如同拥有一位博学的私人导师",
    },
    {
      icon: <Network className="h-5 w-5" />,
      title: "知识网络",
      description: "自动提取关键概念，构建可视化的知识关联图谱，让知识点连成网络",
    },
    {
      icon: <Route className="h-5 w-5" />,
      title: "学习路径",
      description: "智能规划学习里程碑，循序渐进掌握新知识，从零开始到融会贯通",
    },
  ];

  const suggestions = [
    "Python 入门",
    "机器学习基础",
    "中国古代史",
    "微观经济学",
    "认知心理学",
    "量子物理导论",
  ];

  return (
    <div className="relative min-h-screen bg-background">
      {/* Animated Background */}
      <AnimatedBackground />

      {/* Top Navigation Bar */}
      <header className="relative sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center px-6">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-3 transition-opacity hover:opacity-75"
          >
            <Logo size="md" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative px-4 py-12 md:px-6 md:py-16">
        {/* Hero Section */}
        <div className="mx-auto max-w-4xl text-center">
          {/* Title - 更有书卷气的排版 */}
          <div className="mb-6">
            <h1 className="font-display mb-4 text-5xl font-bold tracking-tight md:text-6xl">
              从零开始， <span className="gradient-text">构建你的知识网络</span>
            </h1>
          </div>

          <p className="mx-auto mb-12 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
            KnowZero 将 AI 的智慧与学习的艺术融为一体，
            <br className="hidden sm:block" />
            陪伴你在知识的海洋中从容探索
          </p>

          {/* Input Form - 优雅的玻璃态 */}
          <form onSubmit={handleSubmit} className="mx-auto mb-12 max-w-2xl">
            <div
              className={cn(
                "relative rounded-2xl p-2 transition-all duration-300",
                "shadow-soft-lg border bg-card/90 backdrop-blur-xl",
                isFocused
                  ? "shadow-soft-lg border-primary/30 ring-1 ring-primary/10"
                  : "border-border/60 hover:border-primary/20"
              )}
            >
              <div className="flex items-center gap-3 px-4">
                <Compass
                  className={cn(
                    "h-5 w-5 flex-shrink-0 transition-colors duration-300",
                    isFocused ? "text-primary" : "text-muted-foreground/60"
                  )}
                />
                <Input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  placeholder="今天想探索什么主题？"
                  className="h-14 flex-1 border-0 bg-transparent text-lg shadow-none placeholder:text-muted-foreground/50 focus-visible:ring-0"
                  disabled={createSession.isPending}
                />
                <Button
                  type="submit"
                  size="lg"
                  disabled={!topic.trim() || createSession.isPending}
                  className={cn(
                    "h-12 rounded-xl px-4 py-3 font-medium transition-all duration-300 md:px-6",
                    "bg-primary text-primary-foreground hover:bg-primary/90",
                    "shadow-soft disabled:opacity-50"
                  )}
                >
                  {createSession.isPending ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                      准备中...
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

            {/* Quick suggestions - 标签样式 */}
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <span className="mr-1 text-xs text-muted-foreground/70">探索：</span>
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setTopic(suggestion)}
                  className="rounded-full border border-transparent bg-secondary/70 px-3 py-1.5 text-xs text-secondary-foreground transition-colors duration-200 hover:border-border hover:bg-secondary"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </form>

          {/* Decorative Line */}
          <DecorativeLine className="mx-auto mb-12 max-w-xs opacity-60" />

          {/* Feature Cards */}
          <div className="mb-16 grid grid-cols-1 gap-4 md:mb-20 md:grid-cols-3 md:gap-5">
            {features.map((feature, i) => (
              <FeatureCard
                key={feature.title}
                icon={feature.icon}
                title={feature.title}
                description={feature.description}
                delay={i * 150}
              />
            ))}
          </div>
        </div>

        {/* Random Documents Grid */}
        <DocumentGrid />
      </main>

      {/* Footer - 简洁优雅 */}
      <footer className="relative border-t border-border/50 bg-secondary/20 py-8 md:py-10">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <div className="flex items-center gap-2 text-muted-foreground/60">
              <Feather className="h-4 w-4" />
              <span className="text-xs md:text-sm">书卷多情似故人，晨昏忧乐每相亲</span>
            </div>
            <p className="text-xs text-muted-foreground/50 md:text-sm">
              © 2026 KnowZero · AI 驱动的知识探索
            </p>
          </div>
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
          animation: fade-in-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        
        .bg-gradient-radial {
          background: radial-gradient(circle, var(--tw-gradient-from) 0%, var(--tw-gradient-via) 50%, var(--tw-gradient-to) 100%);
        }
      `}</style>
    </div>
  );
}
