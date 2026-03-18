import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import GoalCard from "@/components/GoalCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Plus, Loader2, Sparkles, RefreshCw, CheckCircle2 } from "lucide-react";
import { SmartScoreGroup } from "@/components/SmartScoreBar";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import {
  api,
  toGoalCard,
  parseQuarter,
  type EvaluateGoalResponse,
  type Employee,
} from "@/lib/api";
import { formatQuarterYear, getCurrentQuarterYear } from "@/lib/date";

// ── Конфиг фильтров ───────────────────────────────────────────────────────────

const STATUS_FILTERS = ["Все", "Черновик", "На согласовании", "Утверждена", "Отклонена"];
const STATUS_MAP: Record<string, string | undefined> = {
  "Все": undefined,
  "Черновик": "draft",
  "На согласовании": "pending",
  "Утверждена": "approved",
  "Отклонена": "rejected",
};

const ALIGNMENT_LABEL: Record<string, string> = {
  strategic: "Стратегическая",
  functional: "Функциональная",
  operational: "Операционная",
};

const GOAL_TYPE_CLASS: Record<string, string> = {
  impact: "bg-info/10 text-info",
  output: "bg-success/10 text-success",
  activity: "bg-warning/10 text-warning",
};

const ALIGNMENT_CLASS: Record<string, string> = {
  strategic: "bg-info/10 text-info",
  functional: "bg-accent/10 text-accent-foreground",
  operational: "bg-muted text-muted-foreground",
};

// ── Карточка результата оценки ────────────────────────────────────────────────

function EvalResultCard({ ev }: { ev: EvaluateGoalResponse }) {
  type SmartKey = "S" | "M" | "A" | "R" | "T";
  const scores = [
    { key: "S", label: "Specific",   value: ev.scores.S },
    { key: "M", label: "Measurable", value: ev.scores.M },
    { key: "A", label: "Achievable", value: ev.scores.A },
    { key: "R", label: "Relevant",   value: ev.scores.R },
    { key: "T", label: "Time-bound", value: ev.scores.T },
  ];
  const criteriaExplanations = ev.criteria_explanations;
  const good = ev.smart_index >= 0.7;

  return (
    <div className="mt-5 space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">SMART-индекс</span>
          <span className={`font-mono font-bold text-lg ${good ? "text-success" : "text-warning"}`}>
            {ev.smart_index.toFixed(2)}
          </span>
        </div>
        {ev.goal_type && (
          <Badge variant="outline" className={`text-[10px] ${GOAL_TYPE_CLASS[ev.goal_type] ?? "bg-muted"}`}>
            {ev.goal_type.charAt(0).toUpperCase() + ev.goal_type.slice(1)}
          </Badge>
        )}
        {ev.alignment_level && (
          <Badge variant="outline" className={`text-[10px] ${ALIGNMENT_CLASS[ev.alignment_level] ?? "bg-muted"}`}>
            {ALIGNMENT_LABEL[ev.alignment_level] ?? ev.alignment_level}
          </Badge>
        )}
      </div>

      <SmartScoreGroup scores={scores} />

      <div className="grid gap-2 sm:grid-cols-2">
        {scores.map((score) => {
          const explanation = criteriaExplanations[score.key as SmartKey];
          if (!explanation) return null;
          return (
            <div key={score.key} className="rounded-md border bg-muted/20 p-2">
              <p className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground">
                {score.key} · {score.label}
              </p>
              <p className="mt-1 text-xs text-foreground/80">{explanation}</p>
            </div>
          );
        })}
      </div>

      {ev.alignment_source && (
        <p className="text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1">
          Источник связки: <span className="font-medium text-foreground/80">{ev.alignment_source}</span>
        </p>
      )}

      {ev.recommendations.length > 0 && (
        <div className="space-y-1.5">
          {ev.recommendations.map((r) => (
            <div key={r} className="flex items-start gap-2 text-sm text-muted-foreground">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
              {r}
            </div>
          ))}
        </div>
      )}

      {ev.achievability_warning && (
        <div className="text-xs text-warning bg-warning/5 rounded px-2 py-2 border border-warning/20">
          {ev.achievability_warning}
        </div>
      )}

      {ev.weak_criteria.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {ev.weak_criteria.map((c) => (
            <Badge key={c} variant="outline" className="text-[10px] bg-warning/10 text-warning">
              ⚠ {c}
            </Badge>
          ))}
        </div>
      )}

      {!good && ev.rewrite && (
        <div className="bg-muted/40 rounded-lg p-3 text-sm space-y-2">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-primary" /> AI-переформулировка
          </p>
          <p className="text-muted-foreground italic">«{ev.rewrite}»</p>
        </div>
      )}

      {good && (
        <div className="flex items-center gap-2 text-xs text-success bg-success/5 rounded px-3 py-2">
          <CheckCircle2 className="w-3.5 h-3.5" /> Цель соответствует SMART-стандарту
        </div>
      )}
    </div>
  );
}

// ── Основная страница ─────────────────────────────────────────────────────────

export default function GoalsPage() {
  const qc = useQueryClient();

  const [activeFilter, setActiveFilter] = useState("Все");
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [employeeFilter, setEmployeeFilter] = useState("all");

  // SMART-оценка
  const [goalDraft, setGoalDraft] = useState("");
  const [evalPosition, setEvalPosition] = useState("");
  const [evalDepartment, setEvalDepartment] = useState("");
  const [evalResult, setEvalResult] = useState<EvaluateGoalResponse | null>(null);

  // Добавление цели
  const [addOpen, setAddOpen] = useState(false);
  const [newGoalText, setNewGoalText] = useState("");
  const [newWeight, setNewWeight] = useState("");
  const { quarter: currentQuarter, year: currentYear } = getCurrentQuarterYear();
  const [newQuarter, setNewQuarter] = useState(formatQuarterYear(currentQuarter, currentYear));
  const [newStatus, setNewStatus] = useState("draft");
  const [newEmployeeId, setNewEmployeeId] = useState("");

  // ── Запросы ──────────────────────────────────────────────────────────────

  const { data: goals = [], isLoading: goalsLoading, isError: goalsError } = useQuery({
    queryKey: ["goals", STATUS_MAP[activeFilter]],
    queryFn: () => api.goals.list({ status: STATUS_MAP[activeFilter], limit: 200 }),
    staleTime: 30_000,
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["employees"],
    queryFn: () => api.employees.list(),
    staleTime: 60_000,
  });

  // ── Мутации ───────────────────────────────────────────────────────────────

  const evaluateMutation = useMutation({
    mutationFn: () =>
      api.evaluate.goal({
        goal_text: goalDraft,
        position: evalPosition || undefined,
        department: evalDepartment || undefined,
      }),
    onSuccess: (data) => setEvalResult(data),
    onError: (e: Error) =>
      toast({ title: "Ошибка оценки", description: e.message, variant: "destructive" }),
  });

  const createGoalMutation = useMutation({
    mutationFn: () => {
      const { quarter, year } = parseQuarter(newQuarter);
      return api.goals.create({
        employee_id: newEmployeeId,
        goal_text: newGoalText,
        weight: newWeight ? Number(newWeight) : undefined,
        quarter,
        year,
        status: newStatus,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      setAddOpen(false);
      setNewGoalText("");
      setNewWeight("");
      setNewEmployeeId("");
      toast({ title: "Цель создана", description: "Цель добавлена в систему." });
    },
    onError: (e: Error) =>
      toast({ title: "Ошибка создания", description: e.message, variant: "destructive" }),
  });

  const deleteGoalMutation = useMutation({
    mutationFn: (goalId: string) => api.goals.delete(goalId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      toast({ title: "Черновик удалён" });
    },
    onError: (e: Error) =>
      toast({ title: "Ошибка удаления", description: e.message, variant: "destructive" }),
  });

  // ── Derived ───────────────────────────────────────────────────────────────

  const departments = useMemo(() => {
    const vals = new Set(employees.map((e) => e.department).filter(Boolean) as string[]);
    return Array.from(vals).sort((a, b) => a.localeCompare(b, "ru"));
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    if (deptFilter === "all") return employees;
    return employees.filter((e) => e.department === deptFilter);
  }, [employees, deptFilter]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return goals.filter((g) => {
      const matchSearch = !q ||
        (g.goal_text ?? g.title).toLowerCase().includes(q) ||
        (g.employee_name ?? "").toLowerCase().includes(q);
      const matchDept = deptFilter === "all" || (g.department ?? "") === deptFilter;
      const matchEmployee = employeeFilter === "all" || g.employee_id === employeeFilter;
      return matchSearch && matchDept && matchEmployee;
    });
  }, [goals, search, deptFilter, employeeFilter]);

  // ── Рендер ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Цели сотрудников</h1>
          <p className="text-xs text-muted-foreground mt-1">
            SMART-оценка, стратегическая связка и управление целями · {goals.length} целей
          </p>
        </div>

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" /> Добавить цель
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Новая цель</DialogTitle>
              <DialogDescription>
                Введите формулировку цели. AI-оценка доступна после сохранения.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Сотрудник</label>
                <Select value={newEmployeeId} onValueChange={setNewEmployeeId}>
                  <SelectTrigger className="control-surface">
                    <SelectValue placeholder="Выберите сотрудника" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.full_name} — {e.position}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Формулировка цели</label>
                <Textarea
                  value={newGoalText}
                  onChange={(e) => setNewGoalText(e.target.value)}
                  placeholder="Снизить время обработки заявок с 48 до 36 ч к 31 марта 2026 г."
                  rows={3}
                  className="control-surface"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-muted-foreground">Вес, %</label>
                    <button
                      type="button"
                      className="text-[10px] text-primary underline"
                      onClick={() => setNewWeight("25")}
                    >
                      25% (4 цели)
                    </button>
                  </div>
                  <Input
                    type="number"
                    value={newWeight}
                    onChange={(e) => setNewWeight(e.target.value)}
                    placeholder="например, 25 (при 4 целях = 100%)"
                    className="control-surface"
                  />
                  <p className="text-[10px] text-muted-foreground/60">сумма весов всех целей должна быть 100%</p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Квартал</label>
                  <Input
                    value={newQuarter}
                    onChange={(e) => setNewQuarter(e.target.value)}
                    placeholder="Q2 2026"
                    className="control-surface"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Статус</label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger className="control-surface"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Черновик</SelectItem>
                    <SelectItem value="pending">На согласовании</SelectItem>
                    <SelectItem value="approved">Утверждена</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)}>Отмена</Button>
              <Button
                onClick={() => createGoalMutation.mutate()}
                disabled={!newGoalText.trim() || !newEmployeeId || createGoalMutation.isPending}
              >
                {createGoalMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Создать
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Фильтры */}
      <div className="glass-card-elevated p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по целям и сотрудникам..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 control-surface"
            />
          </div>
          <Select value={activeFilter} onValueChange={setActiveFilter}>
            <SelectTrigger className="control-surface w-44">
              <SelectValue placeholder="Статус" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((f) => (
                <SelectItem key={f} value={f}>{f}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={deptFilter} onValueChange={(v) => { setDeptFilter(v); setEmployeeFilter("all"); }}>
            <SelectTrigger className="control-surface w-48">
              <SelectValue placeholder="Все подразделения" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все подразделения</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
            <SelectTrigger className="control-surface w-48">
              <SelectValue placeholder="Все сотрудники" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все сотрудники</SelectItem>
              {filteredEmployees.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* AI SMART-оценка */}
      <div className="glass-card-elevated p-5">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">AI SMART-оценка цели</h3>
          </div>
          <div className="mt-4 space-y-3">
            <Textarea
              placeholder="Вставьте формулировку цели для AI-оценки..."
              value={goalDraft}
              onChange={(e) => { setGoalDraft(e.target.value); setEvalResult(null); }}
              rows={3}
              className="control-surface"
            />
            <Button
              onClick={() => evaluateMutation.mutate()}
              disabled={!goalDraft.trim() || evaluateMutation.isPending}
              className="gap-2"
              variant={evalResult ? "outline" : "default"}
            >
              {evaluateMutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Анализирую...</>
                : <><Sparkles className="w-4 h-4" /> {evalResult ? "Переоценить" : "Оценить SMART"}</>
              }
            </Button>
          </div>
          {evalResult && <EvalResultCard ev={evalResult} />}
      </div>

      {/* Список целей */}
      <div className="space-y-3">
        {goalsLoading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="glass-card-elevated p-5 space-y-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ))
          : goalsError
          ? (
            <div className="glass-card-elevated state-panel p-12 text-center text-muted-foreground">
              <p className="text-sm">Не удалось загрузить список целей</p>
              <p className="text-xs mt-1">Проверьте подключение к backend и повторите обновление</p>
            </div>
          )
          : filtered.length > 0
          ? filtered.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={toGoalCard(goal)}
                onDelete={goal.status === "draft" ? () => deleteGoalMutation.mutate(goal.id) : undefined}
              />
            ))
          : (
            <div className="glass-card-elevated state-panel p-12 text-center text-muted-foreground">
              <p className="text-sm">Цели не найдены</p>
              <p className="text-xs mt-1">Попробуйте изменить фильтры или добавьте первую цель</p>
            </div>
          )
        }
      </div>
    </div>
  );
}
