import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SmartScoreGroup } from "@/components/SmartScoreBar";
import { Sparkles, Wand2, Check, RefreshCw, ChevronRight, Zap, AlertTriangle, Users } from "lucide-react";
import { managerSuggestions, companyGoalsForManager } from "@/data/mockManager";

const alignmentConfig: Record<string, { label: string; className: string }> = {
  strategic: { label: "Стратегическая", className: "bg-info/10 text-info" },
  functional: { label: "Функциональная", className: "bg-accent/10 text-accent-foreground border-accent/30" },
  operational: { label: "Операционная", className: "bg-muted text-muted-foreground" },
};

const goalTypeConfig: Record<string, { label: string; className: string }> = {
  activity: { label: "Activity", className: "bg-warning/10 text-warning" },
  output: { label: "Output", className: "bg-success/10 text-success" },
  impact: { label: "Impact", className: "bg-info/10 text-info" },
};

const generationHistory = [
  { id: "v2", date: "2026-01-25", accepted: 3, context: "Рост B2B, цифровизация" },
  { id: "v1", date: "2025-10-10", accepted: 2, context: "Найм и развитие команды" },
];

export default function ManagerGeneratePage() {
  const [generated, setGenerated] = useState(false);
  const [focus, setFocus] = useState("Рост B2B-продаж, внедрение CRM, развитие команды");
  const [selected, setSelected] = useState<number[]>([]);
  const [weights, setWeights] = useState<Record<number, number>>({ 1: 35, 2: 30, 3: 25, 4: 10 });
  const [rewrites, setRewrites] = useState<Record<number, boolean>>({});

  const toggleSelect = (id: number) =>
    setSelected((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);

  const applyRewrite = (id: number) =>
    setRewrites((prev) => ({ ...prev, [id]: true }));

  const selectedGoals = managerSuggestions.filter((g) => selected.includes(g.id));
  const totalWeight = selectedGoals.reduce((sum, g) => sum + (weights[g.id] ?? 0), 0);
  const countWarning = selected.length > 0 && (selected.length < 3 || selected.length > 5);
  const weightWarning = selected.length > 0 && totalWeight !== 100;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-primary" /> AI Генерация моих целей
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Цели руководителя формируются на основе стратегии и KPI — и каскадируются на команду
        </p>
      </div>

      {/* Params */}
      <div className="glass-card p-6 space-y-4">
        <h3 className="text-sm font-semibold">Параметры генерации</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Руководитель</label>
            <Input defaultValue="Васильев Игорь" disabled className="bg-muted/50" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Должность / Подразделение</label>
            <Input defaultValue="Руководитель отдела продаж · Продажи" disabled className="bg-muted/50" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Квартал</label>
            <Input defaultValue="Q1 2026" />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Фокус-приоритеты квартала (F-11)</label>
          <Textarea value={focus} onChange={(e) => setFocus(e.target.value)} rows={2} />
        </div>

        {/* Company goals cascading down to manager (F-14) */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Цели компании — каскадируются на вас (F-14)</label>
          <div className="bg-muted/40 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
            <p className="text-[10px] text-muted-foreground/70 mb-1">Источник: Стратегия 2026, Совет директоров</p>
            {companyGoalsForManager.map((g) => (
              <p key={g}>• {g}</p>
            ))}
          </div>
        </div>

        {/* Cascade info */}
        <div className="flex items-start gap-2 bg-primary/5 border border-primary/20 rounded-lg p-3 text-xs text-muted-foreground">
          <Users className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <p>Утверждённые цели будут видны вашей команде (5 чел.) при генерации их целей как контекст каскадирования.</p>
        </div>

        <Button onClick={() => setGenerated(true)} className="gap-2">
          <Wand2 className="w-4 h-4" /> Сгенерировать цели
        </Button>
      </div>

      {/* History (F-15) */}
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
            <h3 className="text-sm font-semibold">Предложенные цели ({managerSuggestions.length})</h3>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">{selected.length} выбрано</Badge>
              <Button variant="outline" size="sm" className="gap-1 text-xs">
                <RefreshCw className="w-3 h-3" /> Перегенерировать
              </Button>
            </div>
          </div>

          {managerSuggestions.map((goal) => {
            const isSelected = selected.includes(goal.id);
            const alignment = alignmentConfig[goal.alignmentLevel] ?? alignmentConfig.operational;
            const type = goalTypeConfig[goal.goalType] ?? goalTypeConfig.activity;
            const isActivity = goal.goalType === "activity";
            const lowSmart = goal.smartIndex < 0.7;
            const rewriteApplied = rewrites[goal.id];

            return (
              <div
                key={goal.id}
                onClick={() => toggleSelect(goal.id)}
                className={`glass-card p-5 cursor-pointer transition-all duration-200 ${
                  isSelected ? "ring-2 ring-primary bg-primary/5" : "hover:bg-muted/30"
                } ${lowSmart ? "border-warning/40" : ""}`}
              >
                <div className="flex items-start gap-4">
                  <div className={`mt-1 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                    isSelected ? "border-primary bg-primary" : "border-border"
                  }`}>
                    {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                  </div>

                  <div className="flex-1 space-y-3">
                    <p className="text-sm leading-relaxed">{goal.text}</p>

                    {/* F-12: SMART < 0.7 → auto-rewrite */}
                    {lowSmart && goal.autoRewrite && !rewriteApplied && (
                      <div className="flex items-start gap-2 bg-warning/5 border border-warning/20 rounded-lg p-3 text-xs" onClick={(e) => e.stopPropagation()}>
                        <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                        <div className="space-y-1 flex-1">
                          <p className="font-medium text-warning">F-12: SMART {goal.smartIndex.toFixed(2)} — ниже 0.7, переформулировка предложена автоматически</p>
                          <p className="text-muted-foreground italic">«{goal.rewrite}»</p>
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 mt-1 border-warning/40 text-warning hover:bg-warning/10" onClick={() => applyRewrite(goal.id)}>
                            <Wand2 className="w-3 h-3" /> Применить
                          </Button>
                        </div>
                      </div>
                    )}
                    {rewriteApplied && (
                      <div className="bg-success/5 border border-success/20 rounded-lg p-2 text-xs text-success">✓ Применена AI-переформулировка</div>
                    )}

                    {/* F-19: Activity → Output */}
                    {isActivity && !lowSmart && !rewriteApplied && (
                      <div className="flex items-center gap-2 bg-warning/5 border border-warning/20 rounded-lg p-2 text-xs" onClick={(e) => e.stopPropagation()}>
                        <AlertTriangle className="w-3 h-3 text-warning shrink-0" />
                        <span className="text-warning font-medium">F-19: Activity-цель</span>
                        <span className="text-muted-foreground">— рекомендуется переформулировать в Output.</span>
                        <button className="text-primary underline ml-1" onClick={() => applyRewrite(goal.id)}>Переформулировать</button>
                      </div>
                    )}

                    {/* F-10 + F-17 */}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Zap className="w-3 h-3 text-primary" />
                      <span className="font-medium">{goal.source}</span>
                      <span>·</span>
                      <Badge variant="outline" className={`text-[10px] ${alignment.className}`}>{alignment.label}</Badge>
                      <Badge variant="outline" className="text-[10px] bg-muted/60 text-muted-foreground">из: {goal.alignmentSource}</Badge>
                      <Badge variant="outline" className={`text-[10px] ${type.className}`}>{type.label}</Badge>
                    </div>

                    <div className="bg-muted/40 rounded-lg px-3 py-2 text-xs text-muted-foreground">
                      <span className="text-muted-foreground/60">Цитата: </span>{goal.sourceSnippet}
                    </div>
                    <p className="text-xs text-muted-foreground">Контекст: {goal.context}</p>

                    {/* Cascade info */}
                    {goal.cascadesTo.length > 0 && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Users className="w-3 h-3 text-primary" />
                        <span>Каскадируется на: {goal.cascadesTo.join(", ")}</span>
                      </div>
                    )}
                  </div>

                  <div className="w-40 shrink-0 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">SMART</span>
                      <span className={`text-sm font-bold font-mono ${goal.smartIndex >= 0.7 ? "text-success" : "text-warning"}`}>{goal.smartIndex.toFixed(2)}</span>
                    </div>
                    <SmartScoreGroup scores={goal.scores} />
                    {isSelected && (
                      <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
                        <label className="text-xs text-muted-foreground">Вес цели, %</label>
                        <Input
                          type="number" min={0} max={100}
                          value={weights[goal.id] ?? 0}
                          onChange={(e) => setWeights((prev) => ({ ...prev, [goal.id]: Number(e.target.value) }))}
                          className="h-8 text-xs"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {selected.length > 0 && (
            <div className="space-y-3">
              {(countWarning || weightWarning) ? (
                <div className="glass-card p-4 text-sm border-warning/30">
                  <h4 className="font-semibold">⚠ Проверка набора (F-16/F-18)</h4>
                  <div className="mt-2 space-y-1 text-muted-foreground">
                    {countWarning && <p>Количество целей должно быть 3–5. Сейчас: {selected.length}.</p>}
                    {weightWarning && <p>Суммарный вес должен быть 100%. Сейчас: {totalWeight}%.</p>}
                  </div>
                </div>
              ) : (
                <div className="glass-card p-4 text-sm border-success/30">
                  <p className="text-success font-medium">✓ Набор корректен: {selected.length} цели, сумма весов 100%</p>
                </div>
              )}
              <div className="glass-card p-4 text-sm">
                <h4 className="font-semibold">Верификация (F-21 дубликаты)</h4>
                <p className="text-muted-foreground mt-2">Дубликаты внутри набора проверены. Конфликтов не обнаружено.</p>
              </div>
              <div className="flex justify-end">
                <Button className="gap-2" disabled={countWarning || weightWarning}>
                  Принять и сохранить ({selected.length}) <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
