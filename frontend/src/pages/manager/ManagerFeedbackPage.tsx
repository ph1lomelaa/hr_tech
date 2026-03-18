import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, CheckCircle2, AlertTriangle, XCircle, Info, ChevronDown, ChevronUp } from "lucide-react";
import { api, type AlertItem } from "@/lib/api";
import { useCurrentEmployee } from "@/hooks/use-current-employee";
import { getCurrentQuarterYear } from "@/lib/date";
import { Link } from "react-router-dom";

const SEVERITY_CFG = {
  critical: { icon: XCircle,       cls: "text-destructive bg-destructive/5 border-destructive/20" },
  warning:  { icon: AlertTriangle, cls: "text-warning  bg-warning/5  border-warning/20"  },
};

const ALERT_LABELS: Record<string, string> = {
  low_smart:          "Низкий SMART-индекс",
  alignment_gap:      "Нет стратегической связки",
  too_few_goals:      "Мало целей",
  too_many_goals:     "Много целей",
  weight_mismatch:    "Сумма весов ≠ 100%",
  duplicate:          "Возможное дублирование",
  duplicate_goal:     "Возможное дублирование",
  achievability_risk: "Риск недостижимости",
  goal_rejected:      "Цель отклонена",
};

const ALERTS_PREVIEW = 3;

export default function ManagerFeedbackPage() {
  const qc = useQueryClient();
  const { employeeId } = useCurrentEmployee();
  const { quarter, year } = getCurrentQuarterYear();
  const [alertsExpanded, setAlertsExpanded] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);

  const { data: alerts = [], isLoading: alertsLoading } = useQuery({
    queryKey: ["employee-alerts", employeeId],
    queryFn: () => api.employees.alerts(employeeId!),
    enabled: !!employeeId,
    staleTime: 30_000,
  });

  const { data: goals = [], isLoading: goalsLoading } = useQuery({
    queryKey: ["employee-goals", employeeId, quarter, year],
    queryFn: () => api.employees.goals(employeeId!, { quarter, year }),
    enabled: !!employeeId,
    staleTime: 30_000,
  });

  const unread = alerts.filter((a) => !a.is_read);

  async function markAllRead() {
    if (!employeeId || unread.length === 0 || markingRead) return;
    setMarkingRead(true);
    try {
      await Promise.all(unread.map((a) => api.employees.markAlertRead(employeeId, a.id)));
      qc.invalidateQueries({ queryKey: ["employee-alerts", employeeId] });
      qc.invalidateQueries({ queryKey: ["alerts"] });
    } finally {
      setMarkingRead(false);
    }
  }

  function handleExpand() {
    setAlertsExpanded(true);
    markAllRead();
  }

  const rejectedGoals = goals.filter((g) => g.status === "rejected");
  const isLoading = alertsLoading || goalsLoading;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Обратная связь</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Уведомления AI-системы по вашей команде и вашим целям
        </p>
      </div>

      {!isLoading && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Всего уведомлений",  value: alerts.length },
            { label: "Непрочитанных",      value: unread.length,       highlight: unread.length > 0 },
            { label: "Отклонённых целей",  value: rejectedGoals.length, highlight: rejectedGoals.length > 0 },
          ].map((s) => (
            <div key={s.label} className="glass-card-elevated p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`text-2xl font-bold mt-1 ${s.highlight ? "text-warning" : ""}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {(isLoading || rejectedGoals.length > 0) && (
        <div className="glass-card-elevated p-5 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <XCircle className="w-4 h-4 text-destructive" /> Отклонённые цели
          </h3>
          {goalsLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <div className="space-y-2">
              {rejectedGoals.map((g) => (
                <Link
                  key={g.id}
                  to="/manager/my-goals"
                  className="block rounded-lg border border-destructive/20 bg-destructive/5 p-3 hover:bg-destructive/10 transition-colors"
                >
                  <p className="text-sm font-medium text-destructive line-clamp-2">
                    {g.goal_text ?? g.title}
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">{g.quarter} {g.year}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="glass-card-elevated p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" /> Уведомления AI-системы
            {alerts.length > 0 && <span className="text-xs font-normal text-muted-foreground">({alerts.length})</span>}
          </h3>
          <div className="flex items-center gap-2">
            {unread.length > 0 && (
              <button
                onClick={markAllRead}
                disabled={markingRead}
                className="text-[10px] text-primary underline disabled:opacity-50"
              >
                Прочитать все
              </button>
            )}
            {alerts.length > ALERTS_PREVIEW && (
              <button
                onClick={alertsExpanded ? () => setAlertsExpanded(false) : handleExpand}
                className="text-xs text-primary flex items-center gap-1 hover:underline"
              >
                {alertsExpanded
                  ? <><ChevronUp className="w-3 h-3" /> Свернуть</>
                  : <><ChevronDown className="w-3 h-3" /> Ещё {alerts.length - ALERTS_PREVIEW}</>}
              </button>
            )}
          </div>
        </div>

        {alertsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : alerts.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <CheckCircle2 className="w-4 h-4 text-success" />
            Уведомлений нет — набор целей в порядке
          </div>
        ) : (
          <div className="space-y-2">
            {(alertsExpanded ? alerts : alerts.slice(0, ALERTS_PREVIEW)).map((alert: AlertItem) => {
              const cfg = SEVERITY_CFG[alert.severity] ?? SEVERITY_CFG.warning;
              const Icon = cfg.icon;
              return (
                <div
                  key={alert.id}
                  className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${cfg.cls} ${
                    !alert.is_read ? "ring-1 ring-primary/20" : "opacity-70"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold">
                        {ALERT_LABELS[alert.alert_type] ?? alert.alert_type}
                      </span>
                      {!alert.is_read && (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20">
                          Новое
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs mt-0.5">{alert.message}</p>
                    {alert.created_at && (
                      <p className="text-[10px] text-muted-foreground/60 mt-1">
                        {new Date(alert.created_at).toLocaleDateString("ru-RU", {
                          day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                        })}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <span>Уведомления генерирует AI-система при обнаружении проблем в целях команды: низкий SMART-индекс, отсутствие стратегической связки, неверная сумма весов и возможные дублирования.</span>
      </div>
    </div>
  );
}
