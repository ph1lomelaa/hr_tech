import { AlertTriangle, CheckCircle2, Target, Sparkles, ArrowRight, Info } from "lucide-react";
import { Link } from "react-router-dom";
import StatCard from "@/components/StatCard";
import GoalCard from "@/components/GoalCard";
import { myGoalSummary, myGoals, mySuggestions } from "@/data/mockEmployee";
import { managerOwnGoals } from "@/data/mockManager";
import { employeeAlerts } from "@/data/mockAlerts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const statusColors: Record<string, string> = {
  approved: "bg-success/10 text-success",
  review: "bg-warning/10 text-warning",
  draft: "bg-muted text-muted-foreground",
  rejected: "bg-destructive/10 text-destructive",
};
const statusLabels: Record<string, string> = {
  approved: "Утверждена",
  review: "На согласовании",
  draft: "Черновик",
  rejected: "Отклонена",
};

export default function EmployeeDashboard() {
  const managerApprovedGoals = managerOwnGoals.filter((g) => g.status === "approved");

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Мой обзор</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Состояние целей, качество и рекомендации AI · {myGoalSummary.quarter}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Target} title="Мои цели" value={String(myGoalSummary.totalGoals)} change={`Вес ${myGoalSummary.weightSum}%`} changeType={myGoalSummary.weightSum === 100 ? "positive" : "negative"} />
        <StatCard icon={CheckCircle2} title="Утверждено" value={String(myGoalSummary.approved)} change={`На согласовании ${myGoalSummary.review}`} />
        <StatCard icon={Sparkles} title="Средний SMART" value={myGoalSummary.avgSmart.toFixed(2)} change={`Стратегич. ${myGoalSummary.strategicShare}%`} />
        <StatCard icon={AlertTriangle} title="Алерты" value={String(employeeAlerts.length)} change="Требуют действий" changeType="negative" />
      </div>

      {/* Manager goals banner — cascading context */}
      <div className="glass-card p-5 border-primary/20">
        <div className="flex items-start gap-3 mb-4">
          <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold">Цели руководителя — контекст для ваших целей</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ваши цели должны поддерживать цели руководителя. Используйте их как ориентир при создании и генерации целей.
            </p>
          </div>
          <Button asChild variant="ghost" size="sm" className="gap-1 text-xs shrink-0 ml-auto">
            <Link to="/employee/generate">AI-подбор <ArrowRight className="w-3 h-3" /></Link>
          </Button>
        </div>
        <div className="space-y-2">
          {managerApprovedGoals.map((g) => (
            <div key={g.id} className="flex items-start justify-between gap-3 p-3 rounded-lg bg-muted/40">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground mb-1">Васильев Игорь · Руководитель отдела продаж</p>
                <p className="text-sm text-muted-foreground line-clamp-2">{g.text}</p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Badge variant="outline" className={`text-[10px] ${statusColors[g.status]}`}>{statusLabels[g.status]}</Badge>
                <span className="text-xs text-muted-foreground font-mono">SMART {g.smartIndex.toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-4">
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold mb-3">Мои цели</h3>
            <div className="space-y-3">
              {myGoals.map((goal) => (
                <GoalCard key={goal.id} goal={goal} />
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-3">AI рекомендации</h3>
            <div className="space-y-3 text-sm text-muted-foreground">
              {mySuggestions.slice(0, 2).map((s) => (
                <div key={s.id} className="border-b border-border/40 pb-2">
                  <Badge variant="outline" className="text-[10px]">{s.goalType === "impact" ? "Impact" : s.goalType === "output" ? "Output" : "Activity"}</Badge>
                  <p className="mt-2">{s.text}</p>
                  <p className="text-xs text-muted-foreground mt-2">Источник: {s.source}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-3">Алерты</h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              {employeeAlerts.map((alert) => (
                <div key={alert.id} className="flex items-start gap-2">
                  <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${alert.severity === "high" ? "text-destructive" : "text-warning"}`} />
                  <span>{alert.title}: {alert.description}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
