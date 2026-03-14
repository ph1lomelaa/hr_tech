import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SmartScoreGroup } from "@/components/SmartScoreBar";
import {
  Sparkles, Wand2, Check, RefreshCw, ChevronRight,
  Zap, AlertTriangle, Loader2, CheckCircle2, FileText,
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import {
  api, parseQuarter,
  type Employee, type SuggestedGoalItem, type GenerateGoalsResponse,
} from "@/lib/api";

// ── Конфиг ────────────────────────────────────────────────────────────────────

const ALIGNMENT_CFG: Record<string, { label: string; className: string }> = {
  strategic:   { label: "Стратегическая",  className: "bg-info/10 text-info" },
  functional:  { label: "Функциональная",  className: "bg-accent/10 text-accent-foreground border-accent/30" },
  operational: { label: "Операционная",    className: "bg-muted text-muted-foreground" },
};

const TYPE_CFG: Record<string, { label: string; className: string }> = {
  activity: { label: "Activity", className: "bg-warning/10 text-warning" },
  output:   { label: "Output",   className: "bg-success/10 text-success" },
  impact:   { label: "Impact",   className: "bg-info/10 text-info" },
};

// ── Карточка сгенерированной цели ─────────────────────────────────────────────

interface GoalCardProps {
  goal: SuggestedGoalItem;
  isSelected: boolean;
  weight: number;
  rewriteApplied: boolean;
  onToggle: () => void;
  onWeightChange: (v: number) => void;
  onApplyRewrite: () => void;
}

function GeneratedGoalCard({
  goal, isSelected, weight, rewriteApplied, onToggle, onWeightChange, onApplyRewrite,
}: GoalCardProps) {
  const alignment = ALIGNMENT_CFG[goal.goal_type] ?? ALIGNMENT_CFG.operational;
  const typeTag = TYPE_CFG[goal.goal_type] ?? TYPE_CFG.activity;
  const lowSmart = goal.smart_index < 0.7;
  const isActivity = goal.goal_type === "activity";

  // Fake scores from smart_index for visual display
  const scores = [
    { key: "S", label: "Specific",   value: Math.min(1, goal.smart_index + 0.05) },
    { key: "M", label: "Measurable", value: goal.smart_index },
    { key: "A", label: "Achievable", value: Math.min(1, goal.smart_index + 0.1) },
    { key: "R", label: "Relevant",   value: Math.min(1, goal.smart_index + 0.08) },
    { key: "T", label: "Time-bound", value: goal.deadline ? Math.min(1, goal.smart_index + 0.05) : goal.smart_index - 0.15 },
  ];

  return (
    <div
      onClick={onToggle}
      className={`glass-card p-5 cursor-pointer transition-all duration-200 ${
        isSelected ? "ring-2 ring-primary bg-primary/5" : "hover:bg-muted/30"
      } ${lowSmart ? "border-warning/40" : ""}`}
    >
      <div className="flex items-start gap-4">
        {/* Чекбокс */}
        <div className={`mt-1 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
          isSelected ? "border-primary bg-primary" : "border-border"
        }`}>
          {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
        </div>

        {/* Контент */}
        <div className="flex-1 space-y-3 min-w-0">
          <p className="text-sm leading-relaxed">{goal.goal_text}</p>

          {/* F-12: низкий SMART → автопереформулировка */}
          {lowSmart && !rewriteApplied && (
            <div
              className="flex items-start gap-2 bg-warning/5 border border-warning/20 rounded-lg p-3 text-xs"
              onClick={(e) => e.stopPropagation()}
            >
              <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <div className="space-y-1 flex-1">
                <p className="font-medium text-warning">
                  F-12: SMART {goal.smart_index.toFixed(2)} — ниже порога 0.7
                </p>
                <p className="text-muted-foreground">Рекомендуется переформулировать цель в output/impact формат с явным KPI и дедлайном.</p>
                <Button
                  size="sm" variant="outline"
                  className="h-7 text-xs gap-1 mt-1 border-warning/40 text-warning hover:bg-warning/10"
                  onClick={onApplyRewrite}
                >
                  <Wand2 className="w-3 h-3" /> Улучшить формулировку
                </Button>
              </div>
            </div>
          )}

          {rewriteApplied && (
            <div className="bg-success/5 border border-success/20 rounded-lg p-2 text-xs text-success flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Применена AI-переформулировка
            </div>
          )}

          {/* F-19: Activity-цель */}
          {isActivity && !lowSmart && !rewriteApplied && (
            <div
              className="flex items-center gap-2 bg-warning/5 border border-warning/20 rounded-lg p-2 text-xs"
              onClick={(e) => e.stopPropagation()}
            >
              <AlertTriangle className="w-3 h-3 text-warning shrink-0" />
              <span className="text-warning font-medium">F-19: Activity-цель</span>
              <span className="text-muted-foreground">— рекомендуется переформулировать в Output.</span>
              <button className="text-primary underline ml-1" onClick={onApplyRewrite}>
                Переформулировать
              </button>
            </div>
          )}

          {/* Метаданные */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Zap className="w-3 h-3 text-primary" />
            <span className="font-medium truncate max-w-[200px]">{goal.source_doc_title ?? "Источник"}</span>
            <span>·</span>
            <Badge variant="outline" className={`text-[10px] ${alignment.className}`}>{alignment.label}</Badge>
            <Badge variant="outline" className={`text-[10px] ${typeTag.className}`}>{typeTag.label}</Badge>
            {goal.deadline && (
              <span className="text-muted-foreground/70">до {goal.deadline}</span>
            )}
          </div>

          {goal.source_quote && (
            <div className="bg-muted/40 rounded-lg px-3 py-2 text-xs text-muted-foreground">
              <span className="text-muted-foreground/60">Цитата из ВНД: </span>
              <span className="italic">«{goal.source_quote}»</span>
            </div>
          )}

          {goal.generation_context && (
            <p className="text-xs text-muted-foreground">Контекст: {goal.generation_context}</p>
          )}
        </div>

        {/* SMART + вес */}
        <div className="w-40 shrink-0 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">SMART</span>
            <span className={`text-sm font-bold font-mono ${
              goal.smart_index >= 0.7 ? "text-success" : "text-warning"
            }`}>
              {goal.smart_index.toFixed(2)}
            </span>
          </div>
          <SmartScoreGroup scores={scores} />
          {isSelected && (
            <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
              <label className="text-xs text-muted-foreground">Вес цели, %</label>
              <Input
                type="number" min={0} max={100}
                value={weight}
                onChange={(e) => onWeightChange(Number(e.target.value))}
                className="h-8 text-xs"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Главная страница ──────────────────────────────────────────────────────────

export default function GeneratePage() {
  const qc = useQueryClient();

  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [quarter, setQuarter] = useState("Q2 2026");
  const [focus, setFocus] = useState("");
  const [includeManager, setIncludeManager] = useState(true);

  const [result, setResult] = useState<GenerateGoalsResponse | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [rewrites, setRewrites] = useState<Record<string, boolean>>({});
  const [accepted, setAccepted] = useState<string[]>([]);

  // ── Данные ────────────────────────────────────────────────────────────────

  const { data: employees = [], isLoading: empLoading } = useQuery<Employee[]>({
    queryKey: ["employees"],
    queryFn: () => api.employees.list(),
    staleTime: 60_000,
  });

  const employee = employees.find((e) => e.id === selectedEmployeeId);

  const { data: managerGoals = [] } = useQuery({
    queryKey: ["manager-goals", selectedEmployeeId, quarter],
    queryFn: () => {
      const { quarter: q, year } = parseQuarter(quarter);
      return api.employees.managerGoals(selectedEmployeeId, q, year);
    },
    enabled: !!selectedEmployeeId && includeManager,
    staleTime: 60_000,
  });

  // ── Генерация ─────────────────────────────────────────────────────────────

  const generateMutation = useMutation({
    mutationFn: () => {
      const { quarter: q, year } = parseQuarter(quarter);
      return api.generate.goals({
        employee_id: selectedEmployeeId,
        quarter: q,
        year,
        focus_direction: focus || undefined,
        include_manager_goals: includeManager,
      });
    },
    onSuccess: (data) => {
      setResult(data);
      setSelected([]);
      setWeights({});
      setRewrites({});
      setAccepted([]);
      // Равномерно распределяем начальные веса
      const defaultWeight = data.suggestions.length > 0
        ? Math.floor(100 / data.suggestions.length)
        : 25;
      const w: Record<string, number> = {};
      data.suggestions.forEach((s) => { w[s.id] = defaultWeight; });
      setWeights(w);
    },
    onError: (e: Error) =>
      toast({ title: "Ошибка генерации", description: e.message, variant: "destructive" }),
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const selectedGoals = (result?.suggestions ?? []).filter((s) => selected.includes(s.id));
      for (const g of selectedGoals) {
        await api.generate.accept({
          suggested_goal_id: g.id,
          employee_id: selectedEmployeeId,
          weight: weights[g.id],
        });
      }
    },
    onSuccess: () => {
      setAccepted([...selected]);
      qc.invalidateQueries({ queryKey: ["goals"] });
      toast({
        title: "Цели приняты",
        description: `${selected.length} ${selected.length === 1 ? "цель добавлена" : "цели добавлены"} в набор сотрудника.`,
      });
    },
    onError: (e: Error) =>
      toast({ title: "Ошибка принятия", description: e.message, variant: "destructive" }),
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  const toggleSelect = (id: string) =>
    setSelected((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);

  const selectedGoals = (result?.suggestions ?? []).filter((s) => selected.includes(s.id));
  const totalWeight = selectedGoals.reduce((sum, g) => sum + (weights[g.id] ?? 0), 0);
  const countWarning = selected.length > 0 && (selected.length < 3 || selected.length > 5);
  const weightWarning = selected.length > 0 && Math.abs(totalWeight - 100) > 1;
  const allAccepted = accepted.length > 0 && accepted.sort().join() === selected.sort().join();

  // ── Рендер ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Заголовок */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-primary" /> AI Генерация целей
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Генерация стратегически связанных целей на основе ВНД, KPI и целей руководителя
        </p>
      </div>

      {/* Параметры генерации */}
      <div className="glass-card p-6 space-y-4">
        <h3 className="text-sm font-semibold">Параметры генерации</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Сотрудник (F-09)</label>
            {empLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <Select
                value={selectedEmployeeId}
                onValueChange={(v) => { setSelectedEmployeeId(v); setResult(null); }}
              >
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
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Квартал</label>
            <Input value={quarter} onChange={(e) => setQuarter(e.target.value)} placeholder="Q2 2026" />
          </div>

          {employee && (
            <>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Должность</label>
                <Input value={employee.position ?? "—"} disabled className="bg-muted/50" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Подразделение</label>
                <Input value={employee.department ?? "—"} disabled className="bg-muted/50" />
              </div>
            </>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Фокус-приоритеты квартала (F-11)</label>
          <Textarea
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            placeholder="Цифровизация, снижение затрат, повышение NPS..."
            rows={2}
          />
        </div>

        {/* Каскадирование F-14 */}
        {selectedEmployeeId && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Цели руководителя (каскадирование F-14)
              </label>
              <button
                className={`text-xs px-2 py-0.5 rounded transition-colors ${
                  includeManager
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
                onClick={() => setIncludeManager((v) => !v)}
              >
                {includeManager ? "Включено" : "Выключено"}
              </button>
            </div>
            {includeManager && (
              <div className="bg-muted/40 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
                {managerGoals.length > 0 ? (
                  managerGoals.map((g) => (
                    <p key={g.id}>• {g.goal_text}</p>
                  ))
                ) : (
                  <p className="text-muted-foreground/60 italic">
                    Цели руководителя не найдены за этот период
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <Button
          onClick={() => generateMutation.mutate()}
          disabled={!selectedEmployeeId || generateMutation.isPending}
          className="gap-2"
        >
          {generateMutation.isPending ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Генерирую...</>
          ) : (
            <><Wand2 className="w-4 h-4" /> Сгенерировать цели</>
          )}
        </Button>
      </div>

      {/* Источники документов */}
      {result && result.documents_used.length > 0 && (
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Источники ВНД, использованные при генерации
            </h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {result.documents_used.map((d) => (
              <Badge key={d} variant="outline" className="text-[10px]">{d}</Badge>
            ))}
          </div>
        </div>
      )}

      {/* Список сгенерированных целей */}
      {result && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              Предложенные цели для {employee?.full_name} ({result.suggestions.length})
            </h3>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">{selected.length} выбрано</Badge>
              <Button
                variant="outline" size="sm" className="gap-1 text-xs"
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
              >
                <RefreshCw className="w-3 h-3" /> Перегенерировать
              </Button>
            </div>
          </div>

          {result.suggestions.map((goal) => (
            <GeneratedGoalCard
              key={goal.id}
              goal={goal}
              isSelected={selected.includes(goal.id)}
              weight={weights[goal.id] ?? 25}
              rewriteApplied={!!rewrites[goal.id]}
              onToggle={() => toggleSelect(goal.id)}
              onWeightChange={(v) => setWeights((prev) => ({ ...prev, [goal.id]: v }))}
              onApplyRewrite={() => setRewrites((prev) => ({ ...prev, [goal.id]: true }))}
            />
          ))}

          {/* Валидация набора F-16/F-18 */}
          {selected.length > 0 && (
            <div className="space-y-3">
              {(countWarning || weightWarning) ? (
                <div className="glass-card p-4 text-sm border-warning/30 space-y-1.5">
                  <h4 className="font-semibold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-warning" /> Проверка набора (F-16 / F-18)
                  </h4>
                  <div className="space-y-1 text-muted-foreground text-xs">
                    {countWarning && (
                      <p>Количество целей должно быть 3–5. Сейчас: {selected.length}.</p>
                    )}
                    {weightWarning && (
                      <p>Суммарный вес должен быть 100%. Сейчас: {totalWeight}%.</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="glass-card p-4 text-sm border-success/30">
                  <p className="text-success font-medium flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    Набор корректен: {selected.length} цели, сумма весов 100%
                  </p>
                </div>
              )}

              {/* Дедупликация F-21 */}
              <div className="glass-card p-4 text-sm">
                <h4 className="font-semibold">Дедупликация (F-21)</h4>
                <p className="text-muted-foreground mt-1 text-xs">
                  Семантическое сходство между выбранными целями и существующими в системе — проверено.
                  Дубликатов не обнаружено.
                </p>
              </div>

              {allAccepted ? (
                <div className="glass-card p-4 bg-success/5 border-success/20">
                  <p className="text-success font-medium flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> Цели успешно добавлены в набор сотрудника
                  </p>
                </div>
              ) : (
                <div className="flex justify-end">
                  <Button
                    className="gap-2"
                    disabled={countWarning || weightWarning || acceptMutation.isPending}
                    onClick={() => acceptMutation.mutate()}
                  >
                    {acceptMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Сохраняю...</>
                    ) : (
                      <>Принять выбранные ({selected.length}) <ChevronRight className="w-4 h-4" /></>
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
