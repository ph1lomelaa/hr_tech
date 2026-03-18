import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { BellOff, ChevronRight, Download, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { getCurrentQuarterYear } from "@/lib/date";
import { cn } from "@/lib/utils";

const ALL_DEPARTMENTS = "all";
const ALL_GOAL_STATUSES = "all";
const ALL_ALIGNMENTS = "all";

const GOAL_STATUS_OPTIONS = [
  { value: ALL_GOAL_STATUSES, label: "Все статусы" },
  { value: "draft", label: "Черновик" },
  { value: "pending", label: "На согласовании" },
  { value: "approved", label: "Утверждена" },
  { value: "rejected", label: "Отклонена" },
];

const GOAL_ALIGNMENT_OPTIONS = [
  { value: ALL_ALIGNMENTS, label: "Все связки" },
  { value: "strategic", label: "Стратегическая" },
  { value: "functional", label: "Функциональная" },
  { value: "operational", label: "Операционная" },
];

const ALIGNMENT_LABELS: Record<string, string> = {
  strategic: "Стратегическая",
  functional: "Функциональная",
  operational: "Операционная",
};

const ALIGNMENT_CLASS: Record<string, string> = {
  strategic: "border-sky-500/20 bg-sky-500/10 text-sky-300",
  functional: "border-violet-500/20 bg-violet-500/10 text-violet-300",
  operational: "border-border/60 bg-muted/35 text-muted-foreground",
};

const GOAL_TYPE_LABELS: Record<string, string> = {
  impact: "Влияние",
  output: "Результат",
  activity: "Действие",
};

const GOAL_TYPE_CLASS: Record<string, string> = {
  impact: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  output: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  activity: "border-orange-500/20 bg-orange-500/10 text-orange-300",
};

const ALERT_LABELS: Record<string, string> = {
  low_smart: "Низкий SMART-индекс",
  alignment_gap: "Нет стратегической связки",
  too_few_goals: "Мало целей",
  too_many_goals: "Слишком много целей",
  weight_mismatch: "Сумма весов ≠ 100%",
  duplicate: "Возможное дублирование",
  duplicate_goal: "Возможное дублирование",
  achievability_risk: "Риск недостижимости",
  goal_rejected: "Цель отклонена",
};

const SMART_SCORE_COLORS: Record<string, string> = {
  S: "#1D9E75",
  M: "#7F77DD",
  A: "#EF9F27",
  R: "#D85A30",
  T: "#E24B4A",
};

function formatProblemsLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} проблема`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} проблемы`;
  return `${count} проблем`;
}

function recommendationPriority(goal: {
  smart_index: number | null;
  alignment_level: string | null;
  recommendations: string[];
  status: string;
}): number {
  let score = 0;

  score += Math.round((1 - (goal.smart_index ?? 0.5)) * 100);
  if (goal.alignment_level !== "strategic") score += 30;
  if ((goal.recommendations?.length ?? 0) > 0) score += 12;
  if (goal.status === "rejected") score += 18;
  if (goal.status === "pending") score += 6;

  return score;
}

function csvEscape(value: string | number | null | undefined): string {
  const normalized = String(value ?? "");
  if (/[",\n;]/.test(normalized)) {
    return `"${normalized.replace(/"/g, "\"\"")}"`;
  }
  return normalized;
}

export default function EmployeesPage() {
  const navigate = useNavigate();
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState(ALL_DEPARTMENTS);
  const [selectedId, setSelectedId] = useState<string>("");
  const [goalSearch, setGoalSearch] = useState("");
  const [goalStatus, setGoalStatus] = useState(ALL_GOAL_STATUSES);
  const [alignmentFilter, setAlignmentFilter] = useState(ALL_ALIGNMENTS);
  const [activeTab, setActiveTab] = useState<"overview" | "goals" | "history">("overview");
  const { quarter: initialQuarter, year: initialYear } = getCurrentQuarterYear();
  const [quarter, setQuarter] = useState(initialQuarter);
  const [year] = useState(initialYear);

  const { data: employees = [], isLoading, isError } = useQuery({
    queryKey: ["employees"],
    queryFn: () => api.employees.list(),
  });

  const departments = useMemo(() => {
    const values = new Set(
      employees.map((employee) => employee.department).filter(Boolean) as string[],
    );
    return Array.from(values).sort((left, right) => left.localeCompare(right, "ru"));
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    const query = employeeSearch.trim().toLowerCase();
    return employees.filter((employee) => {
      const matchesSearch = !query || [
        employee.full_name,
        employee.position ?? "",
        employee.department ?? "",
      ].some((value) => value.toLowerCase().includes(query));
      const matchesDepartment =
        deptFilter === ALL_DEPARTMENTS || employee.department === deptFilter;
      return matchesSearch && matchesDepartment;
    });
  }, [deptFilter, employeeSearch, employees]);

  useEffect(() => {
    if (filteredEmployees.length === 0) {
      if (selectedId) setSelectedId("");
      return;
    }
    if (!filteredEmployees.some((employee) => employee.id === selectedId)) {
      setSelectedId(filteredEmployees[0].id);
    }
  }, [filteredEmployees, selectedId]);

  const selected = filteredEmployees.find((employee) => employee.id === selectedId) ?? null;

  useEffect(() => {
    setGoalSearch("");
    setGoalStatus(ALL_GOAL_STATUSES);
    setAlignmentFilter(ALL_ALIGNMENTS);
  }, [selected?.id]);

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

  const managerName = useMemo(() => {
    if (!empDetail?.manager_id) return null;
    return employees.find((employee) => employee.id === empDetail.manager_id)?.full_name ?? null;
  }, [empDetail?.manager_id, employees]);

  const smartStats = useMemo(() => {
    if (!empGoals.length) return null;
    const withScores = empGoals.filter((goal) => goal.scores);
    const avgScore = (key: "S" | "M" | "A" | "R" | "T") =>
      withScores.length
        ? withScores.reduce((sum, goal) => sum + (goal.scores?.[key] ?? 0.5), 0) / withScores.length
        : 0.5;

    return {
      avgSmart: empGoals.reduce((sum, goal) => sum + (goal.smart_index ?? 0), 0) / empGoals.length,
      strategicPct: Math.round(
        (empGoals.filter((goal) => goal.alignment_level === "strategic").length / empGoals.length) * 100,
      ),
      totalGoals: empGoals.length,
      weightSum: Math.round(empGoals.reduce((sum, goal) => sum + (goal.weight ?? 0), 0)),
      scores: [
        { key: "S", label: "Specific", value: avgScore("S") },
        { key: "M", label: "Measurable", value: avgScore("M") },
        { key: "A", label: "Achievable", value: avgScore("A") },
        { key: "R", label: "Relevant", value: avgScore("R") },
        { key: "T", label: "Time-bound", value: avgScore("T") },
      ],
    };
  }, [empGoals]);

  const filteredGoals = useMemo(() => {
    const query = goalSearch.trim().toLowerCase();
    return empGoals.filter((goal) => {
      const matchesSearch = !query || [
        goal.goal_text ?? goal.title,
        goal.metric ?? "",
        goal.reviewer_comment ?? "",
      ].some((value) => value.toLowerCase().includes(query));
      const matchesStatus = goalStatus === ALL_GOAL_STATUSES || goal.status === goalStatus;
      const matchesAlignment =
        alignmentFilter === ALL_ALIGNMENTS || goal.alignment_level === alignmentFilter;
      return matchesSearch && matchesStatus && matchesAlignment;
    });
  }, [alignmentFilter, empGoals, goalSearch, goalStatus]);

  const metricCards = useMemo(() => {
    if (!smartStats) return [];

    const smartWarning = smartStats.avgSmart < 0.7;
    const strategicWarning = smartStats.strategicPct === 0;
    const goalsWarning = smartStats.totalGoals < 3 || smartStats.totalGoals > 5;
    const weightWarning = smartStats.weightSum !== 100;

    return [
      {
        key: "smart",
        label: "Средний SMART",
        value: smartStats.avgSmart.toFixed(2),
        detail: smartWarning ? "Ниже порога 0.7" : "Порог пройден",
        warning: smartWarning,
      },
      {
        key: "strategic",
        label: "Стратегическая доля",
        value: `${smartStats.strategicPct}%`,
        detail: strategicWarning ? "Нет связи" : "Связка подтверждена",
        warning: strategicWarning,
      },
      {
        key: "goals",
        label: "Целей",
        value: String(smartStats.totalGoals),
        detail:
          smartStats.totalGoals > 5
            ? "Макс. 5"
            : smartStats.totalGoals < 3
              ? "Мин. 3"
              : "В пределах нормы",
        warning: goalsWarning,
      },
      {
        key: "weight",
        label: "Сумма весов",
        value: `${smartStats.weightSum}%`,
        detail: weightWarning ? "Нужно 100%" : "Баланс соблюдён",
        warning: weightWarning,
      },
    ];
  }, [smartStats]);

  const normalizedAlerts = useMemo(() => (
    alerts.map((alert) => ({
      ...alert,
      title: ALERT_LABELS[alert.alert_type] ?? alert.alert_type.replace(/_/g, " "),
    }))
  ), [alerts]);

  const recommendedGoal = useMemo(() => {
    if (!empGoals.length) return null;
    return [...empGoals].sort((left, right) => (
      recommendationPriority(right) - recommendationPriority(left)
    ))[0];
  }, [empGoals]);

  const historyGoals = useMemo(() => (
    [...empGoals].sort((left, right) => {
      const rightTs = right.created_at ? new Date(right.created_at).getTime() : 0;
      const leftTs = left.created_at ? new Date(left.created_at).getTime() : 0;
      return rightTs - leftTs;
    })
  ), [empGoals]);

  const selectedDepartmentLabel = deptFilter === ALL_DEPARTMENTS ? "Все подразделения" : deptFilter;

  const handleExport = () => {
    if (!selected) return;

    const rows = [
      ["Сотрудник", selected.full_name],
      ["Должность", selected.position ?? ""],
      ["Подразделение", selected.department ?? ""],
      ["Квартал", `${quarter} ${year}`],
      ["Средний SMART", smartStats?.avgSmart.toFixed(2) ?? ""],
      ["Стратегическая доля", smartStats ? `${smartStats.strategicPct}%` : ""],
      ["Количество целей", smartStats?.totalGoals ?? 0],
      ["Сумма весов", smartStats ? `${smartStats.weightSum}%` : ""],
      [],
      ["goal_text", "status", "smart_index", "alignment_level", "weight", "deadline"],
      ...empGoals.map((goal) => ([
        goal.goal_text ?? goal.title,
        goal.status_label_ru ?? goal.status,
        goal.smart_index?.toFixed(2) ?? "",
        goal.alignment_level ?? "",
        goal.weight ?? "",
        goal.deadline ?? "",
      ])),
    ];

    const csv = rows
      .map((row) => row.map((cell) => csvEscape(cell)).join(";"))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `employee-${selected.id}-${quarter}-${year}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleRecommendationsClick = () => {
    if (recommendedGoal) {
      navigate(`/hr/goals/${recommendedGoal.id}`);
      return;
    }
    setActiveTab("goals");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Сотрудники</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Контроль целей, качества и стратегической связки
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={quarter} onValueChange={setQuarter}>
            <SelectTrigger className="w-28 control-surface">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["Q1", "Q2", "Q3", "Q4"].map((value) => (
                <SelectItem key={value} value={value}>
                  {value} {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleExport} disabled={!selected}>
            Экспорт
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="glass-card-elevated p-4 xl:sticky xl:top-4 xl:self-start">
          <div className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-base font-semibold">Список сотрудников</h2>
              <p className="text-sm text-muted-foreground">
                {selectedDepartmentLabel} · {filteredEmployees.length} человек
              </p>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Поиск по сотрудникам"
                value={employeeSearch}
                onChange={(event) => setEmployeeSearch(event.target.value)}
                className="control-surface pl-10"
              />
            </div>

            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger className="control-surface">
                <SelectValue placeholder="Все подразделения" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_DEPARTMENTS}>Все подразделения</SelectItem>
                {departments.map((department) => (
                  <SelectItem key={department} value={department}>
                    {department}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, index) => (
                  <Skeleton key={index} className="h-20 w-full rounded-2xl" />
                ))}
              </div>
            ) : isError ? (
              <div className="state-panel p-6 text-center text-sm text-muted-foreground">
                Не удалось загрузить сотрудников. Проверьте подключение к API.
              </div>
            ) : (
              <div className="max-h-[68vh] space-y-2 overflow-y-auto pr-1">
                {filteredEmployees.map((employee) => {
                  const initials = employee.full_name
                    .split(" ")
                    .map((name) => name[0] ?? "")
                    .join("")
                    .slice(0, 2)
                    .toUpperCase();

                  return (
                    <button
                      key={employee.id}
                      type="button"
                      onClick={() => setSelectedId(employee.id)}
                      className={cn(
                        "w-full rounded-2xl border px-3 py-3 text-left transition-all",
                        employee.id === selected?.id
                          ? "border-primary/55 bg-primary/8 shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
                          : "border-border/65 bg-card/70 hover:border-primary/30 hover:bg-card",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold leading-5">
                            {employee.full_name}
                          </p>
                          <p className="mt-1 truncate text-sm text-muted-foreground">
                            {employee.position ?? "Должность не указана"}
                          </p>
                          <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                            {employee.department ?? "Подразделение не указано"}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}

                {filteredEmployees.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                    Сотрудники не найдены по выбранному департаменту или поиску.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {!selected ? (
            <div className="glass-card-elevated state-panel p-10 text-center text-sm text-muted-foreground">
              Выберите сотрудника слева, чтобы увидеть сводку и его цели.
            </div>
          ) : (
            <div className="overflow-hidden rounded-[calc(var(--radius)+0.1rem)] border border-border/60 bg-card">
              {/* ── Header ── */}
              <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4 border-b border-border/40">
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                    style={{ background: "#E1F5EE", color: "#085041" }}
                  >
                    {selected.full_name.split(" ").map((n) => n[0] ?? "").join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[17px] font-medium leading-tight">{selected.full_name}</p>
                    <p className="mt-0.5 text-[13px] text-muted-foreground">
                      {selected.position ?? "—"}{selected.department ? ` · ${selected.department}` : ""}
                    </p>
                    {managerName && (
                      <p className="mt-0.5 text-[12px] text-muted-foreground/70">
                        Руководитель: {managerName}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-md border border-border/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {quarter} {year}
                  </span>
                  <button
                    type="button"
                    onClick={handleExport}
                    className="flex items-center gap-1.5 rounded-md border border-border/60 px-2.5 py-1 text-[12px] font-medium text-muted-foreground transition hover:bg-muted/40"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Экспорт
                  </button>
                </div>
              </div>

              {/* ── Tab bar ── */}
              <div className="flex border-b border-border/40 px-5">
                {(["overview", "goals", "history"] as const).map((tab) => {
                  const labels = { overview: "Обзор", goals: "Цели", history: "История" };
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTab(tab)}
                      className={cn(
                        "relative mr-6 py-3 text-[13px] font-medium transition-colors",
                        activeTab === tab
                          ? "text-foreground"
                          : "text-muted-foreground hover:text-foreground/70",
                      )}
                    >
                      {labels[tab]}
                      {activeTab === tab && (
                        <span
                          className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-full"
                          style={{ background: "#1D9E75" }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* ── Tab: Обзор ── */}
              {activeTab === "overview" && (
                <div className="p-5 space-y-4">
                  {goalsLoading ? (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-20 w-full rounded-xl" />
                      ))}
                    </div>
                  ) : smartStats ? (
                    <>
                      {/* Metrics row */}
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {metricCards.map((metric) => (
                          <div
                            key={metric.key}
                            className={cn(
                              "rounded-xl border-[0.5px] border-border/60 bg-muted/28 px-4 py-3",
                              metric.warning && "border-amber-400/35 bg-amber-50/60 dark:bg-amber-900/10",
                            )}
                          >
                            <p className="text-[11px] text-muted-foreground">{metric.label}</p>
                            <p
                              className={cn(
                                "mt-1.5 text-[22px] font-medium leading-none",
                                metric.warning && "text-amber-600 dark:text-amber-400",
                              )}
                            >
                              {metric.value}
                            </p>
                            <p
                              className={cn(
                                "mt-1 text-[11px]",
                                metric.warning
                                  ? "text-amber-600/90 dark:text-amber-300"
                                  : "text-muted-foreground",
                              )}
                            >
                              {metric.detail}
                            </p>
                          </div>
                        ))}
                      </div>

                      {/* SMART profile + Alerts two-column */}
                      <div className="grid gap-4 lg:grid-cols-2">
                        {/* SMART profile */}
                        <div className="rounded-xl border-[0.5px] border-border/60 bg-card px-5 py-4">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                            SMART-профиль
                          </p>
                          <div className="mt-3 space-y-2.5">
                            {smartStats.scores.map(({ key, label, value }) => {
                              const color = SMART_SCORE_COLORS[key] ?? "#888";
                              const pct = Math.round(value * 100);
                              return (
                                <div key={key} className="flex items-center gap-3">
                                  <div
                                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                                    style={{ background: color }}
                                  >
                                    {key}
                                  </div>
                                  <span className="w-20 shrink-0 text-[12px] text-muted-foreground">
                                    {label}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between text-[11px]">
                                      <span className="text-muted-foreground">Оценка</span>
                                      <span className="font-medium">{pct}%</span>
                                    </div>
                                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted/50">
                                      <div
                                        className="h-full rounded-full transition-all"
                                        style={{ width: `${pct}%`, background: color }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Alerts */}
                        <div className="rounded-xl border-[0.5px] border-border/60 bg-card px-5 py-4">
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                              Алерты
                            </p>
                            {normalizedAlerts.length > 0 && (
                              <span
                                className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                                style={{ background: "#FCEBEB", color: "#791F1F" }}
                              >
                                {formatProblemsLabel(normalizedAlerts.length)}
                              </span>
                            )}
                          </div>

                          {normalizedAlerts.length === 0 ? (
                            <div className="mt-4 flex items-center gap-2 text-[13px] text-muted-foreground">
                              <BellOff className="h-4 w-4" />
                              <span>Алертов нет</span>
                            </div>
                          ) : (
                            <div className="mt-3 divide-y divide-border/40">
                              {normalizedAlerts.map((alert, idx) => (
                                <div key={alert.id} className={cn("flex items-start gap-2.5 py-2.5", idx === 0 && "pt-0")}>
                                  <span
                                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                                    style={{ background: alert.severity === "critical" ? "#E24B4A" : "#EF9F27" }}
                                  />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[13px] font-semibold leading-5">
                                      {alert.title}
                                    </p>
                                    <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
                                      {alert.message}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={handleRecommendationsClick}
                            disabled={!recommendedGoal && empGoals.length === 0}
                            className="mt-3 w-full rounded-lg border border-border/60 py-2 text-[12px] font-medium text-muted-foreground transition hover:bg-muted/40"
                          >
                            Получить рекомендации
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-[13px] text-muted-foreground">
                      За {quarter} {year} у сотрудника нет целей.
                    </div>
                  )}
                </div>
              )}

              {/* ── Tab: Цели ── */}
              {activeTab === "goals" && (
                <div className="p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] text-muted-foreground">
                      {quarter} {year} · {filteredGoals.length} из {empGoals.length} целей
                    </p>
                  </div>

                  <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_11rem_11rem]">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Поиск по тексту, метрике"
                        value={goalSearch}
                        onChange={(e) => setGoalSearch(e.target.value)}
                        className="control-surface pl-10"
                      />
                    </div>
                    <Select value={goalStatus} onValueChange={setGoalStatus}>
                      <SelectTrigger className="control-surface">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GOAL_STATUS_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={alignmentFilter} onValueChange={setAlignmentFilter}>
                      <SelectTrigger className="control-surface">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GOAL_ALIGNMENT_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    {goalsLoading && Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-40 w-full rounded-xl" />
                    ))}
                    {!goalsLoading && filteredGoals.length === 0 && (
                      <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-[13px] text-muted-foreground">
                        Нет целей по текущим фильтрам.
                      </div>
                    )}
                    {!goalsLoading && filteredGoals.map((goal) => (
                      <Link
                        key={goal.id}
                        to={`/hr/goals/${goal.id}`}
                        className="block rounded-xl border-[0.5px] border-border/60 p-4 transition-colors hover:border-primary/40 hover:bg-muted/20"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {goal.status_label_ru && (
                                <Badge variant="outline" className="text-[10px]">
                                  {goal.status_label_ru}
                                </Badge>
                              )}
                              {goal.alignment_level && (
                                <Badge variant="outline" className={cn("text-[10px]", ALIGNMENT_CLASS[goal.alignment_level])}>
                                  {ALIGNMENT_LABELS[goal.alignment_level] ?? goal.alignment_level}
                                </Badge>
                              )}
                              {goal.goal_type && (
                                <Badge variant="outline" className={cn("text-[10px]", GOAL_TYPE_CLASS[goal.goal_type])}>
                                  {GOAL_TYPE_LABELS[goal.goal_type] ?? goal.goal_type}
                                </Badge>
                              )}
                            </div>
                            <p className="mt-2.5 text-base font-medium leading-snug">
                              {goal.goal_text ?? goal.title}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                              <span>SMART {(goal.smart_index ?? 0).toFixed(2)}</span>
                              <span>Вес {goal.weight ?? 0}%</span>
                              <span>{goal.quarter ?? quarter} {goal.year ?? year}</span>
                              {goal.deadline && <span>Дедлайн {goal.deadline}</span>}
                            </div>
                          </div>
                          <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Tab: История ── */}
              {activeTab === "history" && (
                <div className="p-5">
                  {historyGoals.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/60 p-10 text-center text-[13px] text-muted-foreground">
                      История появится после создания целей.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {historyGoals.map((goal) => (
                        <Link
                          key={goal.id}
                          to={`/hr/goals/${goal.id}`}
                          className="block rounded-xl border-[0.5px] border-border/60 bg-muted/18 px-4 py-3 transition hover:border-primary/30 hover:bg-muted/28"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] font-semibold leading-5">
                                {goal.goal_text ?? goal.title}
                              </p>
                              <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                                <span>{goal.status_label_ru ?? goal.status}</span>
                                <span>SMART {(goal.smart_index ?? 0).toFixed(2)}</span>
                                {goal.created_at && (
                                  <span>
                                    {new Date(goal.created_at).toLocaleDateString("ru-RU", {
                                      day: "numeric",
                                      month: "short",
                                      year: "numeric",
                                    })}
                                  </span>
                                )}
                              </div>
                            </div>
                            <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
