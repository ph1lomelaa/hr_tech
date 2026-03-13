import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  description?: string;
}

export default function StatCard({ title, value, change, changeType = "neutral", icon: Icon, description }: StatCardProps) {
  return (
    <div className="glass-card p-5 animate-fade-in">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground font-medium">{title}</p>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          {change && (
            <div className="flex items-center gap-1.5">
              <span
                className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                  changeType === "positive"
                    ? "bg-success/10 text-success"
                    : changeType === "negative"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {change}
              </span>
              {description && <span className="text-xs text-muted-foreground">{description}</span>}
            </div>
          )}
        </div>
        <div className="p-2.5 rounded-xl bg-primary/10">
          <Icon className="w-5 h-5 text-primary" />
        </div>
      </div>
    </div>
  );
}
