import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SmartScoreGroup } from "@/components/SmartScoreBar";
import { Sparkles, Wand2, Check, RefreshCw, ChevronRight, Zap, AlertTriangle } from "lucide-react";
import { mockEmployees } from "@/data/mockEmployees";
import { evaluateSmart } from "@/lib/smartEvaluate";

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

const sampleGenerated = [
  {
    id: 1,
    text: "Сократить время онбординга новых сотрудников с 14 до 7 рабочих дней к 30 июня 2026 г. за счёт внедрения цифрового чек-листа и автоматизации доступов.",
    smartIndex: 0.89,
    scores: [
      { key: "S", label: "Specific", value: 0.9 },
      { key: "M", label: "Measurable", value: 0.85 },
      { key: "A", label: "Achievable", value: 0.9 },
      { key: "R", label: "Relevant", value: 0.95 },
      { key: "T", label: "Time-bound", value: 0.85 },
    ],
    source: "ВНД-045: Политика адаптации персонала",
    sourceSnippet: "Срок прохождения онбординга не должен превышать 7 рабочих дней при условии использования цифрового чек-листа.",
    alignmentLevel: "strategic",
    alignmentSource: "ВНД-045",
    goalType: "output",
    context: "Фокус квартала: цифровизация HR-процессов и ускорение адаптации.",
    autoRewrite: false,
    rewrite: null as string | null,
  },
  {
    id: 2,
    text: "Повысить eNPS подразделения с 32 до 45 баллов к концу Q2 2026 через проведение ежемесячных 1:1 встреч и реализацию 3 инициатив по результатам опроса.",
    smartIndex: 0.83,
    scores: [
      { key: "S", label: "Specific", value: 0.85 },
      { key: "M", label: "Measurable", value: 0.9 },
      { key: "A", label: "Achievable", value: 0.75 },
      { key: "R", label: "Relevant", value: 0.85 },
      { key: "T", label: "Time-bound", value: 0.8 },
    ],
    source: "Стратегия HR 2026: п.3.2 Вовлечённость",
    sourceSnippet: "Рост eNPS +15 п.п. достигается через регулярную обратную связь и инициативы по вовлечённости.",
    alignmentLevel: "strategic",
    alignmentSource: "Стратегия HR 2026",
    goalType: "impact",
    context: "Связано с KPI вовлечённости и приоритетом развития культуры обратной связи.",
    autoRewrite: false,
    rewrite: null as string | null,
  },
  {
    id: 3,
    text: "Разработать и внедрить систему грейдирования для 25 позиций департамента к 15 мая 2026 г. на основе методологии Hay Group.",
    smartIndex: 0.86,
    scores: [
      { key: "S", label: "Specific", value: 0.9 },
      { key: "M", label: "Measurable", value: 0.8 },
      { key: "A", label: "Achievable", value: 0.85 },
      { key: "R", label: "Relevant", value: 0.9 },
      { key: "T", label: "Time-bound", value: 0.85 },
    ],
    source: "KPI HR Департамента Q1-Q2",
    sourceSnippet: "Требуется внедрение системы грейдов для ключевых ролей с покрытием минимум 25 позиций.",
    alignmentLevel: "functional",
    alignmentSource: "KPI HR Департамента",
    goalType: "output",
    context: "Приоритет квартала — оптимизация системы грейдирования и прозрачность ролей.",
    autoRewrite: false,
    rewrite: null as string | null,
  },
  {
    id: 4,
    text: "Участвовать в HR-конференциях и вести записи в базе знаний.",
    smartIndex: 0.29,
    scores: [
      { key: "S", label: "Specific", value: 0.3 },
      { key: "M", label: "Measurable", value: 0.05 },
      { key: "A", label: "Achievable", value: 0.7 },
      { key: "R", label: "Relevant", value: 0.5 },
      { key: "T", label: "Time-bound", value: 0.0 },
    ],
    source: "Стратегия развития персонала 2026",
    sourceSnippet: "Развитие профессиональных компетенций через участие в профильных мероприятиях.",
    alignmentLevel: "operational",
    alignmentSource: "Стратегия развития персонала",
    goalType: "activity",
    context: "Операционная активность. SMART < 0.7 — AI переформулировала.",
    autoRewrite: true,
    rewrite: "Применить 2 новые HR-практики с конференций в процессах подразделения к 30 июня 2026 г., зафиксировав результаты в базе знаний.",
  },
];

const generationHistory = [
  { id: "v3", date: "2026-02-10", accepted: 3, employee: "Сидорова Мария", context: "Цифровизация, вовлечённость" },
  { id: "v2", date: "2026-01-28", accepted: 2, employee: "Петров Алексей", context: "Снижение затрат" },
  { id: "v1", date: "2026-01-15", accepted: 4, employee: "Козлов Дмитрий", context: "Грейдирование и адаптация" },
];

export default function GeneratePage() {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("e-002");
  const [quarter, setQuarter] = useState("Q2 2026");
  const [focus, setFocus] = useState("Цифровизация HR-процессов, повышение вовлечённости сотрудников, оптимизация системы грейдирования");
  const [generated, setGenerated] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [weights, setWeights] = useState<Record<number, number>>({ 1: 25, 2: 25, 3: 25, 4: 25 });
  const [rewrites, setRewrites] = useState<Record<number, boolean>>({});

  const employee = mockEmployees.find((e) => e.id === selectedEmployeeId) ?? mockEmployees[0];

  const generatedGoals = useMemo(() => {
    return sampleGenerated.map((goal) => {
      const evalResult = evaluateSmart(goal.text);
      const autoRewrite = evalResult.smartIndex < 0.7;
      const rewrite = goal.rewrite ?? evalResult.rewrite;
      return {
        ...goal,
        smartIndex: evalResult.smartIndex,
        scores: evalResult.scores,
        autoRewrite,
        rewrite,
      };
    });
  }, []);

  const toggleSelect = (id: number) =>
    setSelected((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);

  const applyRewrite = (id: number) =>
    setRewrites((prev) => ({ ...prev, [id]: true }));

  const selectedGoals = generatedGoals.filter((g) => selected.includes(g.id));
  const totalWeight = selectedGoals.reduce((sum, g) => sum + (weights[g.id] ?? 0), 0);
  const countWarning = selected.length > 0 && (selected.length < 3 || selected.length > 5);
  const weightWarning = selected.length > 0 && totalWeight !== 100;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-primary" /> AI Генерация целей
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Генерация стратегически связанных целей на основе ВНД, KPI и целей руководителя
        </p>
      </div>

      <div className="glass-card p-6 space-y-4">
        <h3 className="text-sm font-semibold">Параметры генерации</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Сотрудник (F-09)</label>
            <Select value={selectedEmployeeId} onValueChange={(v) => { setSelectedEmployeeId(v); setGenerated(false); setSelected([]); }}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите сотрудника" />
              </SelectTrigger>
              <SelectContent>
                {mockEmployees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name} — {e.position}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Квартал</label>
            <Input value={quarter} onChange={(e) => setQuarter(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Должность</label>
            <Input value={employee.position} disabled className="bg-muted/50" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Подразделение</label>
            <Input value={employee.department} disabled className="bg-muted/50" />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Фокус-приоритеты квартала (F-11)</label>
          <Textarea value={focus} onChange={(e) => setFocus(e.target.value)} rows={2} />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Цели руководителя (каскадирование F-14)</label>
          <div className="bg-muted/40 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
            <p className="text-[10px] text-muted-foreground/70 mb-1">Руководитель: {employee.manager}</p>
            <p>• Снизить операционные затраты HR на 8% к концу Q2 2026</p>
            <p>• Повысить долю цифровых HR-процессов до 60%</p>
            <p>• Обеспечить SMART-индекс набора целей команды ≥ 0.75</p>
          </div>
        </div>
        <Button onClick={() => setGenerated(true)} className="gap-2">
          <Wand2 className="w-4 h-4" /> Сгенерировать цели
        </Button>
      </div>

      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3">История генераций (F-15)</h3>
        <div className="space-y-2 text-sm text-muted-foreground">
          {generationHistory.map((item) => (
            <div key={item.id} className="flex items-center justify-between border-b border-border/40 pb-2">
              <div>
                <p className="font-medium text-foreground/80">{item.id} · {item.date} · {item.employee}</p>
                <p className="text-xs">Контекст: {item.context}</p>
              </div>
              <Badge variant="outline" className="text-xs">Принято {item.accepted}</Badge>
            </div>
          ))}
        </div>
      </div>

      {generated && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Предложенные цели для {employee.name} ({generatedGoals.length})</h3>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">{selected.length} выбрано</Badge>
              <Button variant="outline" size="sm" className="gap-1 text-xs">
                <RefreshCw className="w-3 h-3" /> Перегенерировать
              </Button>
            </div>
          </div>

          {generatedGoals.map((goal) => {
            const isSelected = selected.includes(goal.id);
            const alignment = alignmentConfig[goal.alignmentLevel] ?? alignmentConfig.operational;
            const type = goalTypeConfig[goal.goalType] ?? goalTypeConfig.activity;
            const isActivity = goal.goalType === "activity";
            const lowSmart = goal.smartIndex < 0.7;
            const rewriteApplied = rewrites[goal.id];
            const displayText = rewriteApplied && goal.rewrite ? goal.rewrite : goal.text;

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
                    <p className="text-sm leading-relaxed">{displayText}</p>

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

                    {isActivity && !lowSmart && !rewriteApplied && (
                      <div className="flex items-center gap-2 bg-warning/5 border border-warning/20 rounded-lg p-2 text-xs" onClick={(e) => e.stopPropagation()}>
                        <AlertTriangle className="w-3 h-3 text-warning shrink-0" />
                        <span className="text-warning font-medium">F-19: Activity-цель</span>
                        <span className="text-muted-foreground">— рекомендуется переформулировать в Output.</span>
                        <button className="text-primary underline ml-1" onClick={() => applyRewrite(goal.id)}>Переформулировать</button>
                      </div>
                    )}

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
                <p className="text-muted-foreground mt-2">Дубликаты внутри набора и с историческими целями проверены. Конфликтов не обнаружено.</p>
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
