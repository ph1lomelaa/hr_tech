import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { RefreshCw, X, Loader2 } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { api, type DepartmentMaturity } from "@/lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];
const YEARS = [2025, 2026, 2027];

const TYPE_COLORS: Record<string, string> = {
  output:   "hsl(152,60%,42%)",
  impact:   "hsl(210,100%,52%)",
  activity: "hsl(38,92%,50%)",
};

const ALIGN_COLORS = [
  { name: "Стратегическая", fill: "hsl(210,100%,52%)" },
  { name: "Функциональная", fill: "hsl(152,60%,42%)" },
  { name: "Операционная",   fill: "hsl(220,10%,60%)" },
];

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
  const [quarter, setQuarter] = useState("Q1");
  const [year, setYear] = useState(2026);
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

  // ── Производные данные ────────────────────────────────────────────────────

  const departments = dashboard?.departments ?? [];

  // SMART-профиль компании (средние по критериям)
  const smartProfile = (() => {
    if (!departments.length) return [];
    const keys = ["S", "M", "A", "R", "T"];
    return keys.map((k) => {
      const vals = departments.map((d) => d.weak_criteria[k] ?? 0).filter(Boolean);
      return { name: k, value: vals.length ? parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : 0 };
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

  // Стратегическая связка (средний %)
  const avgStrategic = dashboard?.strategic_percent ?? 0;
  const alignmentPie = [
    { name: "Стратегическая",  value: Math.round(avgStrategic),          fill: ALIGN_COLORS[0].fill },
    { name: "Функциональная",  value: Math.round(avgStrategic * 0.55),    fill: ALIGN_COLORS[1].fill },
    { name: "Операционная",    value: Math.max(0, Math.round(100 - avgStrategic * 1.55)), fill: ALIGN_COLORS[2].fill },
  ];

  // ── Рендер ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Заголовок */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Аналитика</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Качество целей, SMART-профили и стратегическая связка
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={quarter} onValueChange={setQuarter}>
            <SelectTrigger className="w-24 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QUARTERS.map((q) => <SelectItem key={q} value={q}>{q}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-24 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            variant="outline" size="sm" className="gap-1 h-8 text-xs"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
          >
            {refreshMutation.isPending
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <RefreshCw className="w-3 h-3" />
            }
            Пересчитать
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
            <div key={m.label} className="glass-card p-4">
              <p className="text-xs text-muted-foreground">{m.label}</p>
              <p className="text-2xl font-bold mt-1">{m.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{m.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Графики: SMART-профиль + Стратегическая связка */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass-card p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold mb-4">SMART-профиль компании</h3>
          {isLoading ? <ChartSkeleton /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={smartProfile} barGap={8}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,13%,90%)" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="hsl(220,10%,46%)" />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(220,10%,46%)" domain={[0, 1]} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(220,13%,90%)", fontSize: 12 }} />
                <Bar dataKey="value" name="Средний балл" fill="hsl(152,60%,42%)" radius={[4, 4, 0, 0]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-4">Стратегическая связка</h3>
          {isLoading ? <ChartSkeleton height={200} /> : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={alignmentPie} dataKey="value" nameKey="name"
                    cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={2}>
                    {alignmentPie.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
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

      {/* Типы целей + Матрица зрелости */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-4">Типы целей (F-19)</h3>
          {isLoading ? <ChartSkeleton height={200} /> : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={goalTypeDist} dataKey="value" nameKey="name"
                    cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={2}>
                    {goalTypeDist.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(v) => `${v}%`} />
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
        <div className="glass-card p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold mb-4">Индекс зрелости целеполагания (F-22)</h3>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : isError ? (
            <p className="text-sm text-muted-foreground">Не удалось загрузить данные. Проверьте подключение к бэкенду.</p>
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
                  {departments.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-muted-foreground text-xs">
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
                      <td className="py-3 pr-4 font-medium">{d.department_name}</td>
                      <td className="text-center py-3 px-3">
                        <span className={`font-mono font-bold ${maturityColor(d.maturity_index)}`}>
                          {d.maturity_index.toFixed(2)}
                        </span>
                      </td>
                      <td className="text-center py-3 px-3 font-mono">{d.avg_smart.toFixed(2)}</td>
                      <td className="text-center py-3 px-3">
                        <div className="inline-flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${d.strategic_percent}%` }} />
                          </div>
                          <span className="text-xs font-mono">{d.strategic_percent.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="text-center py-3 px-3 font-mono">{d.total_goals}</td>
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
    </div>
  );
}
