import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick?: () => void; href?: string };
}

export default function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="state-panel flex flex-col items-center justify-center gap-3 py-14 px-6 text-center animate-fade-in">
      {Icon && (
        <div className="p-4 rounded-2xl bg-muted/50">
          <Icon className="h-10 w-10 text-muted-foreground/40" />
        </div>
      )}
      <div className="space-y-1 max-w-xs">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description && <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>}
      </div>
      {action && (
        action.href ? (
          <Button variant="outline" size="sm" asChild className="mt-1">
            <Link to={action.href}>{action.label}</Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="mt-1" onClick={action.onClick}>
            {action.label}
          </Button>
        )
      )}
    </div>
  );
}
