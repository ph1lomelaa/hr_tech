import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SmartScoreGroup } from "@/components/SmartScoreBar";
import GoalCard from "@/components/GoalCard";
import { api, toGoalCard } from "@/lib/api";
import { BellOff } from "lucide-react";

export default function EmployeesPage() {
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("Все подразделения");
  const [selectedId, setSelectedId] = useState<string>("");
  const [quarter, setQuarter] = useState("Q1");
  const year = 2026;

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ["employees"],
    queryFn: () => api.employees.list(),
  });

  const departments = useMemo(() => {
    const depts = new Set(employees.map((e) => e.department).filter(Boolean) as string[]);
    return ["Все подразделения", ...Array.from(depts).sort()];
  }, [employees]);

  const firstId = employees[0]?.id ?? "";
  const effectiveId = selectedId || firstId;

  const filtered = useMemo(
    () =>
      employees.filter((emp) => {
        const q = search.toLowerCase();
        const matchesSearch =
          !q ||
          emp.full_name.toLowerCase().includes(q) ||
          (emp.position ?? "").toLowerCase().includes(q);
        const matchesDept =
          deptFilter === "Все подразделения" || emp.department === deptFilter;
        return matchesSearch && matchesDept;
      }),
    [employees, search, deptFilter],
  );

  const selected = filtered.find((e) => e.id === effectiveId) ?? filtered[0];

  const { data: empDetail } = useQuery({
    queryKey: ["employee-detail", selected?.id],
    queryFn: () => api.employees.get(selected!.id),
    enabled: !!selected?.id,
  });

  const { data: empGoals = [], isLoading: goalsLoading } = useQuery({
    queryKey: ["emp-goals", selected?.id, quarter, year],
    queryFn: () => api.employees.goals(selected!.id, { quarter, year }),
    enabled: !!selected?.id,
  });

  const { data: alerts = [] } = useQuery({
    queryKey: ["emp-alerts", selected?.id],
    queryFn: () => api.employees.alerts(selected!.id),
    enabled: !!selected?.id,
  });

  const smartStats = useMemo(() => {
    if (!empGoals.length) return null;
    const withScores = empGoals.filter((g) => g.scores);
    const avgScore = (key: "S" | "M" | "A" | "R" | "T") =>
      withScores.length
        ? withScores.reduce((sum, g) => sum + (g.scores![key] as number), 0) / withScores.length
        : 0.5;
    return {
      avgSmart:
        empGoals.reduce((s, g) => s + (g.smart_index ?? 0), 0) / empGoals.length,
      strategicPct: Math.round(
        (empGoals.filter((g) => g.alignment_level === "strategic").length /
          empGoals.length) *
          100,
      ),
      totalGoals: empGoals.length,
      weightSum: Math.round(empGoals.reduce((s, g) => s + (g.weight ?? 0), 0)),
      scores: [
        { key: "S", label: "Specific", value: avgScore("S") },
        { key: "M", label: "Measurable", value: avgScore("M") },
        { key: "A", label: "Achievable", value: avgScore("A") },
        { key: "R", label: "Relevant", value: avgScore("R") },
        { key: "T", label: "Time-bound", value: avgScore("T") },
      ],
    };
  }, [empGoals]);

  const managerName = useMemo(() => {
    if (!empDetail?.manager_id) return null;
    return employees.find((e) => e.id === empDetail.manager_id)?.full_name ?? null;
  }, [empDetail?.manager_id, employees]);

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Сотрудники</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Контроль целей, качества и стратегической связки
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={quarter} onValueChange={setQuarter}>
            <SelectTrigger className="w-28 bg-muted/50 border-transparent">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["Q1", "Q2", "Q3", "Q4"].map((q) => (
                <SelectItem key={q} value={q}>
                  {q} {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline">Экспорт</Button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 max-w-xs">
          <Input
            placeholder="Поиск по сотрудникам..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-muted/50 border-transparent"
          />
        </div>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-56 bg-muted/50 border-transparent">
            <SelectValue placeholder="Подразделение" />
          </SelectTrigger>
          <SelectContent>
            {departments.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="outline" className="text-xs">
          {filtered.length} сотрудников
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
        {/* Employee list */}
        <div className="glass-card p-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th className="text-left py-2 pr-3 font-medium">Сотрудник</th>
                  <th className="text-left py-2 pr-3 font-medium hidden md:table-cell">
                    Должность
                  </th>
                  <th className="text-left py-2 pr-3 font-medium hidden lg:table-cell">
                    Подразделение
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((emp) => {
                  const initials = emp.full_name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase();
                  return (
                    <tr
                      key={emp.id}
                      className={`border-b border-border/40 hover:bg-muted/30 transition-colors cursor-pointer ${
                        emp.id === selected?.id ? "bg-primary/5" : ""
                      }`}
                      onClick={() => setSelectedId(emp.id)}
                    >
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                            {initials}
                          </div>
                          <p className="font-medium leading-tight">{emp.full_name}</p>
                        </div>
                      </td>
                      <td className="py-3 pr-3 text-muted-foreground hidden md:table-cell">
                        {emp.position ?? "—"}
                      </td>
                      <td className="py-3 pr-3 text-muted-foreground hidden lg:table-cell">
                        {emp.department ?? "—"}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={3}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      Сотрудники не найдены
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Employee detail panel */}
        {selected && (
          <div className="space-y-4">
            {/* Quarter stats */}
            <div className="glass-card p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">{selected.full_name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {selected.position ?? "—"}
                  </p>
                  {empDetail?.email && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {empDetail.email}
                    </p>
                  )}
                  {managerName && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Руководитель: {managerName}
                    </p>
                  )}
                </div>
                <Badge variant="outline" className="text-xs shrink-0">
                  {selected.department ?? "—"}
                </Badge>
              </div>

              {goalsLoading ? (
                <div className="mt-4 space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              ) : smartStats ? (
                <>
                  <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Средний SMART</p>
                      <p className="font-mono font-semibold">
                        {smartStats.avgSmart.toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Стратегическая доля</p>
                      <p className="font-mono font-semibold">
                        {smartStats.strategicPct}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Целей · {quarter} {year}
                      </p>
                      <p
                        className={`font-mono font-semibold ${
                          smartStats.totalGoals < 3 || smartStats.totalGoals > 5
                            ? "text-warning"
                            : ""
                        }`}
                      >
                        {smartStats.totalGoals}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Сумма весов</p>
                      <p
                        className={`font-mono font-semibold ${
                          smartStats.weightSum !== 100 ? "text-warning" : ""
                        }`}
                      >
                        {smartStats.weightSum}%
                      </p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <p className="text-xs text-muted-foreground mb-2">SMART-профиль</p>
                    <SmartScoreGroup scores={smartStats.scores} />
                  </div>
                </>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  Нет целей за {quarter} {year}
                </p>
              )}
            </div>

            {/* Recent goals */}
            {empGoals.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
                  Цели · {quarter} {year}
                </h3>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {empGoals.slice(0, 3).map((g) => (
                    <GoalCard key={g.id} goal={toGoalCard(g)} />
                  ))}
                  {empGoals.length > 3 && (
                    <p className="text-xs text-muted-foreground text-center py-1">
                      + ещё {empGoals.length - 3} целей
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Alerts */}
            <div className="glass-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Алерты</h3>
                {alerts.filter((a) => !a.is_read).length > 0 && (
                  <Badge
                    variant="outline"
                    className="bg-warning/10 text-warning border-warning/20 text-xs"
                  >
                    {alerts.filter((a) => !a.is_read).length} непрочитанных
                  </Badge>
                )}
              </div>
              {alerts.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <BellOff className="w-4 h-4" />
                  <span>Алертов нет</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {alerts.slice(0, 5).map((alert) => (
                    <div key={alert.id} className="flex items-start gap-2 text-sm">
                      <span
                        className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                          alert.severity === "critical"
                            ? "bg-destructive"
                            : "bg-warning"
                        }`}
                      />
                      <span className={alert.is_read ? "text-muted-foreground" : ""}>
                        {alert.message}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
