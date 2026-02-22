import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  showText?: boolean;
}

/**
 * KnowZero Logo - Magic Quill Pen
 * SVG source: /public/logo.svg
 */
export function Logo({ className, showText = true }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <img
        src="/logo.svg"
        alt="KnowZero"
        className="h-6 w-6 dark:invert"
      />
      {showText && (
        <span className="font-semibold text-base">KnowZero</span>
      )}
    </div>
  );
}
