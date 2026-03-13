import { useMemo, useRef, useState } from "react";
import GoalCard from "@/components/GoalCard";
import { myGoals, myGoalSummary } from "@/data/mockEmployee";
import { mockDocuments } from "@/data/mockDocuments";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SmartScoreGroup } from "@/components/SmartScoreBar";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Wand2 } from "lucide-react";
import { evaluateSmart } from "@/lib/smartEvaluate";

export default function EmployeeGoalsPage() {
  const [goals, setGoals] = useState(myGoals);
  const [draft, setDraft] = useState("");
  const [metric, setMetric] = useState("");
  const [deadline, setDeadline] = useState("2026-06-30");
  const [weight, setWeight] = useState<number | "">("");
  const [source, setSource] = useState("");
  const [evaluation, setEvaluation] = useState<ReturnType<typeof evaluateSmart> | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const existingWeightSum = goals.reduce((sum, g) => sum + (g.weight || 0), 0);
  const remainingWeight = Math.max(0, 100 - existingWeightSum);

  const summary = useMemo(() => {
    const totalGoals = goals.length;
    const weightSum = goals.reduce((sum, g) => sum + (g.weight || 0), 0);
    const avgSmart = goals.length > 0
      ? goals.reduce((sum, g) => sum + g.smartIndex, 0) / goals.length
      : 0;
    const strategicShare = goals.length > 0
      ? Math.round((goals.filter((g) => g.linkType === "strategic").length / goals.length) * 100)
      : 0;

    // Compute weak criteria from actual goals
    const criteriaMap: Record<string, number[]> = { S: [], M: [], A: [], R: [], T: [] };
    goals.forEach((g) => {
      g.smartScores?.forEach((sc) => {
        criteriaMap[sc.key]?.push(sc.value);
      });
    });
    const weakCriteria = Object.entries(criteriaMap)
      .filter(([, vals]) => vals.length > 0 && vals.reduce((a, b) => a + b, 0) / vals.length < 0.6)
      .map(([k]) => {
        const labels: Record<string, string> = { S: "Specific", M: "Measurable", A: "Achievable", R: "Relevant", T: "Time-bound" };
        return labels[k];
      });

    return { totalGoals, weightSum, avgSmart, strategicShare, weakCriteria };
  }, [goals]);

  const handleEvaluate = () => {
    if (!draft.trim()) return;
    const result = evaluateSmart(draft);
    setEvaluation(result);
    // Auto-fill metric, deadline from AI suggestions
    if (!metric) setMetric(result.suggestedMetric);
    if (!deadline || deadline === "2026-06-30") setDeadline(result.suggestedDeadline);
    // Auto-distribute weight suggestion
    if (!weight && goals.length < 5) {
      const suggested = Math.round(remainingWeight / (goals.length < 3 ? 3 - goals.length : 1));
      setWeight(Math.min(suggested, remainingWeight));
    }
  };

  const applyRewrite = () => {
    if (evaluation) setDraft(evaluation.rewrite);
  };

  const resetForm = () => {
    setDraft("");
    setMetric("");
    setDeadline("2026-06-30");
    setWeight("");
    setSource("");
    setEvaluation(null);
    setFormMessage(null);
  };

  const createGoal = (status: "draft" | "review") => {
    if (!draft.trim()) {
      setFormMessage("Введите формулировку цели.");
      return;
    }
    if (!metric.trim()) {
      setFormMessage("Укажите метрику.");
      return;
    }
    if (!deadline) {
      setFormMessage("Укажите срок выполнения.");
      return;
    }
    if (!weight || Number(weight) <= 0) {
      setFormMessage("Укажите корректный вес цели (> 0).");
      return;
    }
    const eval_ = evaluation ?? evaluateSmart(draft);
    const newGoal = {
      id: `g-new-${Date.now()}`,
      employeeName: "Сидорова Мария",
      position: "HR Менеджер",
      department: "HR Департамент",
      text: draft.trim(),
      status,
      smartIndex: eval_.smartIndex,
      smartScores: eval_.scores,
      linkType: "functional" as const,
      quarter: myGoalSummary.quarter,
      weight: Number(weight),
      goalType: eval_.goalType,
      deadline: deadline || "2026-06-30",
      source: source || undefined,
    };
    setGoals((prev) => [newGoal, ...prev]);

    const nextTotal = goals.length + 1;
    const nextWeight = goals.reduce((sum, g) => sum + g.weight, 0) + Number(weight);

    if (status === "review") {
      if (nextTotal < 3 || nextTotal > 5) {
        setFormMessage(`Предупреждение: количество целей ${nextTotal} вне диапазона 3–5.`);
      } else if (nextWeight !== 100) {
        setFormMessage(`Предупреждение: суммарный вес ${nextWeight}%, требуется 100%.`);
      } else {
        setFormMessage("Цель отправлена на согласование.");
      }
    } else {
      setFormMessage("Черновик сохранён.");
    }
    setEvaluation(null);
  };

  const scrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const goalTypeConfig = {
    activity: { label: "Activity", className: "bg-warning/10 text-warning" },
    output: { label: "Output", className: "bg-success/10 text-success" },
    impact: { label: "Impact", className: "bg-info/10 text-info" },
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Мои цели</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Управление и доработка целей · {myGoalSummary.quarter}
          </p>
        </div>
        <Button className="gap-2" onClick={scrollToForm}>
          + Создать цель
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-4">
        {/* Form */}
        <div className="glass-card p-5 space-y-4" ref={formRef}>
          <div>
            <h3 className="text-sm font-semibold">Новая цель + AI оценка</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Введите формулировку — AI предложит метрику, срок, тип и вес
            </p>
          </div>

          {/* Goal text */}
          <Textarea
            placeholder="Например: Повысить % закрытия вакансий с 62% до 75% к 30.06.2026..."
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setEvaluation(null); }}
            rows={3}
          />

          {/* Evaluate button */}
          <Button
            onClick={handleEvaluate}
            className="gap-2 w-full"
            disabled={!draft.trim()}
            variant={evaluation ? "outline" : "default"}
          >
            <Wand2 className="w-4 h-4" />
            {evaluation ? "Переоценить SMART" : "Оценить SMART → AI заполнит поля"}
          </Button>

          {/* SMART result */}
          {evaluation && (
            <div className="space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Индекс качества</span>
                <span className={`font-mono font-semibold ${evaluation.smartIndex >= 0.7 ? "text-success" : "text-warning"}`}>
                  {evaluation.smartIndex.toFixed(2)}
                </span>
              </div>
              <SmartScoreGroup scores={evaluation.scores} />

              {/* AI-detected goal type */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Тип цели (AI):</span>
                <Badge variant="outline" className={`text-[10px] ${goalTypeConfig[evaluation.goalType].className}`}>
                  {goalTypeConfig[evaluation.goalType].label}
                </Badge>
                {evaluation.goalType === "activity" && (
                  <span className="text-[10px] text-warning flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> F-19: рекомендуется Output
                  </span>
                )}
              </div>

              {evaluation.recommendations.length > 0 && (
                <div className="space-y-1 text-sm text-muted-foreground">
                  {evaluation.recommendations.map((rec) => (
                    <div key={rec} className="flex items-start gap-2">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                      <span>{rec}</span>
                    </div>
                  ))}
                </div>
              )}

              {evaluation.smartIndex < 0.7 && (
                <div className="bg-muted/40 rounded-lg p-3 text-sm space-y-2">
                  <p className="text-xs text-muted-foreground">AI-переформулировка:</p>
                  <p className="text-muted-foreground italic">{evaluation.rewrite}</p>
                  <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={applyRewrite}>
                    <Wand2 className="w-3 h-3" /> Применить
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* AI-suggested fields */}
          {evaluation && (
            <div className="space-y-3 border-t border-border/50 pt-3">
              <p className="text-xs text-muted-foreground font-medium">Поля заполнены AI — проверьте и скорректируйте:</p>

              {/* Metric */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Метрика
                  <span className="ml-1 text-[10px] text-primary">(AI)</span>
                </label>
                <input
                  type="text"
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={metric}
                  onChange={(e) => setMetric(e.target.value)}
                  placeholder="Числовой KPI"
                />
              </div>

              {/* Deadline */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Срок выполнения
                  <span className="ml-1 text-[10px] text-primary">(AI)</span>
                </label>
                <input
                  type="date"
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  min="2026-01-01"
                  max="2027-12-31"
                />
              </div>

              {/* Source — optional */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Источник (необязательно)</label>
                <Select value={source} onValueChange={setSource}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите документ-основание..." />
                  </SelectTrigger>
                  <SelectContent>
                    {mockDocuments.filter((d) => d.isActive).map((doc) => (
                      <SelectItem key={doc.id} value={doc.title}>
                        <div className="flex flex-col">
                          <span>{doc.title}</span>
                          <span className="text-[10px] text-muted-foreground">{doc.type} · {doc.version}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Weight — auto-suggested */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">
                    Вес цели, %
                  </label>
                  <span className="text-[10px] text-muted-foreground">
                    Занято: {existingWeightSum}% · Остаток: <span className={remainingWeight === 0 ? "text-destructive" : "text-success"}>{remainingWeight}%</span>
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder={`Предложено: ${remainingWeight}`}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs px-2"
                    onClick={() => setWeight(remainingWeight)}
                    type="button"
                  >
                    ={remainingWeight}%
                  </Button>
                </div>
                {Number(weight) + existingWeightSum > 100 && (
                  <p className="text-[10px] text-destructive">Суммарный вес превысит 100%</p>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          {evaluation && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" onClick={() => createGoal("draft")}>
                Сохранить черновик
              </Button>
              <Button
                size="sm"
                onClick={() => createGoal("review")}
                disabled={!weight || !metric.trim() || !deadline}
              >
                Отправить на согласование
              </Button>
              <Button variant="ghost" size="sm" onClick={resetForm}>
                Сбросить
              </Button>
            </div>
          )}

          {formMessage && (
            <div className={`text-xs px-3 py-2 rounded-md ${
              formMessage.includes("Предупреждение") ? "bg-warning/10 text-warning" :
              formMessage.includes("согласован") ? "bg-success/10 text-success" :
              "text-muted-foreground bg-muted/40"
            }`}>
              {formMessage}
            </div>
          )}
        </div>

        {/* Batch summary */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold">Пакетная оценка</h3>
          <p className="text-xs text-muted-foreground mt-1">Сводка по кварталу</p>
          <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Целей</p>
              <p className={`font-mono font-semibold ${
                summary.totalGoals < 3 || summary.totalGoals > 5 ? "text-warning" : "text-success"
              }`}>{summary.totalGoals} / 3–5</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Сумма весов</p>
              <p className={`font-mono font-semibold ${summary.weightSum !== 100 ? "text-warning" : "text-success"}`}>
                {summary.weightSum}%
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Средний SMART</p>
              <p className={`font-mono font-semibold ${summary.avgSmart >= 0.7 ? "text-success" : "text-warning"}`}>
                {summary.avgSmart.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Стратегич. %</p>
              <p className="font-mono font-semibold">{summary.strategicShare}%</p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {summary.totalGoals < 3 && (
              <div className="text-xs text-warning bg-warning/5 rounded px-2 py-1">
                ⚠ Нужно ещё {3 - summary.totalGoals} цел(и) для соответствия норме 3–5
              </div>
            )}
            {summary.totalGoals > 5 && (
              <div className="text-xs text-destructive bg-destructive/5 rounded px-2 py-1">
                ✗ Превышен лимит 5 целей
              </div>
            )}
            {summary.weightSum !== 100 && (
              <div className="text-xs text-warning bg-warning/5 rounded px-2 py-1">
                ⚠ Сумма весов {summary.weightSum}% — должно быть 100%
              </div>
            )}
            {summary.totalGoals >= 3 && summary.totalGoals <= 5 && summary.weightSum === 100 && (
              <div className="text-xs text-success bg-success/5 rounded px-2 py-1">
                ✓ Набор целей корректен
              </div>
            )}
          </div>

          {summary.weakCriteria.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-muted-foreground mb-1">Слабые SMART-критерии:</p>
              <div className="flex flex-wrap gap-1">
                {summary.weakCriteria.map((c) => (
                  <Badge key={c} variant="outline" className="text-[10px] bg-warning/10 text-warning">
                    ⚠ {c}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-border/50">
            <p className="text-xs text-muted-foreground font-medium mb-2">Остаток для новой цели</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    existingWeightSum > 100 ? "bg-destructive" : existingWeightSum === 100 ? "bg-success" : "bg-primary"
                  }`}
                  style={{ width: `${Math.min(existingWeightSum, 100)}%` }}
                />
              </div>
              <span className="text-xs font-mono text-muted-foreground">{existingWeightSum}%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {goals.map((goal) => (
          <GoalCard key={goal.id} goal={goal} />
        ))}
      </div>
    </div>
  );
}
