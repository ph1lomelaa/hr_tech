import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import GoalCard from "@/components/GoalCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Plus, Loader2, Sparkles, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
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
import { api, toGoalCard, parseQuarter, type EvaluateGoalResponse, type Employee } from "@/lib/api";

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
  const scores = [
    { key: "S", label: "Specific",   value: ev.scores.S },
    { key: "M", label: "Measurable", value: ev.scores.M },
    { key: "A", label: "Achievable", value: ev.scores.A },
    { key: "R", label: "Relevant",   value: ev.scores.R },
    { key: "T", label: "Time-bound", value: ev.scores.T },
  ];
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

  // SMART-оценка
  const [goalDraft, setGoalDraft] = useState("");
  const [evalPosition, setEvalPosition] = useState("");
  const [evalDepartment, setEvalDepartment] = useState("");
  const [evalResult, setEvalResult] = useState<EvaluateGoalResponse | null>(null);

  // Добавление цели
  const [addOpen, setAddOpen] = useState(false);
  const [newGoalText, setNewGoalText] = useState("");
  const [newWeight, setNewWeight] = useState("");
  const [newQuarter, setNewQuarter] = useState("Q2 2026");
  const [newStatus, setNewStatus] = useState("draft");
  const [newEmployeeId, setNewEmployeeId] = useState("");

  // Пакетная оценка
  const [batchEmployeeId, setBatchEmployeeId] = useState("");
  const [batchQuarter, setBatchQuarter] = useState("Q1 2026");

  // ── Запросы ──────────────────────────────────────────────────────────────

  const { data: goals = [], isLoading: goalsLoading } = useQuery({
    queryKey: ["goals", STATUS_MAP[activeFilter]],
    queryFn: () => api.goals.list({ status: STATUS_MAP[activeFilter], limit: 200 }),
    staleTime: 30_000,
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["employees"],
    queryFn: () => api.employees.list(),
    staleTime: 60_000,
  });

  const { data: batchGoals = [] } = useQuery({
    queryKey: ["emp-goals", batchEmployeeId, batchQuarter],
    queryFn: () => {
      const { quarter, year } = parseQuarter(batchQuarter);
      return api.employees.goals(batchEmployeeId, { quarter, year });
    },
    enabled: !!batchEmployeeId,
    staleTime: 30_000,
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

  // ── Derived ───────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return goals.filter((g) =>
      !q ||
      (g.goal_text ?? g.title).toLowerCase().includes(q) ||
      (g.employee_name ?? "").toLowerCase().includes(q)
    );
  }, [goals, search]);

  const batchSummary = useMemo(() => {
    const total = batchGoals.length;
    const weightSum = batchGoals.reduce((s, g) => s + (g.weight ?? 0), 0);
    const avgSmart =
      total > 0
        ? batchGoals.reduce((s, g) => s + (g.smart_index ?? 0.5), 0) / total
        : 0;
    const map: Record<string, number[]> = { S: [], M: [], A: [], R: [], T: [] };
    batchGoals.forEach((g) => {
      if (g.scores) {
        map.S.push(g.scores.S); map.M.push(g.scores.M);
        map.A.push(g.scores.A); map.R.push(g.scores.R); map.T.push(g.scores.T);
      }
    });
    const weakCriteria = Object.entries(map)
      .filter(([, v]) => v.length > 0 && v.reduce((a, b) => a + b, 0) / v.length < 0.6)
      .map(([k]) => ({ S: "Specific", M: "Measurable", A: "Achievable", R: "Relevant", T: "Time-bound" }[k] ?? k));
    return { total, weightSum, avgSmart, weakCriteria };
  }, [batchGoals]);

  // ── Рендер ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Заголовок */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Цели сотрудников</h1>
          <p className="text-sm text-muted-foreground mt-1">
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
                  <SelectTrigger>
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
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Вес, %</label>
                  <Input type="number" value={newWeight} onChange={(e) => setNewWeight(e.target.value)} placeholder="25" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Квартал</label>
                  <Input value={newQuarter} onChange={(e) => setNewQuarter(e.target.value)} placeholder="Q2 2026" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Статус</label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по целям и сотрудникам..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-muted/50 border-transparent"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeFilter === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <Button
          variant="ghost" size="sm" className="h-8 text-xs gap-1"
          onClick={() => qc.invalidateQueries({ queryKey: ["goals"] })}
        >
          <RefreshCw className="w-3 h-3" /> Обновить
        </Button>
      </div>

      {/* SMART-оценка + Пакетная сводка */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-4">

        {/* AI SMART-оценка */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">AI SMART-оценка цели</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Оценивает S/M/A/R/T, тип цели (activity/output/impact) и стратегическую связку через LLM
          </p>
          <div className="mt-4 space-y-3">
            <Textarea
              placeholder="Вставьте формулировку цели для AI-оценки..."
              value={goalDraft}
              onChange={(e) => { setGoalDraft(e.target.value); setEvalResult(null); }}
              rows={3}
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="Должность (необяз.)"
                value={evalPosition}
                onChange={(e) => setEvalPosition(e.target.value)}
                className="text-xs"
              />
              <Input
                placeholder="Подразделение (необяз.)"
                value={evalDepartment}
                onChange={(e) => setEvalDepartment(e.target.value)}
                className="text-xs"
              />
            </div>
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

        {/* Пакетная оценка */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold">Пакетная оценка (F-18)</h3>
          <div className="mt-3 space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Сотрудник</label>
              <Select value={batchEmployeeId} onValueChange={setBatchEmployeeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите сотрудника" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.full_name} — {e.position}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Квартал</label>
              <Input value={batchQuarter} onChange={(e) => setBatchQuarter(e.target.value)} placeholder="Q1 2026" className="text-xs" />
            </div>
          </div>

          {batchEmployeeId && (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Целей</p>
                  <p className={`font-mono font-semibold ${
                    batchSummary.total === 0 ? "text-muted-foreground" :
                    (batchSummary.total < 3 || batchSummary.total > 5) ? "text-warning" : "text-success"
                  }`}>
                    {batchSummary.total > 0 ? `${batchSummary.total} / 3–5` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Сумма весов</p>
                  <p className={`font-mono font-semibold ${
                    batchSummary.weightSum !== 100 && batchSummary.total > 0 ? "text-warning" : ""
                  }`}>
                    {batchSummary.total > 0 ? `${batchSummary.weightSum}%` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Средний SMART</p>
                  <p className={`font-mono font-semibold ${
                    batchSummary.avgSmart >= 0.7 ? "text-success" :
                    batchSummary.avgSmart > 0 ? "text-warning" : "text-muted-foreground"
                  }`}>
                    {batchSummary.avgSmart > 0 ? batchSummary.avgSmart.toFixed(2) : "—"}
                  </p>
                </div>
              </div>

              {batchSummary.total > 0 && (
                <div className="space-y-1">
                  {(batchSummary.total < 3 || batchSummary.total > 5) && (
                    <div className="text-xs text-warning bg-warning/5 rounded px-2 py-1 flex items-center gap-1.5">
                      <AlertTriangle className="w-3 h-3" /> Целей {batchSummary.total} — вне диапазона 3–5
                    </div>
                  )}
                  {batchSummary.weightSum !== 100 && (
                    <div className="text-xs text-warning bg-warning/5 rounded px-2 py-1 flex items-center gap-1.5">
                      <AlertTriangle className="w-3 h-3" /> Сумма весов {batchSummary.weightSum}% ≠ 100%
                    </div>
                  )}
                  {batchSummary.total >= 3 && batchSummary.total <= 5 && batchSummary.weightSum === 100 && (
                    <div className="text-xs text-success bg-success/5 rounded px-2 py-1 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3 h-3" /> Набор целей корректен
                    </div>
                  )}
                </div>
              )}

              {batchSummary.weakCriteria.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Слабые SMART-критерии:</p>
                  <div className="flex flex-wrap gap-1">
                    {batchSummary.weakCriteria.map((c) => (
                      <Badge key={c} variant="outline" className="text-[10px] bg-warning/10 text-warning">⚠ {c}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {batchSummary.total === 0 && (
                <p className="text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1">
                  Нет целей за выбранный квартал
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Список целей */}
      <div className="space-y-3">
        {goalsLoading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="glass-card p-5 space-y-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ))
          : filtered.length > 0
          ? filtered.map((goal) => <GoalCard key={goal.id} goal={toGoalCard(goal)} />)
          : (
            <div className="glass-card p-12 text-center text-muted-foreground">
              <p className="text-sm">Цели не найдены</p>
              <p className="text-xs mt-1">Попробуйте изменить фильтры или добавьте первую цель</p>
            </div>
          )
        }
      </div>
    </div>
  );
}
