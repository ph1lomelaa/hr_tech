import { CheckCircle2, Target, Sparkles, ArrowRight, Info, ChevronDown, ChevronUp } from "lucide-react";
import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import StatCard from "@/components/StatCard";
import GoalCard from "@/components/GoalCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, toGoalCard } from "@/lib/api";
import { formatQuarterYear, getCurrentQuarterYear } from "@/lib/date";
import { useCurrentEmployee } from "@/hooks/use-current-employee";

const statusColors: Record<string, string> = {
  approved: "bg-success/10 text-success",
  pending: "bg-warning/10 text-warning",
  draft: "bg-muted text-muted-foreground",
  rejected: "bg-destructive/10 text-destructive",
};
const statusLabels: Record<string, string> = {
  approved: "Утверждена",
  pending: "На согласовании",
  draft: "Черновик",
  rejected: "Отклонена",
};

export default function EmployeeDashboard() {
  const { employeeId, detail, isLoading: employeeLoading } = useCurrentEmployee();
  const { quarter, year } = getCurrentQuarterYear();
  const quarterLabel = formatQuarterYear(quarter, year);

  const { data: goals = [], isLoading: goalsLoading } = useQuery({
    queryKey: ["employee-goals", employeeId, quarter, year],
    queryFn: () => api.employees.goals(employeeId!, { quarter, year }),
    enabled: !!employeeId,
    staleTime: 30_000,
  });

  const { data: managerGoals = [] } = useQuery({
    queryKey: ["manager-goals", employeeId, quarter, year],
    queryFn: () => api.employees.managerGoals(employeeId!, quarter, year),
    enabled: !!employeeId,
    staleTime: 60_000,
  });

  const summary = useMemo(() => {
    const totalGoals = goals.length;
    const weightSum = goals.reduce((sum, g) => sum + (g.weight ?? 0), 0);
    const approved = goals.filter((g) => g.status === "approved").length;
    const review = goals.filter((g) => g.status === "pending").length;
    const avgSmart = totalGoals > 0
      ? goals.reduce((s, g) => s + (g.smart_index ?? 0.5), 0) / totalGoals
      : 0;
    const strategicShare = totalGoals > 0
      ? Math.round((goals.filter((g) => g.alignment_level === "strategic").length / totalGoals) * 100)
      : 0;
    return { totalGoals, weightSum, approved, review, avgSmart, strategicShare };
  }, [goals]);

  const goalCards = useMemo(() => goals.map(toGoalCard), [goals]);
  const [goalsExpanded, setGoalsExpanded] = useState(false);
  const GOALS_PREVIEW = 3;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Мой обзор</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Состояние целей, качество и рекомендации AI · {quarterLabel}
        </p>
      </div>

      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        initial="hidden"
        animate="visible"
        variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}
      >
        {[
          { icon: Target, title: "Мои цели", value: employeeLoading ? "—" : String(summary.totalGoals) },
          { icon: CheckCircle2, title: "Утверждено", value: employeeLoading ? "—" : String(summary.approved) },
          { icon: Sparkles, title: "Средний SMART", value: employeeLoading ? "—" : summary.avgSmart.toFixed(2) },
          { icon: Target, title: "Вес целей", value: employeeLoading ? "—" : `${summary.weightSum}%` },
        ].map(({ icon, title, value }) => (
          <motion.div
            key={title}
            variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } } }}
          >
            <StatCard icon={icon} title={title} value={value} />
          </motion.div>
        ))}
      </motion.div>

      {/* Manager goals banner — cascading context */}
      <div className="glass-card-elevated p-5 border-primary/20">
        <div className="flex items-start gap-3 mb-4">
          <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold">Цели руководителя — контекст для ваших целей</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ваши цели должны поддерживать цели руководителя. Используйте их как ориентир при создании и генерации целей.
            </p>
          </div>
          <Button asChild variant="ghost" size="sm" className="gap-1 text-xs shrink-0 ml-auto">
            <Link to="/employee/generate">AI-подбор <ArrowRight className="w-3 h-3" /></Link>
          </Button>
        </div>
        <div className="space-y-2">
          {managerGoals.length === 0 && (
            <div className="text-xs text-muted-foreground">Цели руководителя не найдены</div>
          )}
          {managerGoals.map((g) => (
            <div key={g.id} className="flex items-start justify-between gap-3 p-3 rounded-lg bg-muted/40">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground mb-1">
                  {detail?.manager_id ? "Руководитель" : "Руководитель не найден"}
                </p>
                <p className="text-sm text-muted-foreground line-clamp-2">{g.goal_text}</p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Badge variant="outline" className={`text-[10px] ${statusColors[g.status]}`}>{statusLabels[g.status]}</Badge>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Мои цели */}
      <div className="glass-card-elevated p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">
            Мои цели
            {goalCards.length > 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">({goalCards.length})</span>}
          </h3>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="gap-1 text-xs">
              <Link to="/employee/goals">Все <ArrowRight className="w-3 h-3" /></Link>
            </Button>
            {goalCards.length > GOALS_PREVIEW && (
              <button
                onClick={() => setGoalsExpanded((v) => !v)}
                className="text-xs text-primary flex items-center gap-1 hover:underline"
              >
                {goalsExpanded ? <><ChevronUp className="w-3 h-3" /> Свернуть</> : <><ChevronDown className="w-3 h-3" /> Ещё {goalCards.length - GOALS_PREVIEW}</>}
              </button>
            )}
          </div>
        </div>
        <div className="space-y-3">
          {goalsLoading && <Skeleton className="h-32 w-full rounded-xl" />}
          {!goalsLoading && goalCards.length === 0 && (
            <div className="state-panel p-6 text-sm text-center text-muted-foreground">
              Цели не найдены
            </div>
          )}
          {(goalsExpanded ? goalCards : goalCards.slice(0, GOALS_PREVIEW)).map((goal) => (
            <GoalCard key={goal.id} goal={goal} />
          ))}
        </div>
      </div>
    </div>
  );
}
