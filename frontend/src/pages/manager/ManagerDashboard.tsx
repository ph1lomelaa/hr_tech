import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import StatCard from "@/components/StatCard";
import { Users, Clock, CheckCircle2, TrendingUp, AlertTriangle, ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import { api, toGoalCard } from "@/lib/api";
import { useCurrentEmployee } from "@/hooks/use-current-employee";
import { getCurrentQuarterYear } from "@/lib/date";

const statusColors: Record<string, string> = {
  approved: "bg-success/10 text-success",
  pending: "bg-warning/10 text-warning",
  review: "bg-warning/10 text-warning",
  draft: "bg-muted text-muted-foreground",
  rejected: "bg-destructive/10 text-destructive",
};

const statusLabels: Record<string, string> = {
  approved: "Утверждена",
  pending: "На согласовании",
  review: "На согласовании",
  draft: "Черновик",
  rejected: "Отклонена",
};

export default function ManagerDashboard() {
  const { employeeId, detail } = useCurrentEmployee();
  const { quarter, year } = getCurrentQuarterYear();
  const managerDepartment = detail?.department ?? "";

  const { data: employees = [] } = useQuery({
    queryKey: ["employees", employeeId],
    queryFn: () => api.employees.list(),
    enabled: !!employeeId,
    staleTime: 60_000,
  });

  const { data: goals = [] } = useQuery({
    queryKey: ["goals", employeeId],
    queryFn: () => api.goals.list({ limit: 500 }),
    enabled: !!employeeId,
    staleTime: 30_000,
  });

  const { data: myGoals = [] } = useQuery({
    queryKey: ["employee-goals", employeeId, quarter, year],
    queryFn: () => api.employees.goals(employeeId!, { quarter, year }),
    enabled: !!employeeId,
    staleTime: 30_000,
  });

  const { data: alerts = [] } = useQuery({
    queryKey: ["manager-alerts", employeeId],
    queryFn: () => api.employees.alerts(employeeId!),
    enabled: !!employeeId,
    staleTime: 30_000,
  });

  const teamEmployees = useMemo(() => {
    return managerDepartment
      ? employees.filter((e) => e.department === managerDepartment)
      : employees;
  }, [employees, managerDepartment]);

  const teamGoals = useMemo(() => {
    return managerDepartment
      ? goals.filter((g) => g.department === managerDepartment)
      : goals;
  }, [goals, managerDepartment]);

  const pendingGoals = teamGoals.filter((g) => g.status === "pending");
  const approvedCount = teamGoals.filter((g) => g.status === "approved").length;
  const teamAvgSmart = teamGoals.length > 0
    ? teamGoals.reduce((s, g) => s + (g.smart_index ?? 0.5), 0) / teamGoals.length
    : 0;

  const teamMembers = useMemo(() => {
    const byEmployee: Record<string, typeof teamGoals> = {};
    teamGoals.forEach((g) => {
      const id = g.employee_id;
      if (!byEmployee[id]) byEmployee[id] = [];
      byEmployee[id].push(g);
    });
    return teamEmployees.map((e) => {
      const eg = byEmployee[e.id] ?? [];
      const goalsCount = eg.length;
      const pendingCount = eg.filter((g) => g.status === "pending").length;
      const avgSmart = goalsCount > 0
        ? eg.reduce((s, g) => s + (g.smart_index ?? 0.5), 0) / goalsCount
        : 0;
      return {
        id: e.id,
        name: e.full_name,
        position: e.position ?? "—",
        goalsCount,
        pendingCount,
        avgSmart,
      };
    });
  }, [teamEmployees, teamGoals]);

  const noGoalsCount = teamMembers.filter((m) => m.goalsCount === 0).length;
  const myGoalCards = myGoals.map(toGoalCard);

  // Аналитика по команде
  const teamAnalytics = useMemo(() => {
    const total = teamGoals.length;
    const byStatus = {
      draft:    teamGoals.filter((g) => g.status === "draft").length,
      pending:  teamGoals.filter((g) => g.status === "pending").length,
      approved: teamGoals.filter((g) => g.status === "approved").length,
      rejected: teamGoals.filter((g) => g.status === "rejected").length,
    };
    const smartBuckets = {
      good:      teamGoals.filter((g) => (g.smart_index ?? 0) >= 0.7).length,
      needs_work: teamGoals.filter((g) => { const s = g.smart_index ?? 0; return s >= 0.6 && s < 0.7; }).length,
      critical:  teamGoals.filter((g) => (g.smart_index ?? 0) < 0.6).length,
    };
    const coveredMembers = teamMembers.filter((m) => m.goalsCount > 0).length;
    const approvalRate = total > 0 ? Math.round((byStatus.approved / total) * 100) : 0;
    return { total, byStatus, smartBuckets, coveredMembers, approvalRate };
  }, [teamGoals, teamMembers]);

  const [alertsExpanded, setAlertsExpanded] = useState(false);
  const [myGoalsExpanded, setMyGoalsExpanded] = useState(false);
  const ALERTS_PREVIEW = 2;
  const MY_GOALS_PREVIEW = 3;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Дашборд команды</h1>
        <p className="text-xs text-muted-foreground mt-1">
          {managerDepartment ? managerDepartment : "Все подразделения"} · {quarter} {year}
        </p>
      </div>

      <motion.div
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
        initial="hidden"
        animate="visible"
        variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}
      >
        {[
          { icon: Users, title: "Сотрудников", value: String(teamEmployees.length) },
          { icon: Clock, title: "На согласовании", value: String(pendingGoals.length) },
          { icon: TrendingUp, title: "Средний SMART", value: teamAvgSmart.toFixed(2) },
          { icon: CheckCircle2, title: "Утверждено", value: String(approvedCount) },
        ].map(({ icon, title, value }) => (
          <motion.div
            key={title}
            variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } } }}
          >
            <StatCard icon={icon} title={title} value={value} />
          </motion.div>
        ))}
      </motion.div>

      {/* Аналитика команды */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Статусы целей */}
        <div className="glass-card-elevated p-4 space-y-3">
          <p className="text-sm font-semibold">Статусы целей команды</p>
          {teamAnalytics.total === 0 ? (
            <p className="text-xs text-muted-foreground">Целей нет</p>
          ) : (
            <div className="space-y-2">
              {[
                { label: "Утверждено",        count: teamAnalytics.byStatus.approved, color: "bg-success" },
                { label: "На согласовании",   count: teamAnalytics.byStatus.pending,  color: "bg-warning" },
                { label: "Черновик",          count: teamAnalytics.byStatus.draft,    color: "bg-muted-foreground/40" },
                { label: "Отклонено",         count: teamAnalytics.byStatus.rejected, color: "bg-destructive" },
              ].map(({ label, count, color }) => (
                <div key={label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-mono">{count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full rounded-full ${color}`} style={{ width: `${teamAnalytics.total > 0 ? (count / teamAnalytics.total) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SMART-распределение */}
        <div className="glass-card-elevated p-4 space-y-3">
          <p className="text-sm font-semibold">SMART-качество команды</p>
          {teamAnalytics.total === 0 ? (
            <p className="text-xs text-muted-foreground">Целей нет</p>
          ) : (
            <div className="space-y-2">
              {[
                { label: "Хорошие (≥0.7)",     count: teamAnalytics.smartBuckets.good,       color: "bg-success" },
                { label: "Требуют работы",      count: teamAnalytics.smartBuckets.needs_work, color: "bg-warning" },
                { label: "Критические (<0.6)",  count: teamAnalytics.smartBuckets.critical,   color: "bg-destructive" },
              ].map(({ label, count, color }) => (
                <div key={label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-mono">{count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full rounded-full ${color}`} style={{ width: `${(count / teamAnalytics.total) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Покрытие и процент утверждения */}
        <div className="glass-card-elevated p-4 space-y-3">
          <p className="text-sm font-semibold">Покрытие команды</p>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Сотрудников с целями</span>
                <span className="font-mono">{teamAnalytics.coveredMembers}/{teamMembers.length}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary" style={{ width: `${teamMembers.length > 0 ? (teamAnalytics.coveredMembers / teamMembers.length) * 100 : 0}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Процент утверждения</span>
                <span className="font-mono">{teamAnalytics.approvalRate}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-success" style={{ width: `${teamAnalytics.approvalRate}%` }} />
              </div>
            </div>
            {noGoalsCount > 0 && (
              <p className="text-xs text-warning flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {noGoalsCount} сотрудн. без целей
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
        <div className="glass-card-elevated p-5 space-y-4">
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
            {pendingGoals.slice(0, 5).map((goal) => (
              <div key={goal.id} className="flex items-start justify-between gap-3 p-3 rounded-lg bg-muted/40">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">{goal.employee_name ?? "Сотрудник"} · {goal.position ?? "—"}</p>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{goal.goal_text ?? goal.title}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline" className={`text-[10px] ${
                      (goal.smart_index ?? 0.5) < 0.6 ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"
                    }`}>
                      SMART {(goal.smart_index ?? 0.5).toFixed(2)}
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

        <div className="space-y-4">
          <div className="glass-card-elevated p-5">
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

          <div className="glass-card-elevated p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Алерты {alerts.length > 0 && <span className="text-xs font-normal text-muted-foreground">({alerts.length})</span>}</h3>
              {alerts.length > ALERTS_PREVIEW && (
                <button onClick={() => setAlertsExpanded((v) => !v)} className="text-xs text-primary flex items-center gap-1 hover:underline">
                  {alertsExpanded ? <><ChevronUp className="w-3 h-3" /> Свернуть</> : <><ChevronDown className="w-3 h-3" /> Ещё {alerts.length - ALERTS_PREVIEW}</>}
                </button>
              )}
            </div>
            <div className="space-y-2">
              {alerts.length === 0 && <p className="text-xs text-muted-foreground">Нет алертов</p>}
              {(alertsExpanded ? alerts : alerts.slice(0, ALERTS_PREVIEW)).map((a) => (
                <div key={a.id} className="flex items-start gap-2 text-sm">
                  <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${a.severity === "critical" ? "text-destructive" : "text-warning"}`} />
                  <div>
                    <p className="text-xs font-medium">{a.alert_type}</p>
                    <p className="text-xs text-muted-foreground">{a.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card-elevated p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">
            Мои цели (каскадируются на команду)
            {myGoalCards.length > 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">({myGoalCards.length})</span>}
          </h3>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="gap-1 text-xs">
              <Link to="/manager/my-goals">Управлять <ArrowRight className="w-3 h-3" /></Link>
            </Button>
            {myGoalCards.length > MY_GOALS_PREVIEW && (
              <button onClick={() => setMyGoalsExpanded((v) => !v)} className="text-xs text-primary flex items-center gap-1 hover:underline">
                {myGoalsExpanded ? <><ChevronUp className="w-3 h-3" /> Свернуть</> : <><ChevronDown className="w-3 h-3" /> Ещё {myGoalCards.length - MY_GOALS_PREVIEW}</>}
              </button>
            )}
          </div>
        </div>
        <div className="space-y-2">
          {myGoalCards.length === 0 && <p className="text-xs text-muted-foreground">Цели не найдены</p>}
          {(myGoalsExpanded ? myGoalCards : myGoalCards.slice(0, MY_GOALS_PREVIEW)).map((g) => (
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
