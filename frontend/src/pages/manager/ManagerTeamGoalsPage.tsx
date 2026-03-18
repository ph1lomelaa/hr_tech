import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import GoalCard from "@/components/GoalCard";
import { api, toGoalCard } from "@/lib/api";
import { useCurrentEmployee } from "@/hooks/use-current-employee";

const STATUS_LABELS: Record<string, string> = {
  all: "Все",
  draft: "Черновик",
  pending: "На согласовании",
  approved: "Утверждена",
  rejected: "Отклонена",
};

export default function ManagerTeamGoalsPage() {
  const { detail, employeeId } = useCurrentEmployee();
  const managerDepartment = detail?.department ?? "";
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterEmployeeId, setFilterEmployeeId] = useState<string>("all");

  const { data: goals = [], isLoading } = useQuery({
    queryKey: ["team-goals", employeeId, managerDepartment],
    queryFn: () => api.goals.list({ limit: 500 }),
    enabled: !!employeeId,
    staleTime: 30_000,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: () => api.employees.list(),
    enabled: !!employeeId,
    staleTime: 60_000,
  });

  const teamGoals = useMemo(() => {
    return managerDepartment
      ? goals.filter((g) => g.department === managerDepartment)
      : goals;
  }, [goals, managerDepartment]);

  const teamEmployees = useMemo(() => {
    return managerDepartment
      ? employees.filter((e) => e.department === managerDepartment)
      : employees;
  }, [employees, managerDepartment]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return teamGoals.filter((g) => {
      const matchSearch =
        !q ||
        (g.goal_text ?? g.title).toLowerCase().includes(q) ||
        (g.employee_name ?? "").toLowerCase().includes(q);
      const matchStatus = filterStatus === "all" || g.status === filterStatus;
      const matchEmployee = filterEmployeeId === "all" || g.employee_id === filterEmployeeId;
      return matchSearch && matchStatus && matchEmployee;
    });
  }, [teamGoals, search, filterStatus, filterEmployeeId]);

  const cards = useMemo(() => filtered.map(toGoalCard), [filtered]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Цели команды</h1>
        <p className="text-xs text-muted-foreground mt-1">
          {managerDepartment ? `Подразделение: ${managerDepartment}` : "Все подразделения"} · {teamEmployees.length} сотрудников
        </p>
      </div>

      <div className="glass-card-elevated p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по сотруднику или цели..."
              className="pl-9 control-surface"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="control-surface w-48">
              <SelectValue placeholder="Статус" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterEmployeeId} onValueChange={setFilterEmployeeId}>
            <SelectTrigger className="control-surface w-52">
              <SelectValue placeholder="Все сотрудники" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все сотрудники</SelectItem>
              {teamEmployees.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant="outline" className="text-xs shrink-0">
            {filtered.length} целей
          </Badge>
        </div>
      </div>

      <div className="space-y-3">
        {isLoading && <Skeleton className="h-28 w-full rounded-xl" />}
        {!isLoading && cards.length === 0 && (
          <div className="glass-card-elevated state-panel p-8 text-sm text-muted-foreground text-center">
            Нет целей
          </div>
        )}
        {cards.map((goal) => (
          <GoalCard key={goal.id} goal={goal} />
        ))}
      </div>
    </div>
  );
}
