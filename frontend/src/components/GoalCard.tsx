import { Badge } from "@/components/ui/badge";
import { SmartScoreGroup } from "@/components/SmartScoreBar";
import { ArrowUpRight, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useRole } from "@/context/RoleContext";
import AnalyzingBar from "@/components/AnalyzingBar";

interface GoalCardProps {
  goal: {
    id: string;
    employeeName: string;
    position: string;
    department: string;
    text: string;
    status: "draft" | "review" | "approved" | "rejected";
    smartIndex: number;
    smartScores: { key: string; label: string; value: number }[];
    hasScores?: boolean;
    linkType: "strategic" | "functional" | "operational";
    quarter: string;
    weight: number;
    goalType?: "activity" | "output" | "impact";
    source?: string;
  };
  onDelete?: () => void;
}

const statusConfig: Record<string, { label: string; className: string; accent: string }> = {
  draft:    { label: "Черновик",         className: "bg-muted text-muted-foreground",                    accent: "hsl(var(--muted-foreground) / 0.5)" },
  review:   { label: "На согласовании",  className: "bg-warning/10 text-warning border-warning/20",      accent: "hsl(var(--warning))" },
  approved: { label: "Утверждена",       className: "bg-success/10 text-success border-success/20",      accent: "hsl(var(--success))" },
  rejected: { label: "Отклонена",        className: "bg-destructive/10 text-destructive border-destructive/20", accent: "hsl(var(--destructive))" },
};

const linkConfig: Record<string, { label: string; className: string }> = {
  strategic:   { label: "Стратегическая", className: "bg-info/10 text-info border-info/20" },
  functional:  { label: "Функциональная", className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" },
  operational: { label: "Операционная",   className: "bg-muted text-muted-foreground border-border/60" },
};

const goalTypeConfig: Record<string, { label: string; className: string }> = {
  activity: { label: "Действие",  className: "bg-warning/10 text-warning border-warning/20" },
  output:   { label: "Результат", className: "bg-success/10 text-success border-success/20" },
  impact:   { label: "Влияние",   className: "bg-info/10 text-info border-info/20" },
};

function SmartGauge({ index }: { index: number }) {
  const pct = Math.round(index * 100);
  const circumference = 2 * Math.PI * 15.9155;
  const strokeDash = (pct / 100) * circumference;
  const color = index >= 0.7 ? "hsl(var(--success))" : index >= 0.4 ? "hsl(var(--warning))" : "hsl(var(--destructive))";

  return (
    <div className="relative w-14 h-14 shrink-0">
      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
        <circle cx="18" cy="18" r="15.9155" fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
        <circle
          cx="18" cy="18" r="15.9155"
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${strokeDash} ${circumference}`}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-[11px] font-mono font-bold"
        style={{ color }}
      >
        {pct}
      </span>
    </div>
  );
}

export default function GoalCard({ goal, onDelete }: GoalCardProps) {
  const { role } = useRole();
  const status = statusConfig[goal.status];
  const link = linkConfig[goal.linkType];
  const type = goal.goalType ? goalTypeConfig[goal.goalType] : null;
  const detailPath =
    role === "employee" ? `/employee/goals/${goal.id}` :
    role === "manager" ? `/manager/team-goals/${goal.id}` :
    `/hr/goals/${goal.id}`;

  return (
    <div className="glass-card-elevated group animate-fade-in relative overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_48px_rgba(15,23,42,0.14)]">
      {/* Left status accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-[inherit]"
        style={{ backgroundColor: status.accent }}
      />

      <div className="p-6 pl-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={status.className}>
                {status.label}
              </Badge>
              <Badge variant="outline" className={link.className}>
                {link.label}
              </Badge>
              {type && (
                <Badge variant="outline" className={type.className}>
                  {type.label}
                </Badge>
              )}
              <span className="section-label ml-auto">{goal.quarter}</span>
            </div>

            {role !== "employee" && (
              <div className="mt-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/15 shrink-0">
                  <span className="text-sm font-bold text-primary">
                    {goal.employeeName.split(" ").map((p) => p[0]).join("").slice(0, 2)}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{goal.employeeName}</p>
                  <p className="truncate text-xs font-medium text-foreground/60">
                    {goal.position} · {goal.department}
                  </p>
                </div>
              </div>
            )}

            <p className="mt-4 text-lg font-semibold leading-7 text-foreground">
              {goal.text}
            </p>

            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted/70 text-xs font-semibold text-foreground/75 border border-border/60">
                {goal.quarter}
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted/70 text-xs font-semibold text-foreground/75 border border-border/60">
                {goal.weight}%
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted/70 text-xs font-semibold text-foreground/75 border border-border/60">
                {link.label}
              </span>
            </div>

            {goal.source && (
              <div className="mt-4 rounded-xl border border-border/60 bg-muted/25 px-4 py-3">
                <div className="flex items-center gap-2 section-label mb-2">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Источник связки
                </div>
                <p className="text-sm text-foreground/85">{goal.source}</p>
              </div>
            )}

            <div className="mt-5 flex items-center gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:translate-x-2 sm:group-hover:translate-x-0 transition-all duration-200">
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" asChild>
                <Link to={detailPath}>
                  <ArrowUpRight className="w-3 h-3" /> Подробнее
                </Link>
              </Button>
              {onDelete && goal.status === "draft" && (
                <Button
                  variant="ghost" size="sm"
                  className="h-7 text-xs gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={(e) => { e.preventDefault(); onDelete(); }}
                >
                  <Trash2 className="w-3 h-3" /> Удалить
                </Button>
              )}
            </div>
          </div>

          <div className="w-full shrink-0 rounded-2xl border border-border/65 bg-muted/20 p-4 xl:w-56">
            {goal.hasScores ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <span className="section-label">SMART</span>
                  <SmartGauge index={goal.smartIndex} />
                </div>
                <SmartScoreGroup scores={goal.smartScores} />
              </>
            ) : (
              <Link to={detailPath} className="flex flex-col gap-3 py-2 group/scan cursor-pointer">
                <div className="flex items-center gap-2">
                  <span className="section-label">SMART</span>
                  <span className="ml-auto text-[10px] text-primary/60 font-medium group-hover/scan:text-primary transition-colors">
                    Открыть →
                  </span>
                </div>
                <p className="text-xs font-semibold text-foreground/80">Идёт анализ цели</p>
                <AnalyzingBar />
                <p className="text-[11px] text-muted-foreground/65 leading-relaxed">
                  Нажмите, чтобы просмотреть цель и запустить оценку
                </p>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
