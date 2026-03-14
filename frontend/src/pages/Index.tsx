import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Target, Users, AlertTriangle, FileCheck, RefreshCw } from "lucide-react";
import StatCard from "@/components/StatCard";
import GoalCard from "@/components/GoalCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, toGoalCard } from "@/lib/api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];
const YEARS = [2025, 2026, 2027];

const SMART_LABELS: Record<string, string> = {
  S: "Specific",
  M: "Measurable",
  A: "Achievable",
  R: "Relevant",
  T: "Time-bound",
};

const STATUS_META: Record<string, { label: string; fill: string }> = {
  draft: { label: "Черновик", fill: "hsl(220,13%,82%)" },
  pending: { label: "На согласовании", fill: "hsl(45,90%,55%)" },
  approved: { label: "Утверждено", fill: "hsl(152,60%,42%)" },
  rejected: { label: "Отклонено", fill: "hsl(0,72%,55%)" },
};

export default function DashboardPage() {
  const [quarter, setQuarter] = useState("Q1");
  const [year, setYear] = useState(2026);

  const { data: dashboard, isLoading: dashLoading, refetch } = useQuery({
    queryKey: ["company-dashboard", quarter, year],
    queryFn: () => api.analytics.company(quarter, year),
  });

  const { data: recentGoals = [], isLoading: goalsLoading } = useQuery({
    queryKey: ["recent-goals", quarter, year],
    queryFn: () => api.goals.list({ quarter, year, limit: 5 }),
  });

  const { data: pendingGoals = [] } = useQuery({
    queryKey: ["pending-goals", quarter, year],
    queryFn: () => api.goals.list({ status: "pending", quarter, year, limit: 10 }),
  });

  // Compute SMART profile from departments
  const smartProfile = (() => {
    if (!dashboard?.departments?.length) return [];
    const keys = ["S", "M", "A", "R", "T"] as const;
    return keys.map((k) => {
      const wc = dashboard.departments.flatMap((d) =>
        Object.entries(d.weak_criteria ?? {}).map(([key, count]) => ({ key, count })),
      );
      const hits = wc.filter((w) => w.key === k).reduce((s, w) => s + w.count, 0);
      const total = wc.reduce((s, w) => s + w.count, 0) || 1;
      // weak_criteria tracks weaknesses, so score = 1 - (share of weaknesses for this key)
      const weakShare = hits / total;
      return {
        name: SMART_LABELS[k],
        value: parseFloat((1 - weakShare * 5 * 0.1).toFixed(2)),
      };
    });
  })();

  // Compute goal-type distribution
  const goalTypeDist = (() => {
    if (!dashboard?.departments?.length) return [];
    const acc: Record<string, number> = {};
    for (const d of dashboard.departments) {
      for (const [t, n] of Object.entries(d.goal_type_dist ?? {})) {
        acc[t] = (acc[t] ?? 0) + n;
      }
    }
    const colors: Record<string, string> = {
      activity: "hsl(220,13%,72%)",
      output: "hsl(152,60%,42%)",
      impact: "hsl(261,70%,55%)",
    };
    const labels: Record<string, string> = {
      activity: "Активность",
      output: "Результат",
      impact: "Влияние",
    };
    return Object.entries(acc).map(([k, v]) => ({
      name: labels[k] ?? k,
      value: v,
      fill: colors[k] ?? "hsl(220,13%,72%)",
    }));
  })();

  // Compute status breakdown from recent goals list (approximation)
  const statusDist = (() => {
    const counts: Record<string, number> = {};
    for (const g of recentGoals) counts[g.status] = (counts[g.status] ?? 0) + 1;
    return Object.entries(STATUS_META).map(([key, meta]) => ({
      name: meta.label,
      value: counts[key] ?? 0,
      fill: meta.fill,
    })).filter((s) => s.value > 0);
  })();

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Дашборд</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Обзор системы управления целями · {quarter} {year}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={quarter} onValueChange={setQuarter}>
            <SelectTrigger className="w-20 bg-muted/50 border-transparent">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QUARTERS.map((q) => (
                <SelectItem key={q} value={q}>
                  {q}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-24 bg-muted/50 border-transparent">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={dashLoading}>
            <RefreshCw className={`w-4 h-4 ${dashLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {dashLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))
        ) : (
          <>
            <StatCard
              icon={Target}
              title="Всего целей"
              value={String(dashboard?.total_goals ?? 0)}
            />
            <StatCard
              icon={FileCheck}
              title="Средний SMART"
              value={(dashboard?.avg_smart_company ?? 0).toFixed(2)}
              change={
                (dashboard?.avg_smart_company ?? 0) >= 0.7
                  ? "Хорошо"
                  : "Требует улучшения"
              }
              changeType={
                (dashboard?.avg_smart_company ?? 0) >= 0.7 ? "positive" : "negative"
              }
            />
            <StatCard
              icon={Users}
              title="Сотрудников"
              value={String(dashboard?.total_employees ?? 0)}
              description={`${dashboard?.departments?.length ?? 0} подразделений`}
            />
            <StatCard
              icon={AlertTriangle}
              title="На согласовании"
              value={String(pendingGoals.length)}
              change="Ожидают проверки"
              changeType={pendingGoals.length > 0 ? "negative" : "positive"}
            />
          </>
        )}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* SMART profile */}
        <div className="glass-card p-5 lg:col-span-2 animate-fade-in">
          <h3 className="text-sm font-semibold mb-4">SMART-профиль компании</h3>
          {dashLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={smartProfile} barGap={8}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,13%,90%)" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="hsl(220,10%,46%)" />
                <YAxis
                  tick={{ fontSize: 12 }}
                  stroke="hsl(220,10%,46%)"
                  domain={[0, 1]}
                  tickFormatter={(v) => v.toFixed(1)}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: "1px solid hsl(220,13%,90%)", fontSize: 12 }}
                  formatter={(v: number) => v.toFixed(2)}
                />
                <Bar
                  dataKey="value"
                  name="Средний балл"
                  fill="hsl(152,60%,42%)"
                  radius={[4, 4, 0, 0]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Goal type donut */}
        <div className="glass-card p-5 animate-fade-in">
          <h3 className="text-sm font-semibold mb-4">Типы целей</h3>
          {dashLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : goalTypeDist.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={goalTypeDist}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={3}
                  >
                    {goalTypeDist.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-1">
                {goalTypeDist.map((s) => (
                  <div key={s.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: s.fill }} />
                      <span className="text-muted-foreground">{s.name}</span>
                    </div>
                    <span className="font-semibold">{s.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Нет данных</p>
          )}
        </div>
      </div>

      {/* Maturity table + Pending alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass-card p-5 lg:col-span-2 animate-fade-in">
          <h3 className="text-sm font-semibold mb-4">
            Индекс зрелости целеполагания по подразделениям
          </h3>
          {dashLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (dashboard?.departments?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Нет данных за {quarter} {year}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-border">
                    <th className="text-left py-2 pr-4 font-medium">Подразделение</th>
                    <th className="text-center py-2 px-3 font-medium">Индекс</th>
                    <th className="text-center py-2 px-3 font-medium">Ср. SMART</th>
                    <th className="text-center py-2 px-3 font-medium">Стратег. %</th>
                    <th className="text-center py-2 px-3 font-medium">Целей</th>
                  </tr>
                </thead>
                <tbody>
                  {(dashboard?.departments ?? []).map((d) => (
                    <tr
                      key={d.department_id}
                      className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                    >
                      <td className="py-3 pr-4 font-medium">{d.department_name}</td>
                      <td className="text-center py-3 px-3">
                        <span
                          className={`font-mono font-bold ${
                            d.maturity_index >= 0.8
                              ? "text-success"
                              : d.maturity_index >= 0.6
                              ? "text-warning"
                              : "text-destructive"
                          }`}
                        >
                          {d.maturity_index.toFixed(2)}
                        </span>
                      </td>
                      <td className="text-center py-3 px-3 font-mono">
                        {d.avg_smart.toFixed(2)}
                      </td>
                      <td className="text-center py-3 px-3">
                        <div className="inline-flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${d.strategic_percent}%` }}
                            />
                          </div>
                          <span className="text-xs font-mono">{d.strategic_percent}%</span>
                        </div>
                      </td>
                      <td className="text-center py-3 px-3 font-mono">{d.total_goals}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pending goals as alerts */}
        <div className="glass-card p-5 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">На согласовании</h3>
            {pendingGoals.length > 0 && (
              <Badge
                variant="outline"
                className="text-xs bg-warning/10 text-warning border-warning/20"
              >
                {pendingGoals.length}
              </Badge>
            )}
          </div>
          {pendingGoals.length === 0 ? (
            <p className="text-sm text-muted-foreground">Нет ожидающих целей</p>
          ) : (
            <div className="space-y-3">
              {pendingGoals.slice(0, 4).map((g) => (
                <div key={g.id} className="border-b border-border/40 pb-2 last:border-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-medium truncate max-w-[70%]">
                      {g.employee_name ?? "Сотрудник"}
                    </span>
                    {g.smart_index !== null && (
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          g.smart_index < 0.5
                            ? "bg-destructive/10 text-destructive"
                            : "bg-muted"
                        }`}
                      >
                        SMART {g.smart_index.toFixed(2)}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {g.goal_text ?? g.title}
                  </p>
                </div>
              ))}
              {pendingGoals.length > 4 && (
                <p className="text-xs text-muted-foreground text-center">
                  + ещё {pendingGoals.length - 4}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Recent goals */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Последние цели</h3>
        {goalsLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : recentGoals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Нет целей за {quarter} {year}
          </p>
        ) : (
          <div className="space-y-3">
            {recentGoals.slice(0, 3).map((g) => (
              <GoalCard key={g.id} goal={toGoalCard(g)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
