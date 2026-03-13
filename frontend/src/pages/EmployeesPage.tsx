import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { mockEmployees, employeeQuarterSummary } from "@/data/mockEmployees";
import { SmartScoreGroup } from "@/components/SmartScoreBar";

const departments = ["Все подразделения", "IT Департамент", "HR Департамент", "Финансы", "Маркетинг", "Продажи", "Юридический"];

export default function EmployeesPage() {
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("Все подразделения");
  const [selectedId, setSelectedId] = useState(mockEmployees[0]?.id ?? "");

  const filtered = useMemo(() => {
    return mockEmployees.filter((emp) => {
      const q = search.toLowerCase();
      const matchesSearch = !q || emp.name.toLowerCase().includes(q) || emp.position.toLowerCase().includes(q);
      const matchesDept = deptFilter === "Все подразделения" || emp.department === deptFilter;
      return matchesSearch && matchesDept;
    });
  }, [search, deptFilter]);

  const selected = filtered.find((emp) => emp.id === selectedId) ?? filtered[0];

  const summaryScores = [
    { key: "S", label: "Specific", value: 0.55 },
    { key: "M", label: "Measurable", value: 0.58 },
    { key: "A", label: "Achievable", value: 0.72 },
    { key: "R", label: "Relevant", value: 0.66 },
    { key: "T", label: "Time-bound", value: 0.49 },
  ];

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Сотрудники</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Контроль целей, качества и стратегической связки по сотрудникам
          </p>
        </div>
        <Button variant="outline">Экспорт</Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Input
            placeholder="Поиск по сотрудникам..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-muted/50 border-transparent"
          />
        </div>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-56 bg-muted/50 border-transparent">
            <SelectValue placeholder="Подразделение" />
          </SelectTrigger>
          <SelectContent>
            {departments.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="outline" className="text-xs">
          {filtered.length} сотрудников
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
        <div className="glass-card p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b border-border">
                <th className="text-left py-2 pr-3 font-medium">Сотрудник</th>
                <th className="text-left py-2 pr-3 font-medium">Должность</th>
                <th className="text-left py-2 pr-3 font-medium">Подразделение</th>
                <th className="text-center py-2 px-3 font-medium">SMART</th>
                <th className="text-center py-2 px-3 font-medium">Стратег. %</th>
                <th className="text-center py-2 px-3 font-medium">Целей</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((emp) => (
                <tr
                  key={emp.id}
                  className={`border-b border-border/40 hover:bg-muted/30 transition-colors cursor-pointer ${
                    emp.id === selected?.id ? "bg-primary/5" : ""
                  }`}
                  onClick={() => setSelectedId(emp.id)}
                >
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                        {emp.name.split(" ").map((n) => n[0]).join("")}
                      </div>
                      <div>
                        <p className="font-medium">{emp.name}</p>
                        <p className="text-xs text-muted-foreground">Руководитель: {emp.manager}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-3 text-muted-foreground">{emp.position}</td>
                  <td className="py-3 pr-3 text-muted-foreground">{emp.department}</td>
                  <td className="text-center py-3 px-3 font-mono font-semibold">
                    {emp.avgSmart.toFixed(2)}
                  </td>
                  <td className="text-center py-3 px-3">
                    <span className="font-mono">{emp.strategicShare}%</span>
                  </td>
                  <td className="text-center py-3 px-3 font-mono">{emp.goalsCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selected && (
          <div className="space-y-4">
            <div className="glass-card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Квартальный срез</h3>
                  <p className="text-xs text-muted-foreground mt-1">{employeeQuarterSummary.quarter}</p>
                </div>
                <Badge variant="outline" className="text-xs">
                  {selected.department}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Средний SMART</p>
                  <p className="font-mono font-semibold">{employeeQuarterSummary.avgSmart.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Стратегическая доля</p>
                  <p className="font-mono font-semibold">{employeeQuarterSummary.strategicShare}%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Целей</p>
                  <p className="font-mono font-semibold">{employeeQuarterSummary.totalGoals}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Сумма весов</p>
                  <p className={`font-mono font-semibold ${employeeQuarterSummary.weightSum !== 100 ? "text-warning" : ""}`}>
                    {employeeQuarterSummary.weightSum}%
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <p className="text-xs text-muted-foreground mb-2">Слабые критерии</p>
                <SmartScoreGroup scores={summaryScores} />
              </div>
            </div>

            <div className="glass-card p-5 space-y-3">
              <h3 className="text-sm font-semibold">Алерты по сотруднику</h3>
              <div className="space-y-2 text-sm text-muted-foreground">
                {employeeQuarterSummary.alerts.map((alert) => (
                  <div key={alert} className="flex items-start gap-2">
                    <span className="mt-1 w-2 h-2 rounded-full bg-warning" />
                    <span>{alert}</span>
                  </div>
                ))}
              </div>
              <Button size="sm" className="mt-2">Открыть карточку</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
