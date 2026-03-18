import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import GoalCard from "@/components/GoalCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SmartScoreGroup } from "@/components/SmartScoreBar";
import { toast } from "@/components/ui/use-toast";
import { api, toGoalCard, type EvaluateGoalResponse } from "@/lib/api";
import { formatQuarterYear, getCurrentQuarterYear } from "@/lib/date";
import { getRemainingWeight, getSuggestedGoalWeight } from "@/lib/goal-weight";
import { useCurrentEmployee } from "@/hooks/use-current-employee";
import { AlertTriangle, Wand2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function EmployeeGoalsPage() {
  const qc = useQueryClient();
  const formRef = useRef<HTMLDivElement>(null);
  const { employeeId, detail } = useCurrentEmployee();
  const { quarter, year } = getCurrentQuarterYear();
  const quarterLabel = formatQuarterYear(quarter, year);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [goalText, setGoalText] = useState("");
  const [metric, setMetric] = useState("");
  const [deadline, setDeadline] = useState("");
  const [weight, setWeight] = useState<number | "">("");
  const [weightTouched, setWeightTouched] = useState(false);
  const [evalResult, setEvalResult] = useState<EvaluateGoalResponse | null>(null);

  const { data: goals = [], isLoading } = useQuery({
    queryKey: ["employee-goals", employeeId, quarter, year],
    queryFn: () => api.employees.goals(employeeId!, { quarter, year }),
    enabled: !!employeeId,
    staleTime: 30_000,
  });

  const evaluateMutation = useMutation({
    mutationFn: () =>
      api.evaluate.goal({
        goal_text: goalText,
        position: detail?.position ?? undefined,
        department: detail?.department ?? undefined,
      }),
    onSuccess: (data) => setEvalResult(data),
    onError: (e: Error) =>
      toast({ title: "Ошибка оценки", description: e.message, variant: "destructive" }),
  });

  const createGoalMutation = useMutation({
    mutationFn: (status: "draft" | "pending") =>
      api.goals.create({
        employee_id: employeeId!,
        goal_text: goalText,
        metric: metric || undefined,
        deadline: deadline || undefined,
        weight: effectiveWeight,
        status,
        quarter,
        year,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee-goals", employeeId, quarter, year] });
      setGoalText("");
      setMetric("");
      setDeadline("");
      setWeight("");
      setWeightTouched(false);
      setEvalResult(null);
      toast({ title: "Цель создана", description: "Цель добавлена в ваш набор." });
    },
    onError: (e: Error) =>
      toast({ title: "Ошибка создания", description: e.message, variant: "destructive" }),
  });

  const deleteGoalMutation = useMutation({
    mutationFn: (goalId: string) => api.goals.delete(goalId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee-goals", employeeId, quarter, year] });
      toast({ title: "Черновик удалён" });
    },
    onError: (e: Error) =>
      toast({ title: "Ошибка удаления", description: e.message, variant: "destructive" }),
  });

  const summary = useMemo(() => {
    const totalGoals = goals.length;
    const weightSum = Math.round(goals.reduce((sum, g) => sum + (g.weight ?? 0), 0));
    const avgSmart = totalGoals > 0
      ? goals.reduce((s, g) => s + (g.smart_index ?? 0.5), 0) / totalGoals
      : 0;
    const strategicShare = totalGoals > 0
      ? Math.round((goals.filter((g) => g.alignment_level === "strategic").length / totalGoals) * 100)
      : 0;
    return { totalGoals, weightSum, avgSmart, strategicShare };
  }, [goals]);

  const filteredGoals = useMemo(() =>
    statusFilter === "all" ? goals : goals.filter((g) => g.status === statusFilter),
  [goals, statusFilter]);

  const remainingWeight = useMemo(
    () => getRemainingWeight(summary.weightSum),
    [summary.weightSum],
  );
  const suggestedWeight = useMemo(
    () => getSuggestedGoalWeight(summary.totalGoals, summary.weightSum),
    [summary.totalGoals, summary.weightSum],
  );
  const effectiveWeight =
    weight === ""
      ? (suggestedWeight > 0 ? suggestedWeight : undefined)
      : Number(weight);
  const canCreateGoal =
    !!goalText.trim() &&
    !createGoalMutation.isPending &&
    effectiveWeight !== undefined;

  useEffect(() => {
    if (weightTouched) return;
    setWeight(suggestedWeight > 0 ? suggestedWeight : "");
  }, [suggestedWeight, weightTouched]);

  const scrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (!employeeId) {
    return (
      <div className="glass-card-elevated state-panel p-8 text-sm text-muted-foreground">
        Сотрудник не найден. Проверьте данные в БД.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Мои цели</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Управление и доработка целей · {quarterLabel}
          </p>
        </div>
        <Button className="gap-2" onClick={scrollToForm}>
          + Создать цель
        </Button>
      </div>

      <div className="space-y-4">
        <div className="glass-card-elevated p-5 space-y-4" ref={formRef}>
          <div>
            <h3 className="text-sm font-semibold">Новая цель + AI оценка</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Введите формулировку — AI вернёт SMART-оценку и рекомендации
            </p>
          </div>

          <Textarea
            placeholder="Например: Повысить % закрытия вакансий с 62% до 75% к 30.06.2026..."
            value={goalText}
            onChange={(e) => { setGoalText(e.target.value); setEvalResult(null); }}
            rows={3}
            className="control-surface"
          />

          <Button
            onClick={() => evaluateMutation.mutate()}
            className="gap-2 w-full"
            disabled={!goalText.trim() || evaluateMutation.isPending}
            variant={evalResult ? "outline" : "default"}
          >
            <Wand2 className="w-4 h-4" />
            {evalResult ? "Переоценить SMART" : "Оценить SMART"}
          </Button>

          {evalResult && (
            <div className="space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Индекс качества</span>
                <span className={`font-mono font-semibold ${evalResult.smart_index >= 0.7 ? "text-success" : "text-warning"}`}>
                  {evalResult.smart_index.toFixed(2)}
                </span>
              </div>
              <SmartScoreGroup
                scores={[
                  { key: "S", label: "Specific", value: evalResult.scores.S },
                  { key: "M", label: "Measurable", value: evalResult.scores.M },
                  { key: "A", label: "Achievable", value: evalResult.scores.A },
                  { key: "R", label: "Relevant", value: evalResult.scores.R },
                  { key: "T", label: "Time-bound", value: evalResult.scores.T },
                ]}
              />
              {evalResult.goal_type && (
                <Badge variant="outline" className="text-[10px]">
                  {evalResult.goal_type}
                </Badge>
              )}
              {evalResult.recommendations.length > 0 && (
                <div className="space-y-1 text-sm text-muted-foreground">
                  {evalResult.recommendations.map((rec) => (
                    <div key={rec} className="flex items-start gap-2">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                      <span>{rec}</span>
                    </div>
                  ))}
                </div>
              )}
              {evalResult.achievability_warning && (
                <div className="text-xs text-warning bg-warning/5 rounded px-2 py-2 border border-warning/20">
                  {evalResult.achievability_warning}
                </div>
              )}
              {evalResult.smart_index < 0.7 && evalResult.rewrite && (
                <div className="bg-muted/40 rounded-lg p-3 text-sm space-y-2">
                  <p className="text-xs text-muted-foreground">AI-переформулировка:</p>
                  <p className="text-muted-foreground italic">{evalResult.rewrite}</p>
                  <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => setGoalText(evalResult.rewrite)}>
                    <Wand2 className="w-3 h-3" /> Применить
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="space-y-3 border-t border-border/50 pt-3">
            <p className="text-xs text-muted-foreground font-medium">Параметры цели:</p>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Метрика</label>
              <Input
                value={metric}
                onChange={(e) => setMetric(e.target.value)}
                placeholder="Числовой KPI"
                className="control-surface"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Срок выполнения</label>
              <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="control-surface" />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">Вес цели, %</label>
                {suggestedWeight > 0 && (
                  <button
                    type="button"
                    className="text-[10px] text-primary underline"
                    onClick={() => {
                      setWeight(suggestedWeight);
                      setWeightTouched(false);
                    }}
                  >
                    Авто: {suggestedWeight}%
                  </button>
                )}
              </div>
              <Input
                type="number"
                min={0}
                max={100}
                value={weight}
                onChange={(e) => {
                  setWeightTouched(true);
                  setWeight(e.target.value === "" ? "" : Number(e.target.value));
                }}
                placeholder={suggestedWeight > 0 ? `Авто ${suggestedWeight}%` : "0–100"}
                className="control-surface"
              />
              {remainingWeight > 0 ? (
                <p className="text-[10px] text-muted-foreground/60">
                  Авто-вес: {suggestedWeight}% · свободно {remainingWeight}% из 100%.
                  При необходимости значение можно скорректировать вручную.
                </p>
              ) : (
                <p className="text-[10px] text-warning">
                  Свободный вес уже исчерпан. Чтобы добавить ещё одну цель, сначала пересоберите набор весов.
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => createGoalMutation.mutate("draft")}
                disabled={!canCreateGoal}
              >
                Сохранить черновик
              </Button>
              <Button
                onClick={() => createGoalMutation.mutate("pending")}
                disabled={!canCreateGoal}
              >
                Отправить на согласование
              </Button>
            </div>

            {summary.totalGoals > 0 && (summary.totalGoals < 3 || summary.totalGoals > 5) && (
              <div className="flex items-center gap-2 text-xs text-warning">
                <AlertTriangle className="w-3 h-3" />
                Количество целей {summary.totalGoals} вне диапазона 3–5
              </div>
            )}
            {summary.weightSum > 0 && summary.weightSum !== 100 && (
              <div className="flex items-center gap-2 text-xs text-warning">
                <AlertTriangle className="w-3 h-3" />
                Сумма весов {summary.weightSum}% (должно быть 100%)
              </div>
            )}
          </div>
        </div>

      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Мои цели</h3>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="control-surface w-48">
              <SelectValue placeholder="Статус" />
            </SelectTrigger>
            <SelectContent>
              {[
                { value: "all",      label: "Все" },
                { value: "draft",    label: "Черновик" },
                { value: "pending",  label: "На согласовании" },
                { value: "approved", label: "Утверждена" },
                { value: "rejected", label: "Отклонена" },
              ].map((f) => (
                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-3">
          {isLoading && <Skeleton className="h-28 w-full rounded-xl" />}
          {!isLoading && filteredGoals.length === 0 && (
            <div className="glass-card-elevated state-panel p-8 text-sm text-center text-muted-foreground">
              {statusFilter === "all" ? "Цели не найдены" : "Нет целей с таким статусом"}
            </div>
          )}
          {filteredGoals.map((g) => (
            <GoalCard
              key={g.id}
              goal={toGoalCard(g)}
              onDelete={g.status === "draft" ? () => deleteGoalMutation.mutate(g.id) : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
