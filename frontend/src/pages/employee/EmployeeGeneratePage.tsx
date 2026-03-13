import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SmartScoreGroup } from "@/components/SmartScoreBar";
import { Check, ChevronRight, RefreshCw, Sparkles, Wand2, Zap, AlertTriangle, ArrowRight } from "lucide-react";
import { mySuggestions } from "@/data/mockEmployee";
import { managerOwnGoals } from "@/data/mockManager";

// F-17: Alignment level labels and colors
const alignmentConfig: Record<string, { label: string; className: string }> = {
  strategic: { label: "Стратегическая", className: "bg-info/10 text-info" },
  functional: { label: "Функциональная", className: "bg-accent/10 text-accent-foreground border-accent/30" },
  operational: { label: "Операционная", className: "bg-muted text-muted-foreground" },
};

// F-19: Goal type labels and colors
const goalTypeConfig: Record<string, { label: string; className: string }> = {
  activity: { label: "Activity", className: "bg-warning/10 text-warning" },
  output: { label: "Output", className: "bg-success/10 text-success" },
  impact: { label: "Impact", className: "bg-info/10 text-info" },
};

const generationHistory = [
  { id: "v2", date: "2026-02-08", accepted: 3, context: "Вовлечённость, адаптация" },
  { id: "v1", date: "2026-01-20", accepted: 2, context: "Цифровизация" },
];

export default function EmployeeGeneratePage() {
  const [generated, setGenerated] = useState(false);
  const [focus, setFocus] = useState("Цифровизация HR-процессов, рост вовлечённости, оптимизация грейдов");
  const [selected, setSelected] = useState<number[]>([]);
  const [weights, setWeights] = useState<Record<number, number>>({ 1: 30, 2: 35, 3: 35 });
  // F-19: track rewrites applied per goal
  const [rewrites, setRewrites] = useState<Record<number, boolean>>({});

  // F-14: real manager goals for cascading context
  const managerApprovedGoals = managerOwnGoals.filter((g) => g.status === "approved");

  const toggleSelect = (id: number) =>
    setSelected((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);

  const applyRewrite = (id: number) =>
    setRewrites((prev) => ({ ...prev, [id]: true }));

  const selectedGoals = mySuggestions.filter((g) => selected.includes(g.id));
  const totalWeight = selectedGoals.reduce((sum, g) => sum + (weights[g.id] ?? 0), 0);
  const countWarning = selected.length > 0 && (selected.length < 3 || selected.length > 5);
  const weightWarning = selected.length > 0 && totalWeight !== 100;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-primary" /> AI Подбор целей
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Получите набор целей, согласованный со стратегией, ВНД и целями руководителя
        </p>
      </div>

      {/* Generation params */}
      <div className="glass-card p-6 space-y-4">
        <h3 className="text-sm font-semibold">Параметры генерации</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Сотрудник</label>
            <Input defaultValue="Сидорова Мария" disabled className="bg-muted/50" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Должность / Подразделение</label>
            <Input defaultValue="HR Менеджер · HR Департамент" disabled className="bg-muted/50" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Квартал</label>
            <Input defaultValue="Q2 2026" />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Фокус-приоритеты квартала (F-11)</label>
          <Textarea
            placeholder="Например: цифровизация, вовлечённость, оптимизация..."
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            rows={2}
          />
        </div>

        {/* F-14: Cascading — real manager goals */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground">Цели руководителя (каскадирование F-14)</label>
            <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary">Иванова Анна · HR Директор</Badge>
          </div>
          <div className="bg-muted/40 rounded-lg p-3 space-y-2">
            {managerApprovedGoals.map((g) => (
              <div key={g.id} className="flex items-start gap-2 text-xs text-muted-foreground">
                <ArrowRight className="w-3 h-3 text-primary shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p>{g.text}</p>
                  <span className="text-[10px] text-muted-foreground/60">{g.source} · SMART {g.smartIndex.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Button onClick={() => setGenerated(true)} className="gap-2">
          <Wand2 className="w-4 h-4" /> Сгенерировать цели
        </Button>
      </div>

      {/* Generation history (F-15) */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3">История генераций (F-15)</h3>
        <div className="space-y-2 text-sm text-muted-foreground">
          {generationHistory.map((item) => (
            <div key={item.id} className="flex items-center justify-between border-b border-border/40 pb-2">
              <div>
                <p className="font-medium text-foreground/80">{item.id} · {item.date}</p>
                <p className="text-xs">Контекст: {item.context}</p>
              </div>
              <Badge variant="outline" className="text-xs">Принято {item.accepted}</Badge>
            </div>
          ))}
        </div>
      </div>

      {/* Generated goals */}
      {generated && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              Предложенные цели ({mySuggestions.length}) — F-09/F-12
            </h3>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">{selected.length} выбрано</Badge>
              <Button variant="outline" size="sm" className="gap-1 text-xs">
                <RefreshCw className="w-3 h-3" /> Перегенерировать
              </Button>
            </div>
          </div>

          {mySuggestions.map((goal) => {
            const isSelected = selected.includes(goal.id);
            const alignment = alignmentConfig[goal.linkType] ?? alignmentConfig.operational;
            const type = goalTypeConfig[goal.goalType ?? "activity"];
            const isActivity = goal.goalType === "activity";
            const rewriteApplied = rewrites[goal.id];

            return (
              <div
                key={goal.id}
                onClick={() => toggleSelect(goal.id)}
                className={`glass-card p-5 cursor-pointer transition-all duration-200 ${
                  isSelected ? "ring-2 ring-primary bg-primary/5" : "hover:bg-muted/30"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`mt-1 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                    isSelected ? "border-primary bg-primary" : "border-border"
                  }`}>
                    {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                  </div>

                  <div className="flex-1 space-y-3">
                    {/* F-09/F-12: Goal text — with rewrite if applied */}
                    <p className="text-sm leading-relaxed">{goal.text}</p>

                    {/* F-19: Activity warning + rewrite suggestion */}
                    {isActivity && !rewriteApplied && (
                      <div
                        className="flex items-start gap-2 bg-warning/5 border border-warning/20 rounded-lg p-3 text-xs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="font-medium text-warning">F-19: Activity-цель — рекомендуется переформулировать в Output/Impact</p>
                          <p className="text-muted-foreground">AI предлагает: сформулируйте ожидаемый результат вместо описания действия.</p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1 mt-1 border-warning/40 text-warning hover:bg-warning/10"
                            onClick={() => applyRewrite(goal.id)}
                          >
                            <Wand2 className="w-3 h-3" /> Переформулировать в Output
                          </Button>
                        </div>
                      </div>
                    )}
                    {isActivity && rewriteApplied && (
                      <div className="bg-success/5 border border-success/20 rounded-lg p-3 text-xs text-success">
                        ✓ Переформулирована AI в Output: «Повысить долю вакансий, закрытых в срок, с 62% до 75% к 30.06.2026»
                      </div>
                    )}

                    {/* Badges: F-10 source, F-17 alignment, F-19 type */}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Zap className="w-3 h-3 text-primary" />
                      <span className="font-medium">{goal.source}</span>
                      <span>·</span>
                      {/* F-17: alignment level */}
                      <Badge variant="outline" className={`text-[10px] ${alignment.className}`}>
                        {alignment.label}
                      </Badge>
                      {/* F-19: goal type */}
                      <Badge variant="outline" className={`text-[10px] ${type.className}`}>
                        {type.label}
                      </Badge>
                      {goal.smartIndex < 0.7 && (
                        <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning">
                          ⚠ SMART {goal.smartIndex.toFixed(2)} — переформулирована
                        </Badge>
                      )}
                    </div>

                    {/* F-10: Source snippet */}
                    <div className="bg-muted/40 rounded-lg px-3 py-2 text-xs text-muted-foreground">
                      <span className="text-muted-foreground/60">Цитата ВНД: </span>
                      {goal.sourceSnippet}
                    </div>

                    {/* Context */}
                    <p className="text-xs text-muted-foreground">Контекст: {goal.context}</p>
                  </div>

                  {/* SMART score (F-12) */}
                  <div className="w-40 shrink-0 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">SMART</span>
                      <span className={`text-sm font-bold font-mono ${goal.smartIndex >= 0.7 ? "text-success" : "text-warning"}`}>
                        {goal.smartIndex.toFixed(2)}
                      </span>
                    </div>
                    <SmartScoreGroup scores={goal.scores} />
                    {/* F-13: weight input when selected */}
                    {isSelected && (
                      <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
                        <label className="text-xs text-muted-foreground">Вес цели, %</label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={weights[goal.id] ?? 0}
                          onChange={(e) =>
                            setWeights((prev) => ({ ...prev, [goal.id]: Number(e.target.value) }))
                          }
                          className="h-8 text-xs"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* F-16/F-18: Count & weight checks */}
          {selected.length > 0 && (
            <div className="space-y-3">
              {(countWarning || weightWarning) && (
                <div className="glass-card p-4 text-sm border-warning/30">
                  <h4 className="font-semibold">⚠ Проверка набора целей (F-16/F-18)</h4>
                  <div className="mt-2 space-y-1 text-muted-foreground">
                    {countWarning && (
                      <p>Количество целей должно быть 3–5. Сейчас: {selected.length}.</p>
                    )}
                    {weightWarning && (
                      <p>Суммарный вес должен быть 100%. Сейчас: {totalWeight}%.</p>
                    )}
                  </div>
                </div>
              )}
              {!countWarning && !weightWarning && (
                <div className="glass-card p-4 text-sm border-success/30">
                  <p className="text-success font-medium">✓ Набор целей корректен: {selected.length} цели, сумма весов 100%</p>
                </div>
              )}

              {/* F-21: Duplicate check */}
              <div className="glass-card p-4 text-sm">
                <h4 className="font-semibold">Верификация (F-21 дубликаты)</h4>
                <p className="text-muted-foreground mt-2">
                  Проверены дубликаты с текущими целями сотрудника и историческими данными подразделения. Серьёзных конфликтов не найдено.
                </p>
              </div>

              <div className="flex justify-end">
                <Button className="gap-2" disabled={countWarning || weightWarning}>
                  Принять выбранные ({selected.length}) <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
