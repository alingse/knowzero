import { cn } from "@/lib/utils";
import { LOGO_SVG_PATHS } from "@/assets/logo-paths";

interface LogoProps {
  className?: string;
  showText?: boolean;
  size?: "sm" | "md" | "lg";
}

/**
 * KnowZero Logo - Magic Quill Pen (Inline SVG)
 * Supports both light and dark modes without color inversion
 */
export function Logo({ className, showText = true, size = "md" }: LogoProps) {
  const sizeClasses = {
    sm: "h-5 w-5",
    md: "h-6 w-6",
    lg: "h-8 w-8",
  };

  const textSizes = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-xl",
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <svg
        className={cn(sizeClasses[size])}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="KnowZero Logo"
      >
        {LOGO_SVG_PATHS}
      </svg>

      {showText && (
        <span
          className={cn(
            "font-display font-semibold text-foreground tracking-tight",
            textSizes[size]
          )}
        >
          KnowZero
        </span>
      )}
    </div>
  );
}

/**
 * Logo Icon only - for compact displays
 */
export function LogoIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cn("h-6 w-6", className)}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="KnowZero Logo"
    >
      {LOGO_SVG_PATHS}
    </svg>
  );
}
