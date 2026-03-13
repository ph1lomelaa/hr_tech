import { Target, Users, AlertTriangle, FileCheck } from "lucide-react";
import StatCard from "@/components/StatCard";
import GoalCard from "@/components/GoalCard";
import { mockGoals, departmentMaturity, monthlyGoalTrend, goalsByStatus, smartDistribution } from "@/data/mockData";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { hrAlerts } from "@/data/mockAlerts";

export default function DashboardPage() {
  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Дашборд</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Обзор системы управления целями · Q1 2026
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Target} title="Всего целей" value="278" change="+12%" changeType="positive" description="vs Q4" />
        <StatCard icon={FileCheck} title="Средний SMART" value="0.74" change="+0.09" changeType="positive" description="vs Q4" />
        <StatCard icon={Users} title="Сотрудников" value="450" change="8 подразделений" />
        <StatCard icon={AlertTriangle} title="Требуют доработки" value="43" change="-18%" changeType="positive" description="vs Q4" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Trend */}
        <div className="glass-card p-5 lg:col-span-2 animate-fade-in">
          <h3 className="text-sm font-semibold mb-4">Динамика целей</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthlyGoalTrend} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 90%)" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(220,13%,90%)", fontSize: 12 }} />
              <Bar dataKey="created" name="Создано" fill="hsl(220, 15%, 82%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="approved" name="Утверждено" fill="hsl(152, 60%, 42%)" radius={[4, 4, 0, 0]} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Status pie */}
        <div className="glass-card p-5 animate-fade-in">
          <h3 className="text-sm font-semibold mb-4">По статусу</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={goalsByStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3}>
                {goalsByStatus.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {goalsByStatus.map((s) => (
              <div key={s.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: s.fill }} />
                  <span className="text-muted-foreground">{s.name}</span>
                </div>
                <span className="font-semibold">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SMART + Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass-card p-5 lg:col-span-2 animate-fade-in">
          <h3 className="text-sm font-semibold mb-4">SMART-профиль компании</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={smartDistribution} barGap={8}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 90%)" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" domain={[0, 1]} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(220,13%,90%)", fontSize: 12 }} />
              <Bar dataKey="value" name="Средний балл" fill="hsl(152, 60%, 42%)" radius={[4, 4, 0, 0]} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="glass-card p-5 animate-fade-in">
          <h3 className="text-sm font-semibold mb-4">Критичные алерты</h3>
          <div className="space-y-3">
            {hrAlerts.slice(0, 3).map((alert) => (
              <div key={alert.id} className="border-b border-border/40 pb-2">
                <div className="flex items-center justify-between">
                  <Badge
                    variant="outline"
                    className={
                      alert.severity === "high"
                        ? "bg-destructive/10 text-destructive"
                        : alert.severity === "medium"
                        ? "bg-warning/10 text-warning"
                        : "bg-muted text-muted-foreground"
                    }
                  >
                    {alert.severity === "high" ? "Критично" : alert.severity === "medium" ? "Важно" : "Инфо"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{alert.employeeName ?? "Команда"}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">{alert.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Maturity table */}
      <div className="glass-card p-5 animate-fade-in">
        <h3 className="text-sm font-semibold mb-4">Индекс зрелости целеполагания по подразделениям</h3>
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
                <tr key={d.department} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
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
      </div>

      {/* Recent goals */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Последние цели</h3>
        <div className="space-y-3">
          {mockGoals.slice(0, 3).map((goal) => (
            <GoalCard key={goal.id} goal={goal} />
          ))}
        </div>
      </div>
    </div>
  );
}
