import { LucideIcon } from "lucide-react";
import AnimatedNumber from "./AnimatedNumber";

interface StatCardProps {
  title: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  description?: string;
}

export default function StatCard({ title, value, change, changeType = "neutral", icon: Icon, description }: StatCardProps) {
  // Try to parse numeric value for animation
  const numericValue = parseFloat(value.replace(/[^0-9.]/g, ""));
  const isNumeric = !isNaN(numericValue) && value.trim() !== "";
  const suffix = isNumeric ? value.replace(/[0-9.]/g, "") : "";
  const decimals = value.includes(".") ? (value.split(".")[1]?.replace(/[^0-9]/g, "").length ?? 0) : 0;

  return (
    <div className="glass-card-elevated glass-card-accent p-5 animate-fade-in transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2 min-w-0 flex-1">
          <p className="section-label">{title}</p>
          <p className="text-3xl font-bold tracking-tight font-display">
            {isNumeric ? (
              <>
                <AnimatedNumber value={numericValue} decimals={decimals} duration={700} />
                {suffix && <span>{suffix}</span>}
              </>
            ) : (
              value
            )}
          </p>
          {change && (
            <div className="flex items-center gap-1.5">
              <span
                className={`text-xs font-semibold px-1.5 py-0.5 rounded-md ${
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
        <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/15 shrink-0">
          <Icon className="w-5 h-5 text-primary" />
        </div>
      </div>
    </div>
  );
}
