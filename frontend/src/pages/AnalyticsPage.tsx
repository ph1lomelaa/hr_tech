import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { RefreshCw, X, Loader2, Download } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, LabelList,
} from "recharts";
import { api, type DepartmentMaturity } from "@/lib/api";
import { getCurrentQuarterYear, getYearOptions } from "@/lib/date";
import { getTooltipStyle, CHART_GRID_COLOR, CHART_AXIS_COLOR } from "@/lib/chart-theme";

// ── Helpers ───────────────────────────────────────────────────────────────────

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];
const { quarter: initialQuarter, year: initialYear } = getCurrentQuarterYear();
const YEARS = getYearOptions(2, initialYear);

const TYPE_COLORS: Record<string, string> = {
  output:   "hsl(152,60%,42%)",
  impact:   "hsl(210,100%,52%)",
  activity: "hsl(38,92%,50%)",
};

const SMART_BAR_COLORS: Record<string, string> = {
  S: "hsl(142,71%,45%)",
  M: "hsl(210,100%,52%)",
  A: "hsl(38,92%,50%)",
  R: "hsl(280,65%,55%)",
  T: "hsl(0,72%,51%)",
};

const ALIGN_COLORS = [
  { name: "Стратегическая", fill: "hsl(210,100%,52%)" },
  { name: "Функциональная", fill: "hsl(152,60%,42%)" },
  { name: "Операционная",   fill: "hsl(220,10%,60%)" },
];

const CHART_GRID = CHART_GRID_COLOR;
const CHART_AXIS = CHART_AXIS_COLOR;

function maturityColor(v: number) {
  if (v >= 0.8) return "text-success";
  if (v >= 0.6) return "text-warning";
  return "text-destructive";
}

// ── Скелетон ─────────────────────────────────────────────────────────────────

function ChartSkeleton({ height = 220 }: { height?: number }) {
  return (
    <div className="space-y-2" style={{ height }}>
      <Skeleton className="h-full w-full rounded-lg" />
    </div>
  );
}

// ── Основная страница ─────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [quarter, setQuarter] = useState(initialQuarter);
  const [year, setYear] = useState(initialYear);
  const [selectedDept, setSelectedDept] = useState<DepartmentMaturity | null>(null);

  // ── Запросы ───────────────────────────────────────────────────────────────

  const {
    data: dashboard,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["company-dashboard", quarter, year],
    queryFn: () => api.analytics.company(quarter, year),
    staleTime: 60_000,
  });

  const refreshMutation = useMutation({
    mutationFn: () => api.analytics.refresh(quarter, year),
    onSuccess: (data) => {
      refetch();
      toast({
        title: "Кэш обновлён",
        description: `Пересчитано ${data.refreshed} подразделений`,
      });
    },
    onError: (e: Error) =>
      toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const backfillMutation = useMutation({
    mutationFn: () => api.evaluate.backfill(),
    onSuccess: (data) => {
      refetch();
      toast({
        title: "Оценка завершена",
        description: `Оценено ${data.processed} целей из ${data.total_without_eval} без оценки`,
      });
    },
    onError: (e: Error) =>
      toast({ title: "Ошибка backfill", description: e.message, variant: "destructive" }),
  });

  // ── CSV-экспорт ───────────────────────────────────────────────────────────

  function exportCSV() {
    const depts = dashboard?.departments ?? [];
    const header = ["Подразделение", "Индекс зрелости", "Ср. SMART", "Стратег. %", "Целей", "Δ к пред. кварталу"];
    const rows = depts.map((d) => [
      d.department_name,
      d.maturity_index.toFixed(2),
      d.avg_smart.toFixed(2),
      d.strategic_percent.toFixed(1) + "%",
      String(d.total_goals),
      d.maturity_delta != null ? (d.maturity_delta >= 0 ? "+" : "") + d.maturity_delta.toFixed(2) : "—",
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${c}"`).join(";")).join("\n");
    const bom = "\uFEFF";
    const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analytics_${quarter}_${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Производные данные ────────────────────────────────────────────────────

  const departments = dashboard?.departments ?? [];

  // SMART-профиль компании (средние по критериям)
  const SMART_FULL: Record<string, string> = { S: "Specific", M: "Measurable", A: "Achievable", R: "Relevant", T: "Time-bound" };
  const smartProfile = (() => {
    if (!departments.length) return [];
    const keys = ["S", "M", "A", "R", "T"];
    return keys.map((k) => {
      const vals = departments.map((d) => d.weak_criteria[k] ?? 0).filter(Boolean);
      return {
        name: k,
        fullName: SMART_FULL[k],
        value: vals.length ? parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : 0,
      };
    });
  })();

  // Распределение типов целей по компании
  const goalTypeDist = (() => {
    if (!departments.length) return [];
    const total: Record<string, number> = {};
    departments.forEach((d) => {
      Object.entries(d.goal_type_dist).forEach(([k, v]) => {
        total[k] = (total[k] ?? 0) + v;
      });
    });
    const sum = Object.values(total).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(total).map(([k, v]) => ({
      name: k.charAt(0).toUpperCase() + k.slice(1),
      value: Math.round((v / sum) * 100),
      fill: TYPE_COLORS[k] ?? "hsl(220,10%,60%)",
    }));
  })();

  // Топ-проблемы: слабые критерии + агрегированные рекомендации
  const topProblems = (() => {
    if (!departments.length) return { weakCriteria: [], recs: [] };
    const keys = ["S", "M", "A", "R", "T"];
    const avgScores = keys.map((k) => {
      const vals = departments.map((d) => d.weak_criteria[k] ?? 0);
      return { key: k, label: SMART_FULL[k], avg: vals.reduce((a, b) => a + b, 0) / vals.length };
    });
    const weakCriteria = avgScores.filter((s) => s.avg < 0.6).sort((a, b) => a.avg - b.avg);

    // Собираем уникальные рекомендации по всем подразделениям
    const recCounts: Record<string, number> = {};
    departments.forEach((d) => d.recommendations.forEach((r) => {
      recCounts[r] = (recCounts[r] ?? 0) + 1;
    }));
    const recs = Object.entries(recCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([text, count]) => ({ text, count }));

    return { weakCriteria, recs };
  })();

  // Реальное распределение стратегической связки по данным backend
  const alignmentDist = dashboard?.alignment_dist ?? { strategic: 0, functional: 0, operational: 0 };
  const alignmentTotal = alignmentDist.strategic + alignmentDist.functional + alignmentDist.operational;
  const alignmentPie = [
    {
      name: "Стратегическая",
      value: alignmentTotal > 0 ? Math.round((alignmentDist.strategic / alignmentTotal) * 100) : 0,
      fill: ALIGN_COLORS[0].fill,
    },
    {
      name: "Функциональная",
      value: alignmentTotal > 0 ? Math.round((alignmentDist.functional / alignmentTotal) * 100) : 0,
      fill: ALIGN_COLORS[1].fill,
    },
    {
      name: "Операционная",
      value: alignmentTotal > 0 ? Math.round((alignmentDist.operational / alignmentTotal) * 100) : 0,
      fill: ALIGN_COLORS[2].fill,
    },
  ];

  // ── Рендер ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Аналитика</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Качество целей, SMART-профили и стратегическая связка
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={quarter} onValueChange={setQuarter}>
            <SelectTrigger className="w-24 h-8 text-xs control-surface">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QUARTERS.map((q) => <SelectItem key={q} value={q}>{q}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-24 h-8 text-xs control-surface">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            variant="outline" size="sm" className="gap-1 h-8 text-xs control-surface"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
          >
            {refreshMutation.isPending
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <RefreshCw className="w-3 h-3" />
            }
            Пересчитать
          </Button>
          <Button
            variant="outline" size="sm" className="gap-1 h-8 text-xs control-surface"
            onClick={() => backfillMutation.mutate()}
            disabled={backfillMutation.isPending}
            title="Оценить все цели без SMART-оценки (seed-данные, старые записи)"
          >
            {backfillMutation.isPending
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <RefreshCw className="w-3 h-3" />
            }
            Оценить все цели
          </Button>
          <Button
            variant="outline" size="sm" className="gap-1 h-8 text-xs control-surface"
            onClick={exportCSV}
            disabled={!dashboard}
          >
            <Download className="w-3 h-3" />
            Экспорт CSV
          </Button>
        </div>
      </div>

      {/* Ключевые метрики */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : dashboard && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Сотрудников",   value: dashboard.total_employees,                     sub: "активных" },
            { label: "Целей",         value: dashboard.total_goals,                          sub: `${quarter} ${year}` },
            { label: "Средний SMART", value: dashboard.avg_smart_company.toFixed(2),          sub: "по компании" },
            { label: "Стратег. %",    value: `${dashboard.strategic_percent.toFixed(1)}%`,    sub: "связанных со стратегией" },
          ].map((m) => (
            <div key={m.label} className="glass-card-elevated p-4">
              <p className="text-xs text-muted-foreground">{m.label}</p>
              <p className="text-2xl font-bold mt-1">{m.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{m.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Графики: SMART-профиль + Стратегическая связка */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass-card-elevated p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold mb-4">SMART-профиль компании</h3>
          {isLoading ? <ChartSkeleton /> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={smartProfile} barGap={8} margin={{ bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                <XAxis
                  dataKey="name"
                  tick={({ x, y, payload }) => {
                    const color = SMART_BAR_COLORS[payload.value] ?? CHART_AXIS;
                    return (
                      <g transform={`translate(${x},${y})`}>
                        <rect x={-10} y={4} width={20} height={20} rx={4} fill={color} fillOpacity={0.18} />
                        <text x={0} y={18} textAnchor="middle" fill={color} fontSize={11} fontWeight={700}>
                          {payload.value}
                        </text>
                        <text x={0} y={38} textAnchor="middle" fill={CHART_AXIS} fontSize={10}>
                          {({ S: "Specific", M: "Measurable", A: "Achievable", R: "Relevant", T: "Time-bound" } as Record<string,string>)[payload.value]}
                        </text>
                      </g>
                    );
                  }}
                  height={50}
                  stroke="transparent"
                />
                <YAxis tick={{ fontSize: 11, fill: CHART_AXIS }} stroke={CHART_AXIS} domain={[0, 1]} />
                <Tooltip
                  contentStyle={getTooltipStyle()}
                  cursor={{ fill: "rgba(148,163,184,0.06)" }}
                  wrapperStyle={{ outline: "none" }}
                  formatter={(v: unknown, _name: string, props: { payload?: { fullName?: string } }) => [
                    typeof v === "number" ? v.toFixed(2) : v,
                    props.payload?.fullName ?? "Балл",
                  ]}
                />
                <Bar
                  dataKey="value"
                  name="Средний балл"
                  radius={[6, 6, 0, 0]}
                  isAnimationActive={true} animationDuration={800} animationEasing="ease-out"
                  activeBar={false}
                >
                  {smartProfile.map((entry) => (
                    <Cell key={entry.name} fill={SMART_BAR_COLORS[entry.name] ?? "hsl(217,91%,60%)"} />
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

        <div className="glass-card-elevated p-5">
          <h3 className="text-sm font-semibold mb-4">Стратегическая связка</h3>
          {isLoading ? <ChartSkeleton height={200} /> : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={alignmentPie} dataKey="value" nameKey="name"
                    cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={2}
                    isAnimationActive={true} animationDuration={800} animationEasing="ease-out" stroke="transparent">
                    {alignmentPie.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={getTooltipStyle()} cursor={false} wrapperStyle={{ outline: "none" }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {alignmentPie.map((s) => (
                  <div key={s.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: s.fill }} />
                      <span className="text-muted-foreground">{s.name}</span>
                    </div>
                    <span className="font-semibold">{s.value}%</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* SMART-бакеты */}
      {(isLoading || (dashboard?.smart_buckets)) && (
        <div className="glass-card-elevated p-5">
          <h3 className="text-sm font-semibold mb-4">Распределение целей по качеству SMART</h3>
          {isLoading ? <ChartSkeleton height={80} /> : (() => {
            const b = dashboard!.smart_buckets ?? { critical: 0, needs_work: 0, good: 0 };
            const total = b.critical + b.needs_work + b.good || 1;
            const buckets = [
              { label: "Критично (< 0.5)", key: "critical" as const, fill: "hsl(0,72%,55%)", value: b.critical },
              { label: "Требует работы (0.5–0.7)", key: "needs_work" as const, fill: "hsl(45,90%,55%)", value: b.needs_work },
              { label: "Хорошо (≥ 0.7)", key: "good" as const, fill: "hsl(152,60%,42%)", value: b.good },
            ];
            return (
              <div className="space-y-3">
                {buckets.map((bk) => {
                  const pct = Math.round((bk.value / total) * 100);
                  return (
                    <div key={bk.key} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: bk.fill }} />
                          <span className="text-muted-foreground">{bk.label}</span>
                        </div>
                        <span className="font-mono font-semibold">{bk.value} ({pct}%)</span>
                      </div>
                      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: bk.fill }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* Типы целей + Матрица зрелости */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass-card-elevated p-5">
          <h3 className="text-sm font-semibold mb-4">Типы целей</h3>
          {isLoading ? <ChartSkeleton height={200} /> : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={goalTypeDist} dataKey="value" nameKey="name"
                    cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={2}
                    isAnimationActive={true} animationDuration={800} animationEasing="ease-out" stroke="transparent">
                    {goalTypeDist.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={getTooltipStyle()} formatter={(v) => `${v}%`} cursor={false} wrapperStyle={{ outline: "none" }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {goalTypeDist.map((s) => (
                  <div key={s.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: s.fill }} />
                      <span className="text-muted-foreground">{s.name}</span>
                    </div>
                    <span className="font-semibold">{s.value}%</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Таблица зрелости (F-22) */}
        <div className="glass-card-elevated p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold mb-4">Индекс зрелости целеполагания</h3>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : isError ? (
            <p className="text-sm text-muted-foreground">Не удалось загрузить данные. Проверьте подключение к бэкенду.</p>
          ) : (
            <div className="table-shell overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm [&_th:first-child]:pl-4 [&_td:first-child]:pl-4">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-border">
                    <th className="text-left py-2 pr-4 font-medium align-middle">Подразделение</th>
                    <th className="w-24 text-center py-2 px-3 font-medium align-middle">Индекс</th>
                    <th className="w-16 text-center py-2 px-3 font-medium align-middle">Δ</th>
                    <th className="w-24 text-center py-2 px-3 font-medium align-middle">Ср. SMART</th>
                    <th className="w-44 text-center py-2 px-3 font-medium align-middle">Стратег. %</th>
                    <th className="w-20 text-center py-2 px-3 font-medium align-middle">Целей</th>
                  </tr>
                </thead>
                <tbody>
                  {departments.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground text-xs">
                        Нет данных. Запустите «Пересчитать» или добавьте цели за этот квартал.
                      </td>
                    </tr>
                  ) : departments.map((d) => (
                    <tr
                      key={d.department_id}
                      onClick={() => setSelectedDept(selectedDept?.department_id === d.department_id ? null : d)}
                      className={`border-b border-border/50 transition-colors cursor-pointer ${
                        selectedDept?.department_id === d.department_id ? "bg-primary/5" : "hover:bg-muted/30"
                      }`}
                    >
                      <td className="py-3 pr-4 font-medium align-middle">{d.department_name}</td>
                      <td className="text-center py-3 px-3 align-middle">
                        <span className={`font-mono font-bold ${maturityColor(d.maturity_index)}`}>
                          {d.maturity_index.toFixed(2)}
                        </span>
                      </td>
                      <td className="text-center py-3 px-3 font-mono align-middle text-xs">
                        {d.maturity_delta != null ? (
                          <span className={d.maturity_delta >= 0 ? "text-success" : "text-destructive"}>
                            {d.maturity_delta >= 0 ? "+" : ""}{d.maturity_delta.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>
                      <td className="text-center py-3 px-3 font-mono align-middle">{d.avg_smart.toFixed(2)}</td>
                      <td className="text-center py-3 px-3 align-middle">
                        <div className="flex items-center justify-center gap-2 whitespace-nowrap">
                          <div className="w-14 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${d.strategic_percent}%` }} />
                          </div>
                          <span className="text-xs font-mono">{d.strategic_percent.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="text-center py-3 px-3 font-mono align-middle">{d.total_goals}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Drill-down подразделения */}
          {selectedDept && (
            <div className="mt-4 pt-4 border-t border-border/50">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="text-sm font-semibold">Детали: {selectedDept.department_name}</h4>
                </div>
                <button
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  onClick={() => setSelectedDept(null)}
                >
                  <X className="w-3 h-3" /> Скрыть
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                {/* Слабые критерии */}
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Слабые критерии</p>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(selectedDept.weak_criteria)
                      .filter(([, v]) => v < 0.6)
                      .map(([k]) => (
                        <Badge key={k} variant="outline" className="text-[10px] bg-warning/10 text-warning">
                          ⚠ {k}
                        </Badge>
                      ))}
                    {Object.values(selectedDept.weak_criteria).every((v) => v >= 0.6) && (
                      <Badge variant="outline" className="text-[10px]">Нет</Badge>
                    )}
                  </div>
                </div>

                {/* Типы целей */}
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Типы целей</p>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(selectedDept.goal_type_dist).map(([k, v]) => (
                      <Badge
                        key={k} variant="outline"
                        className="text-[10px]"
                        style={{ borderColor: TYPE_COLORS[k], color: TYPE_COLORS[k] }}
                      >
                        {k.charAt(0).toUpperCase() + k.slice(1)}: {v}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Рекомендации */}
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Рекомендации</p>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {selectedDept.recommendations.map((rec) => (
                      <li key={rec}>• {rec}</li>
                    ))}
                    {selectedDept.recommendations.length === 0 && (
                      <li>Нет данных для рекомендаций</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Топ-проблемы компании */}
      {(isLoading || departments.length > 0) && (
        <div className="glass-card-elevated p-5">
          <h3 className="text-sm font-semibold mb-4">Топ-проблемы компании</h3>
          {isLoading ? <ChartSkeleton height={80} /> : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-xs text-muted-foreground mb-3">Слабые SMART-критерии (среднее &lt; 0.6)</p>
                {topProblems.weakCriteria.length === 0 ? (
                  <p className="text-xs text-success">Все критерии в норме</p>
                ) : (
                  <div className="space-y-2">
                    {topProblems.weakCriteria.map((c) => (
                      <div key={c.key} className="flex items-center gap-3">
                        <span className="w-20 text-xs font-mono font-bold text-destructive shrink-0">
                          {c.key} · {c.avg.toFixed(2)}
                        </span>
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-destructive"
                            style={{ width: `${Math.round(c.avg * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">{c.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-3">Частые рекомендации</p>
                {topProblems.recs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Нет данных</p>
                ) : (
                  <ul className="space-y-2">
                    {topProblems.recs.map(({ text, count }) => (
                      <li key={text} className="flex items-start gap-2 text-xs">
                        <span className="mt-0.5 w-5 h-5 rounded-full bg-warning/15 text-warning font-bold flex items-center justify-center shrink-0 text-[10px]">
                          {count}
                        </span>
                        <span className="text-muted-foreground">{text}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
