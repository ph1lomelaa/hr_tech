import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { departmentMaturity } from "@/data/mockData";
import { analyticsHighlights, alignmentLevels, goalTypeDistribution, smartDistributionDetailed } from "@/data/mockAnalytics";
import { toast } from "@/components/ui/use-toast";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { X } from "lucide-react";

// Drill-down data per department (F-22)
const departmentDrilldown: Record<string, {
  weakCriteria: string[];
  topIssues: string[];
  recommendations: string[];
  goalTypeBreakdown: { type: string; count: number; color: string }[];
}> = {
  "IT Департамент": {
    weakCriteria: ["Time-bound"],
    topIssues: ["15% целей без конкретного срока", "3 дублирующих цели в Q1"],
    recommendations: ["Добавить обязательный дедлайн в шаблон", "Провести ревью на дубликаты"],
    goalTypeBreakdown: [{ type: "Output", count: 28, color: "hsl(152,60%,42%)" }, { type: "Impact", count: 12, color: "hsl(210,100%,52%)" }, { type: "Activity", count: 5, color: "hsl(38,92%,50%)" }],
  },
  "HR Департамент": {
    weakCriteria: ["Specific", "Measurable"],
    topIssues: ["40% целей сформулированы как Activity", "Средний SMART 0.61 — ниже порога 0.7"],
    recommendations: ["Внедрить обязательную AI-оценку перед отправкой", "Провести обучение по SMART-методологии"],
    goalTypeBreakdown: [{ type: "Activity", count: 13, color: "hsl(38,92%,50%)" }, { type: "Output", count: 10, color: "hsl(152,60%,42%)" }, { type: "Impact", count: 5, color: "hsl(210,100%,52%)" }],
  },
  "Финансы": {
    weakCriteria: [],
    topIssues: ["Все цели соответствуют стандарту SMART"],
    recommendations: ["Поделиться лучшими практиками с другими отделами"],
    goalTypeBreakdown: [{ type: "Output", count: 18, color: "hsl(152,60%,42%)" }, { type: "Impact", count: 10, color: "hsl(210,100%,52%)" }, { type: "Activity", count: 4, color: "hsl(38,92%,50%)" }],
  },
  "Маркетинг": {
    weakCriteria: ["Measurable"],
    topIssues: ["30% целей без числового KPI", "Стратегическая связка только у 55% целей"],
    recommendations: ["Требовать числовой KPI при создании цели", "Усилить каскадирование со стратегией"],
    goalTypeBreakdown: [{ type: "Output", count: 12, color: "hsl(152,60%,42%)" }, { type: "Activity", count: 7, color: "hsl(38,92%,50%)" }, { type: "Impact", count: 3, color: "hsl(210,100%,52%)" }],
  },
  "Продажи": {
    weakCriteria: ["Achievable"],
    topIssues: ["Некоторые цели по росту продаж превышают исторический максимум", "Цели Q1 пересекаются по результату"],
    recommendations: ["Сверить амбициозность с историческими данными", "Проверить пересечения через F-21"],
    goalTypeBreakdown: [{ type: "Impact", count: 18, color: "hsl(210,100%,52%)" }, { type: "Output", count: 15, color: "hsl(152,60%,42%)" }, { type: "Activity", count: 5, color: "hsl(38,92%,50%)" }],
  },
  "Юридический": {
    weakCriteria: ["Specific", "Measurable", "Time-bound"],
    topIssues: ["Средний SMART 0.52 — критически низкий", "70% целей — Activity без результата"],
    recommendations: ["Обязательная консультация HR при постановке целей", "Перевести все цели на шаблон с KPI"],
    goalTypeBreakdown: [{ type: "Activity", count: 10, color: "hsl(38,92%,50%)" }, { type: "Output", count: 4, color: "hsl(152,60%,42%)" }, { type: "Impact", count: 1, color: "hsl(210,100%,52%)" }],
  },
};

export default function AnalyticsPage() {
  const [selectedDept, setSelectedDept] = useState<string | null>(departmentMaturity[0]?.department ?? null);
  const drilldown = selectedDept ? departmentDrilldown[selectedDept] : null;

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Аналитика</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Качество целей, SMART-профили и стратегическая связка
          </p>
        </div>
        <Button variant="outline" onClick={() => toast({ title: "Отчёт сформирован", description: "Экспорт будет доступен в формате PDF/CSV." })}>
          Экспорт отчёта
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass-card p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold mb-4">Профиль SMART по компании</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={smartDistributionDetailed} barGap={8}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 90%)" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" domain={[0, 1]} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(220,13%,90%)", fontSize: 12 }} />
              <Bar dataKey="value" name="Средний балл" fill="hsl(152, 60%, 42%)" radius={[4, 4, 0, 0]} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-4">Стратегическая связка</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={alignmentLevels}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={75}
                paddingAngle={2}
              >
                {alignmentLevels.map((entry, i) => (
                  <Cell key={`cell-${i}`} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {alignmentLevels.map((s) => (
              <div key={s.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: s.fill }} />
                  <span className="text-muted-foreground">{s.name}</span>
                </div>
                <span className="font-semibold">{s.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-4">Типы целей</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={goalTypeDistribution}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={75}
                paddingAngle={2}
              >
                {goalTypeDistribution.map((entry, i) => (
                  <Cell key={`goal-cell-${i}`} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {goalTypeDistribution.map((s) => (
              <div key={s.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: s.fill }} />
                  <span className="text-muted-foreground">{s.name}</span>
                </div>
                <span className="font-semibold">{s.value}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold mb-4">Индекс зрелости по подразделениям</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th className="text-left py-2 pr-4 font-medium">Подразделение</th>
                  <th className="text-center py-2 px-3 font-medium">Индекс</th>
                  <th className="text-center py-2 px-3 font-medium">Ср. SMART</th>
                  <th className="text-center py-2 px-3 font-medium">Стратег. %</th>
                  <th className="text-center py-2 px-3 font-medium">Целей</th>
                </tr>
              </thead>
              <tbody>
                {departmentMaturity.map((d) => (
                  <tr
                    key={d.department}
                    onClick={() => setSelectedDept(d.department)}
                    className={`border-b border-border/50 transition-colors cursor-pointer ${
                      selectedDept === d.department ? "bg-primary/5" : "hover:bg-muted/30"
                    }`}
                  >
                    <td className="py-3 pr-4 font-medium">{d.department}</td>
                    <td className="text-center py-3 px-3">
                      <span className={`font-mono font-bold ${
                        d.maturityIndex >= 0.8 ? "text-success" : d.maturityIndex >= 0.6 ? "text-warning" : "text-destructive"
                      }`}>
                        {d.maturityIndex.toFixed(2)}
                      </span>
                    </td>
                    <td className="text-center py-3 px-3 font-mono">{d.avgSmart.toFixed(2)}</td>
                    <td className="text-center py-3 px-3">
                      <div className="inline-flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${d.strategicPercent}%` }} />
                        </div>
                        <span className="text-xs font-mono">{d.strategicPercent}%</span>
                      </div>
                    </td>
                    <td className="text-center py-3 px-3 font-mono">{d.totalGoals}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {drilldown && (
            <div className="mt-4 pt-4 border-t border-border/50">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold">Детали подразделения</h4>
                  <p className="text-xs text-muted-foreground">{selectedDept}</p>
                </div>
                <button
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  onClick={() => setSelectedDept(null)}
                >
                  <X className="w-3 h-3" /> Скрыть
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Слабые критерии</p>
                  <div className="flex flex-wrap gap-1">
                    {drilldown.weakCriteria.length === 0 && (
                      <Badge variant="outline" className="text-[10px]">Нет</Badge>
                    )}
                    {drilldown.weakCriteria.map((c) => (
                      <Badge key={c} variant="outline" className="text-[10px] bg-warning/10 text-warning">
                        ⚠ {c}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Проблемы</p>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {drilldown.topIssues.map((issue) => (
                      <li key={issue}>• {issue}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Рекомендации</p>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {drilldown.recommendations.map((rec) => (
                      <li key={rec}>• {rec}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-4">
                <p className="text-xs text-muted-foreground mb-2">Типы целей</p>
                <div className="flex flex-wrap gap-2">
                  {drilldown.goalTypeBreakdown.map((g) => (
                    <Badge key={g.type} variant="outline" className="text-[10px]" style={{ borderColor: g.color, color: g.color }}>
                      {g.type}: {g.count}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {analyticsHighlights.map((item) => (
          <div key={item.title} className="glass-card p-5">
            <Badge variant="outline" className="text-xs">Insight</Badge>
            <h3 className="text-sm font-semibold mt-2">{item.title}</h3>
            <p className="text-sm text-muted-foreground mt-2">{item.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
