import { cn } from "@/lib/utils";

interface SpinnerProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "muted" | "primary";
}

const sizeClasses = {
  sm: "h-4 w-4 border-2",
  md: "h-5 w-5 border-2",
  lg: "h-6 w-6 border-2",
};

const variantClasses = {
  default: "border-foreground border-t-transparent",
  muted: "border-muted-foreground border-t-transparent",
  primary: "border-primary border-t-transparent",
};

export function Spinner({ className, size = "md", variant = "default" }: SpinnerProps) {
  return (
    <div
      className={cn(
        "animate-spin rounded-full",
        sizeClasses[size],
        variantClasses[variant],
        className
      )}
    />
  );
}
