import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SmartScoreGroup } from "@/components/SmartScoreBar";
import { teamGoals as initialTeamGoals } from "@/data/mockManager";
import { CheckCircle2, XCircle, Search, MessageSquare } from "lucide-react";

type Goal = typeof initialTeamGoals[0] & { reviewComment?: string };

const statusColors: Record<string, string> = {
  approved: "bg-success/10 text-success",
  review: "bg-warning/10 text-warning",
  draft: "bg-muted text-muted-foreground",
  rejected: "bg-destructive/10 text-destructive",
};
const statusLabels: Record<string, string> = {
  approved: "Утверждена",
  review: "На согласовании",
  draft: "Черновик",
  rejected: "Отклонена",
};

export default function ManagerTeamGoalsPage() {
  const { goalId } = useParams();
  const [goals, setGoals] = useState<Goal[]>(initialTeamGoals);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(
    goalId ? (initialTeamGoals.find((g) => g.id === goalId) ?? null) : null
  );
  const [comment, setComment] = useState("");
  const [rejectMode, setRejectMode] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const filtered = goals.filter((g) => {
    const matchSearch = g.employeeName.toLowerCase().includes(search.toLowerCase()) ||
      g.text.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || g.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const openGoal = (g: Goal) => {
    setSelectedGoal(g);
    setComment("");
    setRejectMode(false);
    setActionMessage(null);
  };

  const handleApprove = () => {
    if (!selectedGoal) return;
    const updated = goals.map((g) =>
      g.id === selectedGoal.id ? { ...g, status: "approved" as const, reviewComment: comment || undefined } : g
    );
    setGoals(updated);
    setSelectedGoal({ ...selectedGoal, status: "approved" as const });
    setActionMessage("Цель утверждена.");
    setComment("");
    setRejectMode(false);
  };

  const handleReject = () => {
    if (!selectedGoal) return;
    if (!comment.trim()) {
      setActionMessage("Укажите причину отклонения.");
      return;
    }
    const updated = goals.map((g) =>
      g.id === selectedGoal.id ? { ...g, status: "rejected" as const, reviewComment: comment } : g
    );
    setGoals(updated);
    setSelectedGoal({ ...selectedGoal, status: "rejected" as const, reviewComment: comment });
    setActionMessage("Цель отклонена. Комментарий отправлен сотруднику.");
    setComment("");
    setRejectMode(false);
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Цели команды</h1>
        <p className="text-sm text-muted-foreground mt-1">Отдел продаж · Q1 2026</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-4">
        {/* Left: Goal list */}
        <div className="space-y-3">
          {/* Filters */}
          <div className="glass-card p-3 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Поиск по сотруднику или цели..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {["all", "review", "approved", "draft", "rejected"].map((s) => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                    filterStatus === s ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {s === "all" ? "Все" : statusLabels[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Goal cards */}
          <div className="space-y-2">
            {filtered.map((goal) => (
              <button
                key={goal.id}
                onClick={() => openGoal(goal)}
                className={`w-full text-left glass-card p-3 transition-all hover:border-primary/50 ${
                  selectedGoal?.id === goal.id ? "border-primary/60" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">{goal.employeeName}</p>
                    <p className="text-sm mt-1 line-clamp-2">{goal.text}</p>
                  </div>
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${statusColors[goal.status]}`}>
                    {statusLabels[goal.status]}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  <span className={`font-mono ${goal.smartIndex < 0.6 ? "text-destructive" : "text-success"}`}>
                    SMART {goal.smartIndex.toFixed(2)}
                  </span>
                  <span>Вес {goal.weight}%</span>
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">Нет целей</p>
            )}
          </div>
        </div>

        {/* Right: Goal detail + approve/reject */}
        {selectedGoal ? (
          <div className="space-y-4">
            <div className="glass-card p-5 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">{selectedGoal.employeeName} · {selectedGoal.position}</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Badge variant="outline" className={`text-[10px] ${statusColors[selectedGoal.status]}`}>
                      {statusLabels[selectedGoal.status]}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">{selectedGoal.quarter}</Badge>
                    <Badge variant="outline" className="text-[10px]">{selectedGoal.goalType}</Badge>
                  </div>
                </div>
                <span className={`font-mono text-lg font-bold ${selectedGoal.smartIndex < 0.6 ? "text-destructive" : "text-success"}`}>
                  {selectedGoal.smartIndex.toFixed(2)}
                </span>
              </div>

              <p className="text-sm leading-relaxed">{selectedGoal.text}</p>

              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Дедлайн</p>
                  <p className="font-medium">{selectedGoal.deadline}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Вес</p>
                  <p className="font-medium">{selectedGoal.weight}%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Источник</p>
                  <p className="font-medium text-xs">{selectedGoal.source}</p>
                </div>
              </div>

              <SmartScoreGroup scores={selectedGoal.smartScores} />

              {selectedGoal.reviewComment && (
                <div className="bg-muted/40 rounded-lg p-3 text-xs text-muted-foreground">
                  <MessageSquare className="w-3 h-3 inline mr-1" />
                  Комментарий: {selectedGoal.reviewComment}
                </div>
              )}
            </div>

            {/* Approve / Reject actions */}
            {selectedGoal.status === "review" && (
              <div className="glass-card p-5 space-y-3">
                <h3 className="text-sm font-semibold">Решение по цели</h3>
                {selectedGoal.smartIndex < 0.6 && (
                  <div className="bg-destructive/10 text-destructive text-xs rounded-lg p-2">
                    Низкий SMART-индекс ({selectedGoal.smartIndex.toFixed(2)}). Рекомендуется отправить на доработку.
                  </div>
                )}
                {!rejectMode ? (
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Комментарий (необязательно)"
                      rows={2}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button className="gap-2 flex-1" onClick={handleApprove}>
                        <CheckCircle2 className="w-4 h-4" /> Утвердить
                      </Button>
                      <Button variant="destructive" className="gap-2 flex-1" onClick={() => setRejectMode(true)}>
                        <XCircle className="w-4 h-4" /> Отклонить
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Укажите причину отклонения и что нужно доработать..."
                      rows={3}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button variant="destructive" className="gap-2 flex-1" onClick={handleReject}>
                        <XCircle className="w-4 h-4" /> Подтвердить отклонение
                      </Button>
                      <Button variant="ghost" onClick={() => setRejectMode(false)}>Отмена</Button>
                    </div>
                  </div>
                )}
                {actionMessage && (
                  <p className="text-xs text-muted-foreground">{actionMessage}</p>
                )}
              </div>
            )}

            {(selectedGoal.status === "approved" || selectedGoal.status === "rejected") && (
              <div className={`glass-card p-4 text-sm ${selectedGoal.status === "approved" ? "border-success/30" : "border-destructive/30"}`}>
                <p className={selectedGoal.status === "approved" ? "text-success" : "text-destructive"}>
                  {selectedGoal.status === "approved" ? "✓ Цель утверждена" : "✗ Цель отклонена"}
                </p>
                {actionMessage && <p className="text-xs text-muted-foreground mt-1">{actionMessage}</p>}
              </div>
            )}
          </div>
        ) : (
          <div className="glass-card p-10 flex items-center justify-center text-sm text-muted-foreground">
            Выберите цель из списка слева
          </div>
        )}
      </div>
    </div>
  );
}
