import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

// Icon type: accepts React elements (typically Lucide icons) for better type safety
// while maintaining flexibility for custom icon components
type IconElement = React.ReactElement<React.SVGProps<SVGSVGElement>>;

interface EmptyStateProps {
  icon?: IconElement;
  title: string;
  description?: string;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center p-8",
        className
      )}
    >
      {icon && (
        <div className="mb-4 text-muted-foreground/60">
          {icon}
        </div>
      )}
      <h3 className="font-display text-lg font-semibold text-foreground mb-2">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-sm mb-6">
          {description}
        </p>
      )}
      {(action || secondaryAction) && (
        <div className="flex items-center gap-3">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}

interface EmptyStateCompactProps {
  icon?: IconElement;
  title: string;
  description?: string;
  className?: string;
}

export function EmptyStateCompact({
  icon,
  title,
  description,
  className,
}: EmptyStateCompactProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-start p-4 rounded-lg border border-dashed",
        className
      )}
    >
      <div className="flex items-center gap-3">
        {icon && (
          <div className="text-muted-foreground/60">
            {icon}
          </div>
        )}
        <div>
          <p className="font-medium text-sm text-foreground">{title}</p>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
      </div>
    </div>
  );
}
