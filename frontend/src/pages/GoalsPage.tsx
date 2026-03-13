import { useMemo, useState } from "react";
import GoalCard from "@/components/GoalCard";
import { mockGoals } from "@/data/mockData";
import { mockEmployees } from "@/data/mockEmployees";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Plus } from "lucide-react";
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
import { evaluateSmart } from "@/lib/smartEvaluate";

const statusFilters = ["Все", "Черновик", "На согласовании", "Утверждена", "Отклонена"];
const statusMap: Record<string, string> = {
  "Все": "",
  "Черновик": "draft",
  "На согласовании": "review",
  "Утверждена": "approved",
  "Отклонена": "rejected",
};

export default function GoalsPage() {
  const [goals, setGoals] = useState(mockGoals);
  const [activeFilter, setActiveFilter] = useState("Все");
  const [search, setSearch] = useState("");
  const [goalDraft, setGoalDraft] = useState("");
  const [evaluation, setEvaluation] = useState<ReturnType<typeof evaluateSmart> | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(mockEmployees[0].id);
  const [addOpen, setAddOpen] = useState(false);
  const [newEmployeeId, setNewEmployeeId] = useState(mockEmployees[0].id);
  const [newGoalText, setNewGoalText] = useState("");
  const [newWeight, setNewWeight] = useState("");
  const [newQuarter, setNewQuarter] = useState("Q2 2026");
  const [newSource, setNewSource] = useState("");
  const [newStatus, setNewStatus] = useState<"draft" | "review" | "approved" | "rejected">("draft");

  const filtered = goals.filter((g) => {
    const matchStatus = activeFilter === "Все" || g.status === statusMap[activeFilter];
    const matchSearch = !search || g.text.toLowerCase().includes(search.toLowerCase()) || g.employeeName.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const selectedEmployee = mockEmployees.find((e) => e.id === selectedEmployeeId) ?? mockEmployees[0];

  const batchSummary = useMemo(() => {
    const empGoals = goals.filter((g) => g.employeeName === selectedEmployee.name);
    const totalGoals = empGoals.length;
    const weightSum = empGoals.reduce((s, g) => s + (g.weight || 0), 0);
    const avgSmart = empGoals.length > 0 ? empGoals.reduce((s, g) => s + g.smartIndex, 0) / empGoals.length : 0;
    const criteriaMap: Record<string, number[]> = { S: [], M: [], A: [], R: [], T: [] };
    empGoals.forEach((g) => {
      g.smartScores?.forEach((sc) => { criteriaMap[sc.key]?.push(sc.value); });
    });
    const weakCriteria = Object.entries(criteriaMap)
      .filter(([, vals]) => vals.length > 0 && vals.reduce((a, b) => a + b, 0) / vals.length < 0.6)
      .map(([k]) => ({ S: "Specific", M: "Measurable", A: "Achievable", R: "Relevant", T: "Time-bound" }[k] ?? k));
    return { totalGoals, weightSum, avgSmart, weakCriteria };
  }, [selectedEmployee, goals]);

  const handleAddGoal = () => {
    if (!newGoalText.trim()) return;
    const employee = mockEmployees.find((e) => e.id === newEmployeeId) ?? mockEmployees[0];
    const evalResult = evaluateSmart(newGoalText);
    const weightNum = Number(newWeight) || 0;
    const newGoal = {
      id: `g-hr-${Date.now()}`,
      employeeName: employee.name,
      position: employee.position,
      department: employee.department,
      text: newGoalText.trim(),
      status: newStatus,
      smartIndex: evalResult.smartIndex,
      smartScores: evalResult.scores,
      linkType: "functional" as const,
      quarter: newQuarter,
      weight: weightNum,
      goalType: evalResult.goalType,
      source: newSource || undefined,
    };
    setGoals((prev) => [newGoal, ...prev]);
    setAddOpen(false);
    setNewGoalText("");
    setNewWeight("");
    setNewQuarter("Q2 2026");
    setNewSource("");
    setNewStatus("draft");
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Цели сотрудников</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Управление и оценка качества целей · {goals.length} целей
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
              <DialogDescription>Создайте цель для сотрудника и автоматически посчитайте SMART.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Сотрудник</label>
                <Select value={newEmployeeId} onValueChange={setNewEmployeeId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {mockEmployees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.name} — {e.position}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Формулировка цели</label>
                <Textarea value={newGoalText} onChange={(e) => setNewGoalText(e.target.value)} rows={3} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Вес, %</label>
                  <Input value={newWeight} onChange={(e) => setNewWeight(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Квартал</label>
                  <Input value={newQuarter} onChange={(e) => setNewQuarter(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Источник (необязательно)</label>
                <Input value={newSource} onChange={(e) => setNewSource(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Статус</label>
                <Select value={newStatus} onValueChange={(v) => setNewStatus(v as typeof newStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Черновик</SelectItem>
                    <SelectItem value="review">На согласовании</SelectItem>
                    <SelectItem value="approved">Утверждена</SelectItem>
                    <SelectItem value="rejected">Отклонена</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)}>Отмена</Button>
              <Button onClick={handleAddGoal} disabled={!newGoalText.trim()}>Создать</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по целям..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-muted/50 border-transparent"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {statusFilters.map((f) => (
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-4">
        {/* SMART eval — real AI */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold">SMART-оценка цели</h3>
          <p className="text-xs text-muted-foreground mt-1">
            AI анализирует текст — результат зависит от формулировки
          </p>
          <div className="mt-4 space-y-3">
            <Textarea
              placeholder="Вставьте формулировку цели для оценки..."
              value={goalDraft}
              onChange={(e) => { setGoalDraft(e.target.value); setEvaluation(null); }}
              rows={3}
            />
            <Button
              onClick={() => setEvaluation(evaluateSmart(goalDraft))}
              className="gap-2"
              disabled={!goalDraft.trim()}
              variant={evaluation ? "outline" : "default"}
            >
              {evaluation ? "Переоценить" : "Оценить SMART"}
            </Button>
          </div>

          {evaluation && (
            <div className="mt-5 space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Индекс качества</span>
                <span className={`font-mono font-semibold ${evaluation.smartIndex >= 0.7 ? "text-success" : "text-warning"}`}>
                  {evaluation.smartIndex.toFixed(2)}
                </span>
              </div>
              <SmartScoreGroup scores={evaluation.scores} />
              {evaluation.recommendations.length > 0 && (
                <div className="space-y-2 text-sm text-muted-foreground">
                  {evaluation.recommendations.map((rec) => (
                    <div key={rec} className="flex items-start gap-2">
                      <span className="mt-1 w-2 h-2 rounded-full bg-primary" />
                      <span>{rec}</span>
                    </div>
                  ))}
                </div>
              )}
              {evaluation.smartIndex < 0.7 && (
                <div className="bg-muted/40 rounded-lg p-3 text-sm space-y-2">
                  <p className="text-xs text-muted-foreground">AI-переформулировка</p>
                  <p className="text-muted-foreground">{evaluation.rewrite}</p>
                  <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => setGoalDraft(evaluation.rewrite)}>
                    Применить
                  </Button>
                </div>
              )}
              {evaluation.weakCriteria.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {evaluation.weakCriteria.map((c) => (
                    <Badge key={c} variant="outline" className="text-[10px] bg-warning/10 text-warning">⚠ {c}</Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Batch summary — employee selector */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold">Пакетная оценка целей</h3>
          <div className="mt-3 space-y-2">
            <label className="text-xs text-muted-foreground font-medium">Выберите сотрудника</label>
            <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {mockEmployees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name} — {e.position}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Целей</p>
              <p className={`font-mono font-semibold ${
                batchSummary.totalGoals === 0 ? "text-muted-foreground" :
                (batchSummary.totalGoals < 3 || batchSummary.totalGoals > 5) ? "text-warning" : "text-success"
              }`}>
                {batchSummary.totalGoals}{batchSummary.totalGoals > 0 ? " / 3–5" : ""}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Сумма весов</p>
              <p className={`font-mono font-semibold ${batchSummary.weightSum !== 100 && batchSummary.totalGoals > 0 ? "text-warning" : ""}`}>
                {batchSummary.totalGoals > 0 ? `${batchSummary.weightSum}%` : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Средний SMART</p>
              <p className={`font-mono font-semibold ${batchSummary.avgSmart >= 0.7 ? "text-success" : batchSummary.avgSmart > 0 ? "text-warning" : "text-muted-foreground"}`}>
                {batchSummary.avgSmart > 0 ? batchSummary.avgSmart.toFixed(2) : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">SMART (справочно)</p>
              <p className="font-mono font-semibold">{selectedEmployee.avgSmart.toFixed(2)}</p>
            </div>
          </div>

          {batchSummary.totalGoals === 0 && (
            <p className="text-xs text-muted-foreground mt-3 bg-muted/30 rounded px-2 py-1">
              Нет целей в системе для данного сотрудника
            </p>
          )}

          {batchSummary.totalGoals > 0 && (
            <div className="mt-3 space-y-1">
              {(batchSummary.totalGoals < 3 || batchSummary.totalGoals > 5) && (
                <div className="text-xs text-warning bg-warning/5 rounded px-2 py-1">
                  ⚠ Целей {batchSummary.totalGoals} — вне диапазона 3–5
                </div>
              )}
              {batchSummary.weightSum !== 100 && (
                <div className="text-xs text-warning bg-warning/5 rounded px-2 py-1">
                  ⚠ Сумма весов {batchSummary.weightSum}% ≠ 100%
                </div>
              )}
              {batchSummary.totalGoals >= 3 && batchSummary.totalGoals <= 5 && batchSummary.weightSum === 100 && (
                <div className="text-xs text-success bg-success/5 rounded px-2 py-1">✓ Набор целей корректен</div>
              )}
            </div>
          )}

          {batchSummary.weakCriteria.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-muted-foreground mb-1">Слабые SMART-критерии:</p>
              <div className="flex flex-wrap gap-1">
                {batchSummary.weakCriteria.map((c) => (
                  <Badge key={c} variant="outline" className="text-[10px] bg-warning/10 text-warning">⚠ {c}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Goals list */}
      <div className="space-y-3">
        {filtered.map((goal) => (
          <GoalCard key={goal.id} goal={goal} />
        ))}
        {filtered.length === 0 && (
          <div className="glass-card p-12 text-center text-muted-foreground">
            <p className="text-sm">Цели не найдены</p>
          </div>
        )}
      </div>
    </div>
  );
}
