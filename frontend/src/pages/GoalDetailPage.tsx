import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SmartScoreGroup } from "@/components/SmartScoreBar";
import { mockGoals } from "@/data/mockData";
import { mockGoalDetails } from "@/data/mockGoalDetails";
import { useRole } from "@/context/RoleContext";
import { myGoals } from "@/data/mockEmployee";
import { teamGoals } from "@/data/mockManager";
import { CheckCircle2, XCircle } from "lucide-react";

const statusLabels: Record<string, string> = {
  draft: "Черновик",
  review: "На согласовании",
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
  const [goalStatus, setGoalStatus] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [rejectMode, setRejectMode] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const baseGoals =
    role === "employee" ? myGoals :
    role === "manager" ? teamGoals :
    mockGoals;

  const goal = useMemo(() => baseGoals.find((g) => g.id === goalId), [baseGoals, goalId]);
  const detail = useMemo(() => mockGoalDetails.find((g) => g.id === goalId), [goalId]);
  const backPath =
    role === "employee" ? "/employee/goals" :
    role === "manager" ? "/manager/team-goals" :
    "/hr/goals";

  const currentStatus = goalStatus ?? (goal?.status ?? "");

  const handleApprove = () => {
    setGoalStatus("approved");
    setActionMessage("Цель утверждена. Сотрудник уведомлён.");
    setComment("");
    setRejectMode(false);
  };

  const handleReject = () => {
    if (!comment.trim()) { setActionMessage("Укажите причину отклонения."); return; }
    setGoalStatus("rejected");
    setActionMessage("Цель отклонена. Комментарий отправлен сотруднику.");
    setRejectMode(false);
  };

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

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <Link to={backPath} className="text-xs text-muted-foreground hover:text-foreground">
            ← К списку целей
          </Link>
          <h1 className="text-2xl font-bold tracking-tight mt-2">Детали цели</h1>
          <p className="text-sm text-muted-foreground mt-1">{goal.employeeName} · {goal.position}</p>
        </div>
        <Button variant="outline">Экспорт карточки</Button>
      </div>

      <div className="glass-card p-6 space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="text-xs">
            {statusLabels[currentStatus] ?? currentStatus}
          </Badge>
          {detail && (
            <Badge variant="outline" className="text-xs">
              {alignmentLabels[detail.alignmentLevel]}
            </Badge>
          )}
          <Badge variant="outline" className="text-xs">
            {goalTypeLabels[(detail?.goalType ?? (goal as { goalType?: string }).goalType) ?? "output"]}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {detail?.quarter ?? goal.quarter}
          </Badge>
        </div>

        <p className="text-sm leading-relaxed">{goal.text}</p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Метрика</p>
            <p className="font-medium">{detail?.metric ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Дедлайн</p>
            <p className="font-medium">{detail?.deadline ?? (goal as { deadline?: string }).deadline ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Вес цели</p>
            <p className="font-medium">{detail?.weight ?? goal.weight ?? "—"}%</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">SMART индекс</p>
            <p className={`font-mono font-semibold ${goal.smartIndex >= 0.7 ? "text-success" : "text-warning"}`}>
              {goal.smartIndex.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-4">
        <div className="space-y-4">
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-3">SMART-оценка</h3>
            <SmartScoreGroup scores={(detail?.smartScores ?? goal.smartScores ?? []).map(({ key, label, value }) => ({ key, label, value }))} />
            {detail && (
              <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                {detail.smartScores.map((score) => (
                  <div key={score.key} className="flex items-start gap-2">
                    <Badge variant="outline" className="text-[10px]">{score.key}</Badge>
                    <span>{score.note}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {detail && (
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold mb-3">AI-рекомендации</h3>
              <div className="space-y-2 text-sm text-muted-foreground">
                {detail.recommendations.map((rec) => (
                  <div key={rec} className="flex items-start gap-2">
                    <span className="mt-1 w-2 h-2 rounded-full bg-primary" />
                    <span>{rec}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {detail && (
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold mb-3">Переформулировка</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{detail.rewrite}</p>
            </div>
          )}

          {/* Approve / Reject block — only for manager & hr when goal is on review */}
          {(role === "manager" || role === "hr") && currentStatus === "review" && (
            <div className="glass-card p-5 space-y-3 border-primary/20">
              <h3 className="text-sm font-semibold">Решение по цели</h3>
              {goal.smartIndex < 0.6 && (
                <div className="bg-destructive/10 text-destructive text-xs rounded-lg p-2">
                  Низкий SMART-индекс ({goal.smartIndex.toFixed(2)}). Рекомендуется отправить на доработку.
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
                    <Button className="gap-2 flex-1" onClick={handleApprove}>
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
                    <Button variant="destructive" className="gap-2 flex-1" onClick={handleReject}>
                      <XCircle className="w-4 h-4" /> Подтвердить отклонение
                    </Button>
                    <Button variant="ghost" onClick={() => setRejectMode(false)}>Отмена</Button>
                  </div>
                </div>
              )}
              {actionMessage && <p className="text-xs text-muted-foreground">{actionMessage}</p>}
            </div>
          )}

          {(role === "manager" || role === "hr") && currentStatus === "approved" && (
            <div className="glass-card p-4 border-success/30">
              <p className="text-success text-sm font-medium">✓ Цель утверждена</p>
              {actionMessage && <p className="text-xs text-muted-foreground mt-1">{actionMessage}</p>}
            </div>
          )}

          {(role === "manager" || role === "hr") && currentStatus === "rejected" && (
            <div className="glass-card p-4 border-destructive/30">
              <p className="text-destructive text-sm font-medium">✗ Цель отклонена</p>
              {comment && <p className="text-xs text-muted-foreground mt-1">Комментарий: {comment}</p>}
              {actionMessage && <p className="text-xs text-muted-foreground mt-1">{actionMessage}</p>}
            </div>
          )}
        </div>

        <div className="space-y-4">
          {detail && (
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold mb-3">Стратегическая связка</h3>
              <Badge variant="outline" className="text-xs">{detail.alignmentSource.title}</Badge>
              <p className="text-sm text-muted-foreground mt-3">{detail.alignmentSource.snippet}</p>
            </div>
          )}

          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-3">Проверки качества</h3>
            <div className="space-y-3 text-sm text-muted-foreground">
              <div>
                <p className="text-xs text-muted-foreground">Достижимость</p>
                <p className="mt-1">{detail?.achievabilityNote ?? "Оценка недоступна для новых целей"}</p>
              </div>
              {detail && detail.duplicates.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground">Потенциальные дубликаты</p>
                  <div className="mt-2 space-y-2">
                    {detail.duplicates.map((dup) => (
                      <div key={dup.id} className="flex items-center justify-between gap-2">
                        <span className="text-xs">{dup.text}</span>
                        <Badge variant="outline" className="text-[10px]">{Math.round(dup.similarity * 100)}%</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-3">История ревью</h3>
            <div className="space-y-3 text-sm text-muted-foreground">
              {(detail?.reviewHistory ?? []).length === 0 && (
                <p className="text-muted-foreground text-xs">История ревью пока пуста</p>
              )}
              {(detail?.reviewHistory ?? []).map((item) => (
                <div key={item.date} className="border-b border-border/40 pb-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground/80">{item.reviewer}</span>
                    <Badge variant="outline" className="text-[10px]">{item.verdict}</Badge>
                  </div>
                  <p className="mt-1">{item.comment}</p>
                  <p className="text-xs text-muted-foreground mt-1">{item.date}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {(detail?.alerts ?? []).length > 0 && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-3">Алерты</h3>
          <div className="space-y-2">
            {(detail?.alerts ?? []).map((alert) => (
              <div key={alert.id} className="flex items-start gap-2 text-sm">
                <Badge
                  variant="outline"
                  className={
                    alert.severity === "high"
                      ? "bg-destructive/10 text-destructive"
                      : alert.severity === "medium"
                      ? "bg-warning/10 text-warning"
                      : "bg-muted text-muted-foreground"
                  }
                >
                  {alert.severity === "high" ? "Критично" : alert.severity === "medium" ? "Важно" : "Инфо"}
                </Badge>
                <span className="text-muted-foreground">{alert.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
