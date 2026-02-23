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
    <div className={cn("flex flex-col items-center justify-center p-8 text-center", className)}>
      {icon && <div className="mb-4 text-muted-foreground/60">{icon}</div>}
      <h3 className="font-display mb-2 text-lg font-semibold text-foreground">{title}</h3>
      {description && <p className="mb-6 max-w-sm text-sm text-muted-foreground">{description}</p>}
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

export function EmptyStateCompact({ icon, title, description, className }: EmptyStateCompactProps) {
  return (
    <div className={cn("flex flex-col items-start rounded-lg border border-dashed p-4", className)}>
      <div className="flex items-center gap-3">
        {icon && <div className="text-muted-foreground/60">{icon}</div>}
        <div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>
    </div>
  );
}
