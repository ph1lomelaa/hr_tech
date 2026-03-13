import { Badge } from "@/components/ui/badge";
import { SmartScoreGroup } from "@/components/SmartScoreBar";
import { ArrowUpRight, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useRole } from "@/context/RoleContext";

interface GoalCardProps {
  goal: {
    id: string;
    employeeName: string;
    position: string;
    department: string;
    text: string;
    status: "draft" | "review" | "approved" | "rejected";
    smartIndex: number;
    smartScores: { key: string; label: string; value: number }[];
    linkType: "strategic" | "functional" | "operational";
    quarter: string;
    weight: number;
    goalType?: "activity" | "output" | "impact";
    source?: string;
  };
}

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: "Черновик", className: "bg-muted text-muted-foreground" },
  review: { label: "На согласовании", className: "bg-warning/10 text-warning border-warning/20" },
  approved: { label: "Утверждена", className: "bg-success/10 text-success border-success/20" },
  rejected: { label: "Отклонена", className: "bg-destructive/10 text-destructive border-destructive/20" },
};

const linkConfig: Record<string, { label: string; className: string }> = {
  strategic: { label: "Стратегическая", className: "bg-info/10 text-info" },
  functional: { label: "Функциональная", className: "bg-accent/10 text-accent" },
  operational: { label: "Операционная", className: "bg-muted text-muted-foreground" },
};

const goalTypeConfig: Record<string, { label: string; className: string }> = {
  activity: { label: "Activity", className: "bg-warning/10 text-warning" },
  output: { label: "Output", className: "bg-success/10 text-success" },
  impact: { label: "Impact", className: "bg-info/10 text-info" },
};

export default function GoalCard({ goal }: GoalCardProps) {
  const { role } = useRole();
  const status = statusConfig[goal.status];
  const link = linkConfig[goal.linkType];
  const type = goal.goalType ? goalTypeConfig[goal.goalType] : null;
  const detailPath =
    role === "employee" ? `/employee/goals/${goal.id}` :
    role === "manager" ? `/manager/team-goals/${goal.id}` :
    `/hr/goals/${goal.id}`;

  return (
    <div className="glass-card p-5 hover:shadow-lg transition-all duration-300 animate-fade-in group">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-3">
          {/* Header */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={status.className}>
              {status.label}
            </Badge>
            <Badge variant="outline" className={link.className}>
              {link.label}
            </Badge>
            {type && (
              <Badge variant="outline" className={type.className}>
                {type.label}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">{goal.quarter} · Вес: {goal.weight}%</span>
          </div>

          {/* Employee info */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-xs font-bold text-primary">
                {goal.employeeName.split(" ").map(n => n[0]).join("")}
              </span>
            </div>
            <div>
              <p className="text-sm font-medium">{goal.employeeName}</p>
              <p className="text-xs text-muted-foreground">{goal.position} · {goal.department}</p>
            </div>
          </div>

          {/* Goal text */}
          <p className="text-sm leading-relaxed">{goal.text}</p>

          {goal.source && (
            <div className="text-xs text-muted-foreground">
              Источник: <span className="font-medium text-foreground/80">{goal.source}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" asChild>
              <Link to={detailPath}>
                <ArrowUpRight className="w-3 h-3" /> Подробнее
              </Link>
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
              <MessageSquare className="w-3 h-3" /> Комментарий
            </Button>
          </div>
        </div>

        {/* SMART Score */}
        <div className="w-44 shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">SMART Индекс</span>
            <span className={`text-lg font-bold font-mono ${
              goal.smartIndex >= 0.7 ? "text-success" : goal.smartIndex >= 0.4 ? "text-warning" : "text-destructive"
            }`}>
              {goal.smartIndex.toFixed(2)}
            </span>
          </div>
          <SmartScoreGroup scores={goal.smartScores} />
        </div>
      </div>
    </div>
  );
}
