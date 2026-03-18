import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Target, Users, AlertTriangle, FileCheck, RefreshCw } from "lucide-react";
import StatCard from "@/components/StatCard";
import GoalCard from "@/components/GoalCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, toGoalCard } from "@/lib/api";
import { getCurrentQuarterYear, getYearOptions } from "@/lib/date";
import { getTooltipStyle, CHART_GRID_COLOR, CHART_AXIS_COLOR } from "@/lib/chart-theme";
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
  LabelList,
} from "recharts";

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];
const { quarter: initialQuarter, year: initialYear } = getCurrentQuarterYear();
const YEARS = getYearOptions(2, initialYear);

const SMART_LABELS: Record<string, string> = {
  S: "Specific",
  M: "Measurable",
  A: "Achievable",
  R: "Relevant",
  T: "Time-bound",
};

const SMART_BAR_COLORS: Record<string, string> = {
  S: "hsl(142,71%,45%)",
  M: "hsl(210,100%,52%)",
  A: "hsl(38,92%,50%)",
  R: "hsl(280,65%,55%)",
  T: "hsl(0,72%,51%)",
};

const STATUS_META: Record<string, { label: string; fill: string }> = {
  draft: { label: "Черновик", fill: "hsl(220,13%,82%)" },
  pending: { label: "На согласовании", fill: "hsl(45,90%,55%)" },
  approved: { label: "Утверждено", fill: "hsl(152,60%,42%)" },
  rejected: { label: "Отклонено", fill: "hsl(0,72%,55%)" },
};

const CHART_GRID = CHART_GRID_COLOR;
const CHART_AXIS = CHART_AXIS_COLOR;

export default function DashboardPage() {
  const [quarter, setQuarter] = useState(initialQuarter);
  const [year, setYear] = useState(initialYear);

  const { data: dashboard, isLoading: dashLoading, isError: dashError, refetch } = useQuery({
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
        key: k,
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

  if (dashError) {
    return (
      <div className="glass-card-elevated p-8 text-center space-y-3 max-w-lg mx-auto mt-12">
        <p className="text-sm font-semibold text-destructive">Не удалось загрузить дашборд</p>
        <p className="text-xs text-muted-foreground">Проверьте, что бэкенд запущен на порту 8002.</p>
        <Button size="sm" variant="outline" onClick={() => refetch()}>Повторить</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Дашборд</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Обзор системы управления целями · {quarter} {year}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={quarter} onValueChange={setQuarter}>
            <SelectTrigger className="w-20 control-surface">
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
            <SelectTrigger className="w-24 control-surface">
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
      {dashLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
          initial="hidden"
          animate="visible"
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}
        >
          {[
            { icon: Target, title: "Всего целей", value: String(dashboard?.total_goals ?? 0) },
            { icon: FileCheck, title: "Средний SMART", value: (dashboard?.avg_smart_company ?? 0).toFixed(2) },
            { icon: Users, title: "Сотрудников", value: String(dashboard?.total_employees ?? 0) },
            { icon: AlertTriangle, title: "На согласовании", value: String(pendingGoals.length) },
          ].map(({ icon, title, value }) => (
            <motion.div
              key={title}
              variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } } }}
            >
              <StatCard icon={icon} title={title} value={value} />
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Section divider */}
      <div className="section-divider" />

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* SMART profile */}
        <div className="glass-card-elevated p-5 lg:col-span-2 animate-fade-in">
          <h3 className="text-sm font-semibold mb-4">SMART-профиль компании</h3>
          {dashLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={smartProfile} barGap={8} margin={{ bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                <XAxis
                  dataKey="key"
                  tick={({ x, y, payload }) => {
                    const color = SMART_BAR_COLORS[payload.value] ?? CHART_AXIS;
                    const label = SMART_LABELS[payload.value] ?? payload.value;
                    return (
                      <g transform={`translate(${x},${y})`}>
                        <rect x={-10} y={4} width={20} height={20} rx={4} fill={color} fillOpacity={0.18} />
                        <text x={0} y={18} textAnchor="middle" fill={color} fontSize={11} fontWeight={700}>
                          {payload.value}
                        </text>
                        <text x={0} y={38} textAnchor="middle" fill={CHART_AXIS} fontSize={10}>
                          {label}
                        </text>
                      </g>
                    );
                  }}
                  height={50}
                  stroke="transparent"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: CHART_AXIS }}
                  stroke={CHART_AXIS}
                  domain={[0, 1]}
                  tickFormatter={(v) => v.toFixed(1)}
                />
                <Tooltip
                  contentStyle={getTooltipStyle()}
                  cursor={{ fill: "rgba(148,163,184,0.06)" }}
                  wrapperStyle={{ outline: "none" }}
                  formatter={(v: number) => v.toFixed(2)}
                />
                <Bar
                  dataKey="value"
                  name="Средний балл"
                  radius={[6, 6, 0, 0]}
                  isAnimationActive={true} animationDuration={800} animationEasing="ease-out"
                  activeBar={false}
                >
                  {smartProfile.map((entry) => (
                    <Cell key={entry.key} fill={SMART_BAR_COLORS[entry.key] ?? "hsl(217,91%,60%)"} />
                  ))}
                  <LabelList
                    dataKey="value"
                    position="top"
                    formatter={(v: number) => v.toFixed(2)}
                    style={{ fontSize: 11, fontWeight: 600, fill: CHART_AXIS }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Goal type donut */}
        <div className="glass-card-elevated p-5 animate-fade-in">
          <h3 className="text-sm font-semibold mb-4">Типы целей</h3>
          {dashLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : goalTypeDist.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={210}>
                <PieChart>
                  <Pie
                    data={goalTypeDist}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={80}
                    paddingAngle={3}
                    isAnimationActive={true} animationDuration={800} animationEasing="ease-out"
                    stroke="transparent"
                  >
                    {goalTypeDist.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={getTooltipStyle()} cursor={false} wrapperStyle={{ outline: "none" }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {(() => {
                  const total = goalTypeDist.reduce((s, x) => s + x.value, 0) || 1;
                  return goalTypeDist.map((s) => {
                    const pct = Math.round((s.value / total) * 100);
                    return (
                      <div key={s.name} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ background: s.fill }} />
                            <span className="text-muted-foreground">{s.name}</span>
                          </div>
                          <span className="font-mono font-semibold">{s.value} ({pct}%)</span>
                        </div>
                        <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: s.fill }} />
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Нет данных</p>
          )}
        </div>
      </div>

      {/* Section divider */}
      <div className="section-divider" />

      {/* Status breakdown + Pending alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass-card-elevated p-5 lg:col-span-2 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Распределение целей по статусу</h3>
            <a href="/hr/analytics" className="text-xs text-primary hover:underline">
              Полная аналитика →
            </a>
          </div>
          {dashLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : statusDist.length > 0 ? (
            <div className="space-y-3">
              {statusDist.map((s) => {
                const total = statusDist.reduce((sum, x) => sum + x.value, 0) || 1;
                const pct = Math.round((s.value / total) * 100);
                return (
                  <div key={s.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: s.fill }} />
                        <span className="text-muted-foreground">{s.name}</span>
                      </div>
                      <span className="font-mono font-semibold">{s.value} ({pct}%)</span>
                    </div>
                    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: s.fill }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Нет целей за {quarter} {year}
            </p>
          )}
        </div>

        {/* Pending goals as alerts */}
        <div className="glass-card-elevated p-5 animate-fade-in">
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

      {/* Section divider */}
      <div className="section-divider" />

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
