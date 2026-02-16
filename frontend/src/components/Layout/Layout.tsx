import { cn } from "@/lib/utils";

interface LayoutProps {
  children: React.ReactNode;
  className?: string;
}

export function Layout({ children, className }: LayoutProps) {
  return (
    <div className={cn("flex h-screen w-full overflow-hidden bg-background", className)}>
      {children}
    </div>
  );
}

export function MainContent({ children, className }: LayoutProps) {
  return <main className={cn("flex flex-1 flex-col overflow-y-auto", className)}>{children}</main>;
}
