import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SmartScoreGroup } from "@/components/SmartScoreBar";
import {
  Wand2, Check, RefreshCw, ChevronRight,
  Zap, AlertTriangle, Loader2, CheckCircle2, FileText, Search,
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import {
  api, parseQuarter,
  type Employee, type SuggestedGoalItem, type GenerateGoalsResponse,
} from "@/lib/api";
import { formatQuarterYear, getCurrentQuarterYear } from "@/lib/date";

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
  isRewriting: boolean;
  onToggle: () => void;
  onWeightChange: (v: number) => void;
  onApplyRewrite: () => void;
  onRemove: () => void;
}

function GeneratedGoalCard({
  goal, isSelected, weight, rewriteApplied, isRewriting, onToggle, onWeightChange, onApplyRewrite, onRemove,
}: GoalCardProps) {
  const alignment = ALIGNMENT_CFG[goal.alignment_level ?? "operational"] ?? ALIGNMENT_CFG.operational;
  const alignmentSource = goal.alignment_source ?? goal.source_doc_title ?? undefined;
  const typeTag = TYPE_CFG[goal.goal_type] ?? TYPE_CFG.activity;
  const lowSmart = goal.smart_index < 0.7;
  const isActivity = goal.goal_type === "activity";
  const hasDuplicates = (goal.duplicate_with?.length ?? 0) > 0;

  const scores = goal.scores
    ? [
        { key: "S", label: "Specific", value: goal.scores.S },
        { key: "M", label: "Measurable", value: goal.scores.M },
        { key: "A", label: "Achievable", value: goal.scores.A },
        { key: "R", label: "Relevant", value: goal.scores.R },
        { key: "T", label: "Time-bound", value: goal.scores.T },
      ]
    : [
        { key: "S", label: "Specific", value: Math.min(1, goal.smart_index + 0.05) },
        { key: "M", label: "Measurable", value: goal.smart_index },
        { key: "A", label: "Achievable", value: Math.min(1, goal.smart_index + 0.1) },
        { key: "R", label: "Relevant", value: Math.min(1, goal.smart_index + 0.08) },
        { key: "T", label: "Time-bound", value: goal.deadline ? Math.min(1, goal.smart_index + 0.05) : goal.smart_index - 0.15 },
      ];

  return (
    <div
      onClick={onToggle}
      className={`glass-card-elevated p-5 cursor-pointer transition-all duration-200 ${
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
          <p className="text-base font-medium leading-relaxed">{goal.goal_text}</p>

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
                  disabled={isRewriting}
                  onClick={onApplyRewrite}
                >
                  {isRewriting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                  {isRewriting ? "Переформулирую..." : "Улучшить формулировку"}
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
              <button
                className="text-primary underline ml-1 disabled:opacity-60"
                disabled={isRewriting}
                onClick={onApplyRewrite}
              >
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
            {alignmentSource && (
              <Badge variant="outline" className="text-[10px] bg-muted/60 text-muted-foreground">
                из: {alignmentSource}
              </Badge>
            )}
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

          {goal.source_doc_id && (
            <p className="text-xs text-muted-foreground/80">
              Источник: {goal.source_doc_title ?? "Документ"} · ID: {goal.source_doc_id}
              {goal.source_doc_link && (
                <>
                  {" "}
                  · <a href={goal.source_doc_link} className="underline text-primary" target="_blank" rel="noreferrer">API</a>
                </>
              )}
            </p>
          )}

          {hasDuplicates && (
            <div
              className="bg-warning/5 border border-warning/20 rounded-lg p-2 text-xs text-warning space-y-1"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">F-21: Похожие цели обнаружены</span>
                <button
                  className="text-[10px] px-2 py-0.5 rounded bg-warning/10 text-warning border border-warning/30 hover:bg-warning/20 transition-colors"
                  onClick={onRemove}
                >
                  Убрать из списка
                </button>
              </div>
              {goal.duplicate_with.map((item) => (
                <div key={item} className="text-muted-foreground">• {item}</div>
              ))}
            </div>
          )}

          {goal.warnings?.length > 0 && (
            <div className="space-y-1">
              {goal.warnings.map((warning) => (
                <div key={warning} className="text-xs text-warning bg-warning/5 rounded px-2 py-1">
                  {warning}
                </div>
              ))}
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
                className="h-8 text-xs control-surface"
              />
              <p className="text-[10px] text-muted-foreground/60">авто при выборе/снятии</p>
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
  const [deptFilter, setDeptFilter] = useState("all");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const { quarter: currentQuarter, year: currentYear } = getCurrentQuarterYear();
  const [quarter, setQuarter] = useState(formatQuarterYear(currentQuarter, currentYear));
  const [focus, setFocus] = useState("");
  const [includeManager, setIncludeManager] = useState(true);

  const [result, setResult] = useState<GenerateGoalsResponse | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [rewrites, setRewrites] = useState<Record<string, boolean>>({});
  const [rewriteLoading, setRewriteLoading] = useState<Record<string, boolean>>({});
  const [accepted, setAccepted] = useState<string[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);

  // ── Данные ────────────────────────────────────────────────────────────────

  const { data: employees = [], isLoading: empLoading } = useQuery<Employee[]>({
    queryKey: ["employees"],
    queryFn: () => api.employees.list(),
    staleTime: 60_000,
  });

  const departments = useMemo(() => {
    const values = new Set(employees.map((e) => e.department).filter(Boolean) as string[]);
    return Array.from(values).sort((a, b) => a.localeCompare(b, "ru"));
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    const query = employeeSearch.trim().toLowerCase();
    return employees.filter((employee) => {
      const matchesDepartment = deptFilter === "all" || employee.department === deptFilter;
      const matchesSearch =
        !query ||
        [
          employee.full_name,
          employee.position ?? "",
          employee.department ?? "",
        ].some((value) => value.toLowerCase().includes(query));
      return matchesDepartment && matchesSearch;
    });
  }, [deptFilter, employeeSearch, employees]);

  const employee = employees.find((e) => e.id === selectedEmployeeId);

  useEffect(() => {
    if (!selectedEmployeeId) {
      return;
    }
    if (!filteredEmployees.some((employee) => employee.id === selectedEmployeeId)) {
      setSelectedEmployeeId("");
      setResult(null);
    }
  }, [filteredEmployees, selectedEmployeeId]);

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
      setRewriteLoading({});
      setAccepted([]);
      setRemoved([]);
      // Используем weight_suggestion от LLM если есть, иначе равномерно
      const suggestions = data.suggestions;
      const w: Record<string, number> = {};
      const hasSuggestions = suggestions.every((s) => (s.weight_suggestion ?? 0) > 0);
      if (hasSuggestions) {
        const total = suggestions.reduce((sum, s) => sum + (s.weight_suggestion ?? 0), 0);
        suggestions.forEach((s) => {
          w[s.id] = Math.round(((s.weight_suggestion ?? 0) / total) * 100);
        });
        // Корректируем округление чтобы сумма = 100
        const roundedSum = Object.values(w).reduce((a, b) => a + b, 0);
        if (roundedSum !== 100 && suggestions.length > 0) w[suggestions[0].id] += 100 - roundedSum;
      } else {
        const equal = suggestions.length > 0 ? Math.floor(100 / suggestions.length) : 25;
        suggestions.forEach((s) => { w[s.id] = equal; });
      }
      setWeights(w);
    },
    onError: (e: Error) =>
      toast({ title: "Ошибка генерации", description: e.message, variant: "destructive" }),
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const warnings: string[] = [];
      const selectedGoals = (result?.suggestions ?? []).filter((s) => selected.includes(s.id));
      for (const g of selectedGoals) {
        const accepted = await api.generate.accept({
          suggested_goal_id: g.id,
          employee_id: selectedEmployeeId,
          weight: weights[g.id],
        });
        warnings.push(...(accepted.warnings ?? []));
      }
      return Array.from(new Set(warnings));
    },
    onSuccess: (warnings) => {
      setAccepted([...selected]);
      qc.invalidateQueries({ queryKey: ["goals"] });
      toast({
        title: "Цели приняты",
        description: `${selected.length} ${selected.length === 1 ? "цель добавлена" : "цели добавлены"} в набор сотрудника.`,
      });
      if (warnings.length > 0) {
        toast({
          title: "Есть предупреждения по набору целей",
          description: warnings.join(" "),
          variant: "destructive",
        });
      }
    },
    onError: (e: Error) =>
      toast({ title: "Ошибка принятия", description: e.message, variant: "destructive" }),
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  const toggleSelect = (id: string) => {
    const next = selected.includes(id)
      ? selected.filter((i) => i !== id)
      : [...selected, id];
    setSelected(next);
    // Авто-перераспределение весов при каждом изменении выбора
    if (next.length > 0) {
      const perGoal = Math.floor(100 / next.length);
      const remainder = 100 - perGoal * next.length;
      const newW: Record<string, number> = {};
      next.forEach((gId, i) => { newW[gId] = perGoal + (i === 0 ? remainder : 0); });
      setWeights((prev) => ({ ...prev, ...newW }));
    }
  };

  const removeGoal = (id: string) => {
    setRemoved((prev) => [...prev, id]);
    setSelected((prev) => prev.filter((i) => i !== id));
  };

  const applyRewrite = async (goalId: string) => {
    if (!result || rewriteLoading[goalId]) {
      return;
    }
    const goal = result.suggestions.find((item) => item.id === goalId);
    if (!goal) {
      return;
    }

    setRewriteLoading((prev) => ({ ...prev, [goalId]: true }));
    try {
      const rewritten = await api.generate.rewrite({
        goal_text: goal.goal_text,
        position: employee?.position ?? undefined,
        department: employee?.department ?? undefined,
      });

      setResult((prev) => {
        if (!prev) {
          return prev;
        }
        return {
          ...prev,
          suggestions: prev.suggestions.map((item) =>
            item.id === goalId
              ? {
                  ...item,
                  goal_text: rewritten.rewritten,
                  smart_index: rewritten.smart_index_after,
                }
              : item
          ),
        };
      });
      setRewrites((prev) => ({ ...prev, [goalId]: true }));
      toast({
        title: "Цель обновлена",
        description: `SMART: ${rewritten.smart_index_before.toFixed(2)} → ${rewritten.smart_index_after.toFixed(2)}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось переформулировать цель";
      toast({ title: "Ошибка переформулировки", description: message, variant: "destructive" });
    } finally {
      setRewriteLoading((prev) => ({ ...prev, [goalId]: false }));
    }
  };

  const selectedGoals = (result?.suggestions ?? []).filter((s) => selected.includes(s.id));
  const duplicateSelected = selectedGoals.filter((s) => (s.duplicate_with?.length ?? 0) > 0);
  const totalWeight = selectedGoals.reduce((sum, g) => sum + (weights[g.id] ?? 0), 0);
  const weightWarning = selected.length > 0 && Math.abs(totalWeight - 100) > 1;
  const allAccepted = accepted.length > 0 && accepted.sort().join() === selected.sort().join();

  // ── Рендер ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI Генерация целей</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Генерация стратегически связанных целей на основе ВНД, KPI и целей руководителя
        </p>
      </div>

      {/* Параметры генерации */}
      <div className="glass-card-elevated p-5 space-y-4">
        <h3 className="text-sm font-semibold">Параметры генерации</h3>

        {/* Цели руководителя — вверху */}
        {selectedEmployeeId && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Цели руководителя (каскадирование)
              </label>
              <button
                className={`text-xs px-2 py-0.5 rounded transition-colors ${
                  includeManager ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                }`}
                onClick={() => setIncludeManager((v) => !v)}
              >
                {includeManager ? "Включено" : "Выключено"}
              </button>
            </div>
            {includeManager && (
              <div className="bg-muted/40 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
                {managerGoals.length > 0 ? (
                  managerGoals.map((g) => <p key={g.id}>• {g.goal_text}</p>)
                ) : (
                  <p className="text-muted-foreground/60 italic">Цели руководителя не найдены за этот период</p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Подразделение</label>
            {empLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <Select
                value={deptFilter}
                onValueChange={(v) => {
                  setDeptFilter(v);
                  setSelectedEmployeeId("");
                  setEmployeeSearch("");
                  setResult(null);
                }}
              >
                <SelectTrigger className="control-surface">
                  <SelectValue placeholder="Все подразделения" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все подразделения</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Поиск сотрудника</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={employeeSearch}
                onChange={(e) => setEmployeeSearch(e.target.value)}
                placeholder="Имя, должность или подразделение"
                className="control-surface pl-10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-medium text-muted-foreground">Сотрудник (F-09)</label>
              <Badge variant="outline" className="text-[10px]">
                {filteredEmployees.length} найдено
              </Badge>
            </div>
            {empLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <Select
                value={selectedEmployeeId}
                onValueChange={(v) => { setSelectedEmployeeId(v); setResult(null); }}
              >
                <SelectTrigger className="control-surface">
                  <SelectValue placeholder="Выберите сотрудника" />
                </SelectTrigger>
                <SelectContent>
                  {filteredEmployees.map((e) => (
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
            <Input
              value={quarter}
              onChange={(e) => setQuarter(e.target.value)}
              placeholder="Q2 2026"
              className="control-surface"
            />
          </div>

          {employee && (
            <>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Должность</label>
                <Input value={employee.position ?? "—"} disabled className="control-surface" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Подразделение</label>
                <Input value={employee.department ?? "—"} disabled className="control-surface" />
              </div>
            </>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Фокус-приоритеты квартала</label>
          <Textarea
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            rows={2}
            className="control-surface"
          />
        </div>

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
        <div className="glass-card-elevated p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">
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

      {result && result.warnings.length > 0 && (
        <div className="glass-card-elevated p-4 border-warning/20">
          <h3 className="text-xs font-semibold text-warning uppercase tracking-wide mb-2">
            Предупреждения генерации
          </h3>
          <div className="space-y-1">
            {result.warnings.map((warning) => (
              <p key={warning} className="text-xs text-muted-foreground">{warning}</p>
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

          {result.suggestions.filter((g) => !removed.includes(g.id)).map((goal) => (
            <GeneratedGoalCard
              key={goal.id}
              goal={goal}
              isSelected={selected.includes(goal.id)}
              weight={weights[goal.id] ?? 25}
              rewriteApplied={!!rewrites[goal.id]}
              isRewriting={!!rewriteLoading[goal.id]}
              onToggle={() => toggleSelect(goal.id)}
              onWeightChange={(v) => setWeights((prev) => ({ ...prev, [goal.id]: v }))}
              onApplyRewrite={() => void applyRewrite(goal.id)}
              onRemove={() => removeGoal(goal.id)}
            />
          ))}

          {/* Валидация набора F-16/F-18 */}
          {selected.length > 0 && (
            <div className="space-y-3">
              {weightWarning ? (
                <div className="glass-card-elevated state-panel p-4 text-sm border-warning/30 space-y-1.5">
                  <h4 className="font-semibold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-warning" /> Проверка набора (F-16 / F-18)
                  </h4>
                  <div className="space-y-1 text-muted-foreground text-xs">
                    {weightWarning && (
                      <p>Суммарный вес должен быть 100%. Сейчас: {totalWeight}%.</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="glass-card-elevated state-panel p-4 text-sm border-success/30">
                  <p className="text-success font-medium flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    Набор корректен: {selected.length} цели, сумма весов 100%
                  </p>
                </div>
              )}

              {/* Дедупликация F-21 */}
              <div className="glass-card-elevated state-panel p-4 text-sm">
                <h4 className="font-semibold">Дедупликация (F-21)</h4>
                {duplicateSelected.length === 0 ? (
                  <p className="text-muted-foreground mt-1 text-xs">
                    Для выбранных целей дубликаты не обнаружены.
                  </p>
                ) : (
                  <div className="space-y-2 mt-1">
                    {duplicateSelected.map((goal) => (
                      <div key={goal.id} className="text-xs text-warning bg-warning/5 rounded px-2 py-2">
                        <p className="font-medium text-foreground mb-1">{goal.goal_text}</p>
                        {goal.duplicate_with.map((item) => (
                          <p key={item} className="text-muted-foreground">• {item}</p>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {allAccepted ? (
                <div className="glass-card-elevated p-4 bg-success/5 border-success/20">
                  <p className="text-success font-medium flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> Цели успешно добавлены в набор сотрудника
                  </p>
                </div>
              ) : (
                <div className="flex justify-end">
                  <Button
                    className="gap-2"
                    disabled={weightWarning || acceptMutation.isPending}
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
