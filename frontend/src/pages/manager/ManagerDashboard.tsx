import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Clock, CheckCircle2, TrendingUp, AlertTriangle, ArrowRight } from "lucide-react";
import { teamGoals, teamMembers, managerAlerts, managerOwnGoals } from "@/data/mockManager";

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

export default function ManagerDashboard() {
  const pendingGoals = teamGoals.filter((g) => g.status === "review");
  const approvedCount = teamGoals.filter((g) => g.status === "approved").length;
  const teamAvgSmart = teamMembers.filter((m) => m.avgSmart > 0).reduce((s, m) => s + m.avgSmart, 0) /
    teamMembers.filter((m) => m.avgSmart > 0).length;
  const noGoalsCount = teamMembers.filter((m) => m.goalsCount === 0).length;

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Дашборд команды</h1>
        <p className="text-sm text-muted-foreground mt-1">Отдел продаж · Q1 2026</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground">Сотрудников</span>
          </div>
          <p className="text-2xl font-bold">{teamMembers.length}</p>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-warning" />
            <span className="text-xs text-muted-foreground">На согласовании</span>
          </div>
          <p className="text-2xl font-bold text-warning">{pendingGoals.length}</p>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground">Средний SMART</span>
          </div>
          <p className="text-2xl font-bold">{teamAvgSmart.toFixed(2)}</p>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4 text-success" />
            <span className="text-xs text-muted-foreground">Утверждено</span>
          </div>
          <p className="text-2xl font-bold text-success">{approvedCount}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
        {/* Pending approval */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Ожидают согласования</h3>
            <Button asChild variant="ghost" size="sm" className="gap-1 text-xs">
              <Link to="/manager/team-goals">Все цели <ArrowRight className="w-3 h-3" /></Link>
            </Button>
          </div>
          {pendingGoals.length === 0 && (
            <p className="text-sm text-muted-foreground">Нет целей на согласовании</p>
          )}
          <div className="space-y-3">
            {pendingGoals.map((goal) => (
              <div key={goal.id} className="flex items-start justify-between gap-3 p-3 rounded-lg bg-muted/40">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">{goal.employeeName} · {goal.position}</p>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{goal.text}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline" className={`text-[10px] ${goal.smartIndex < 0.6 ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"}`}>
                      SMART {goal.smartIndex.toFixed(2)}
                    </Badge>
                  </div>
                </div>
                <Button asChild size="sm" variant="outline" className="shrink-0">
                  <Link to={`/manager/team-goals/${goal.id}`}>Открыть</Link>
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Team members + alerts */}
        <div className="space-y-4">
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Состав команды</h3>
              {noGoalsCount > 0 && (
                <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning">
                  {noGoalsCount} без целей
                </Badge>
              )}
            </div>
            <div className="space-y-2">
              {teamMembers.map((m) => (
                <div key={m.id} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium text-xs">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{m.position}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    {m.goalsCount === 0 ? (
                      <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive">Нет целей</Badge>
                    ) : (
                      <>
                        <span className="text-muted-foreground">{m.goalsCount} цел.</span>
                        {m.pendingCount > 0 && (
                          <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning">{m.pendingCount} ожид.</Badge>
                        )}
                        <span className={`font-mono ${m.avgSmart < 0.6 ? "text-destructive" : "text-success"}`}>{m.avgSmart.toFixed(2)}</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-3">Алерты</h3>
            <div className="space-y-2">
              {managerAlerts.map((a) => (
                <div key={a.id} className="flex items-start gap-2 text-sm">
                  <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${a.severity === "high" ? "text-destructive" : "text-warning"}`} />
                  <div>
                    <p className="text-xs font-medium">{a.title}</p>
                    <p className="text-xs text-muted-foreground">{a.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* My own goals */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">Мои цели (каскадируются на команду)</h3>
          <Button asChild variant="ghost" size="sm" className="gap-1 text-xs">
            <Link to="/manager/my-goals">Управлять <ArrowRight className="w-3 h-3" /></Link>
          </Button>
        </div>
        <div className="space-y-2">
          {managerOwnGoals.map((g) => (
            <div key={g.id} className="flex items-start justify-between gap-3 p-3 rounded-lg bg-muted/40">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-muted-foreground line-clamp-2">{g.text}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="outline" className={`text-[10px] ${statusColors[g.status]}`}>{statusLabels[g.status]}</Badge>
                  <span className="text-xs text-muted-foreground font-mono">SMART {g.smartIndex.toFixed(2)}</span>
                  <span className="text-xs text-muted-foreground">Вес {g.weight}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
