import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SmartScoreGroup } from "@/components/SmartScoreBar";
import { useRole } from "@/context/RoleContext";
import { api } from "@/lib/api";
import { CheckCircle2, XCircle, History } from "lucide-react";
import { useCurrentEmployee } from "@/hooks/use-current-employee";
import AnalyzingBar from "@/components/AnalyzingBar";

const statusLabels: Record<string, string> = {
  draft: "Черновик",
  pending: "На согласовании",
  approved: "Утверждена",
  rejected: "Отклонена",
};

const alignmentLabels: Record<string, string> = {
  strategic: "Стратегическая",
  functional: "Функциональная",
  operational: "Операционная",
};

const goalTypeLabels: Record<string, string> = {
  activity: "Activity",
  output: "Output",
  impact: "Impact",
};

export default function GoalDetailPage() {
  const { role } = useRole();
  const { goalId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { employeeId } = useCurrentEmployee();
  const [comment, setComment] = useState("");
  const [rejectMode, setRejectMode] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const backPath =
    role === "employee" ? "/employee/goals" :
    role === "manager" ? "/manager/team-goals" :
    "/hr/goals";

  const { data: goal, isLoading } = useQuery({
    queryKey: ["goal", goalId],
    queryFn: () => api.goals.get(goalId!),
    enabled: !!goalId,
    staleTime: 30_000,
  });

  const { data: events = [] } = useQuery({
    queryKey: ["goal-events", goalId],
    queryFn: () => api.goals.events(goalId!),
    enabled: !!goalId,
    staleTime: 60_000,
  });

  // Если у цели нет оценки — автоматически запрашиваем её (safety-net для seed-данных)
  const autoEvalMutation = useMutation({
    mutationFn: () => api.evaluate.existingGoal(goalId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goal", goalId] });
      qc.invalidateQueries({ queryKey: ["goals"] });
      qc.invalidateQueries({ queryKey: ["emp-goals"] });
    },
  });
  const {
    mutate: triggerAutoEvaluate,
    isPending: isAutoEvalPending,
    isSuccess: isAutoEvalSuccess,
  } = autoEvalMutation;

  useEffect(() => {
    if (goal && goal.smart_index === null && !isAutoEvalPending && !isAutoEvalSuccess) {
      triggerAutoEvaluate();
    }
  }, [goal, isAutoEvalPending, isAutoEvalSuccess, triggerAutoEvaluate]);

  const updateStatusMutation = useMutation({
    mutationFn: (status: "approved" | "rejected") =>
      api.goals.updateStatus(goalId!, status, comment || undefined),
    onSuccess: (updated) => {
      qc.setQueryData(["goal", goalId], updated);
      qc.invalidateQueries({ queryKey: ["goals"] });
      qc.invalidateQueries({ queryKey: ["employee-goals"] });
      qc.invalidateQueries({ queryKey: ["team-goals"] });
      qc.invalidateQueries({ queryKey: ["recent-goals"] });
      qc.invalidateQueries({ queryKey: ["pending-goals"] });
      setActionMessage(
        updated.status === "approved"
          ? "Цель утверждена. Сотрудник уведомлён."
          : "Цель отклонена. Комментарий отправлен сотруднику."
      );
      setComment("");
      setRejectMode(false);
    },
  });

  const deleteGoalMutation = useMutation({
    mutationFn: () => api.goals.delete(goalId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      qc.invalidateQueries({ queryKey: ["employee-goals"] });
      qc.invalidateQueries({ queryKey: ["team-goals"] });
      qc.invalidateQueries({ queryKey: ["recent-goals"] });
      qc.invalidateQueries({ queryKey: ["pending-goals"] });
      navigate(backPath);
    },
  });

  const scores = useMemo(() => {
    if (!goal?.scores) return [];
    return [
      { key: "S", label: "Specific", value: goal.scores.S },
      { key: "M", label: "Measurable", value: goal.scores.M },
      { key: "A", label: "Achievable", value: goal.scores.A },
      { key: "R", label: "Relevant", value: goal.scores.R },
      { key: "T", label: "Time-bound", value: goal.scores.T },
    ];
  }, [goal]);

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-4xl">
        <p className="text-sm text-muted-foreground">Загрузка цели...</p>
      </div>
    );
  }

  if (!goal) {
    return (
      <div className="space-y-4 max-w-4xl">
        <h1 className="text-2xl font-bold">Цель не найдена</h1>
        <Button asChild>
          <Link to={backPath}>Вернуться к списку</Link>
        </Button>
      </div>
    );
  }

  const currentStatus = goal.status;
  const canReview = (role === "manager" || role === "hr") && currentStatus === "pending";
  const canDeleteDraft =
    currentStatus === "draft" &&
    (role === "hr" || (employeeId !== null && goal.employee_id === employeeId));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to={backPath} className="text-xs text-muted-foreground hover:text-foreground">
            ← К списку целей
          </Link>
          <h1 className="text-2xl font-bold tracking-tight mt-2">Детали цели</h1>
          <p className="text-xs text-muted-foreground mt-1">{goal.employee_name ?? "Сотрудник"} · {goal.position ?? "—"}</p>
        </div>
        <div className="flex items-center gap-2">
          {canDeleteDraft && (
            <Button
              variant="destructive"
              disabled={deleteGoalMutation.isPending}
              onClick={() => {
                const confirmed = window.confirm("Удалить черновик цели?");
                if (confirmed) {
                  deleteGoalMutation.mutate();
                }
              }}
            >
              {deleteGoalMutation.isPending ? "Удаляю..." : "Удалить черновик"}
            </Button>
          )}
          <Button variant="outline" onClick={() => window.print()}>Экспорт карточки</Button>
        </div>
      </div>

      <div className="glass-card p-6 space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="text-xs">
            {statusLabels[currentStatus] ?? currentStatus}
          </Badge>
          {goal.alignment_level && (
            <Badge variant="outline" className="text-xs">
              {alignmentLabels[goal.alignment_level] ?? goal.alignment_level}
            </Badge>
          )}
          {goal.goal_type && (
            <Badge variant="outline" className="text-xs">
              {goalTypeLabels[goal.goal_type] ?? goal.goal_type}
            </Badge>
          )}
          <Badge variant="outline" className="text-xs">
            {goal.quarter ?? "—"} {goal.year ?? ""}
          </Badge>
        </div>

        <p className="text-sm leading-relaxed">{goal.goal_text ?? goal.title}</p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Метрика</p>
            <p className="font-medium">{goal.metric ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Дедлайн</p>
            <p className="font-medium">{goal.deadline ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Вес цели</p>
            <p className="font-medium">{goal.weight ?? "—"}%</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">SMART индекс</p>
            <p className={`font-mono font-semibold ${(goal.smart_index ?? 0) >= 0.7 ? "text-success" : "text-warning"}`}>
              {(goal.smart_index ?? 0).toFixed(2)}
            </p>
          </div>
        </div>

        {goal.source_doc_title && (
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2 text-sm">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Источник AI-генерации
            </p>
            <p className="font-medium">{goal.source_doc_title}</p>
            {goal.source_quote && (
              <p className="text-muted-foreground italic">«{goal.source_quote}»</p>
            )}
            {goal.generation_context && (
              <p className="text-xs text-muted-foreground">Контекст: {goal.generation_context}</p>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-4">
        <div className="space-y-4">
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-3">SMART-оценка</h3>
            {scores.length > 0 ? (
              <SmartScoreGroup scores={scores} />
            ) : (
              <div className="space-y-3 py-1">
                <p className="text-sm font-medium text-foreground/80">Идёт анализ цели</p>
                <AnalyzingBar />
                <p className="text-xs text-muted-foreground/70">
                  Оценка будет рассчитана автоматически — обычно занимает несколько секунд
                </p>
              </div>
            )}
          </div>

          {currentStatus !== "approved" && goal.recommendations?.length > 0 && (
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold mb-3">AI-рекомендации</h3>
              <div className="space-y-2 text-sm text-muted-foreground">
                {goal.recommendations.map((rec) => (
                  <div key={rec} className="flex items-start gap-2">
                    <span className="mt-1 w-2 h-2 rounded-full bg-primary shrink-0" />
                    <span>{rec}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentStatus !== "approved" && goal.rewrite && (
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold mb-3">Переформулировка</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{goal.rewrite}</p>
            </div>
          )}

          {canReview && (
            <div className="glass-card p-5 space-y-3 border-primary/20">
              <h3 className="text-sm font-semibold">Решение по цели</h3>
              {(goal.smart_index ?? 0) < 0.6 && (
                <div className="bg-destructive/10 text-destructive text-xs rounded-lg p-2">
                  Низкий SMART-индекс ({(goal.smart_index ?? 0).toFixed(2)}). Рекомендуется отправить на доработку.
                </div>
              )}
              {!rejectMode ? (
                <div className="space-y-2">
                  <Textarea
                    placeholder="Комментарий для сотрудника (необязательно при утверждении)"
                    rows={2}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button className="gap-2 flex-1" onClick={() => updateStatusMutation.mutate("approved")}>
                      <CheckCircle2 className="w-4 h-4" /> Утвердить
                    </Button>
                    <Button variant="destructive" className="gap-2 flex-1" onClick={() => setRejectMode(true)}>
                      <XCircle className="w-4 h-4" /> Отклонить
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Textarea
                    placeholder="Укажите причину и что нужно доработать..."
                    rows={3}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button variant="destructive" className="gap-2 flex-1" onClick={() => updateStatusMutation.mutate("rejected")}>
                      <XCircle className="w-4 h-4" /> Подтвердить отклонение
                    </Button>
                    <Button variant="ghost" onClick={() => setRejectMode(false)}>Отмена</Button>
                  </div>
                </div>
              )}
              {actionMessage && <p className="text-xs text-muted-foreground">{actionMessage}</p>}
            </div>
          )}

          {!canReview && (currentStatus === "approved" || currentStatus === "rejected") && (
            <div className={`glass-card p-4 ${currentStatus === "approved" ? "border-success/30" : "border-destructive/30"}`}>
              <p className={currentStatus === "approved" ? "text-success" : "text-destructive"}>
                {currentStatus === "approved" ? "✓ Цель утверждена" : "✗ Цель отклонена"}
              </p>
              {actionMessage && <p className="text-xs text-muted-foreground mt-1">{actionMessage}</p>}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-3">Стратегическая связка</h3>
            {goal.alignment_source ? (
              <>
                <Badge variant="outline" className="text-xs">{goal.alignment_source}</Badge>
                <p className="text-xs text-muted-foreground mt-3">
                  Уровень: {alignmentLabels[goal.alignment_level ?? "operational"] ?? goal.alignment_level}
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Источник связки не определён</p>
            )}
          </div>

          {events.length > 0 && (
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <History className="w-4 h-4 text-muted-foreground" /> История (F-15)
              </h3>
              <div className="space-y-3">
                {events.map((ev) => {
                  const eventLabels: Record<string, string> = {
                    goal_created: "Цель создана",
                    goal_status_updated: "Статус изменён",
                    goal_deleted: "Цель удалена",
                    goal_text_updated: "Текст изменён",
                  };
                  const statusLabelsMap: Record<string, string> = {
                    draft: "Черновик", pending: "На согласовании",
                    approved: "Утверждена", rejected: "Отклонена",
                  };
                  return (
                    <div key={ev.id} className="flex gap-3 text-xs">
                      <div className="flex flex-col items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-primary mt-0.5 shrink-0" />
                        <div className="w-px flex-1 bg-border" />
                      </div>
                      <div className="pb-2 min-w-0">
                        <p className="font-medium text-foreground">
                          {eventLabels[ev.event_type] ?? ev.event_type}
                        </p>
                        {ev.event_type !== "goal_created" && ev.old_status !== ev.new_status && ev.new_status && (
                          <p className="text-muted-foreground">
                            {ev.old_status ? `${statusLabelsMap[ev.old_status] ?? ev.old_status} → ` : ""}
                            {statusLabelsMap[ev.new_status] ?? ev.new_status}
                          </p>
                        )}
                        {ev.created_at && (
                          <p className="text-muted-foreground/60 mt-0.5">
                            {new Date(ev.created_at).toLocaleString("ru-RU", {
                              day: "2-digit", month: "2-digit", year: "numeric",
                              hour: "2-digit", minute: "2-digit",
                            })}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
