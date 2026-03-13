import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { myFeedback, myGoals } from "@/data/mockEmployee";
import { CheckCircle, MessageSquare, Wand2 } from "lucide-react";

const verdictConfig: Record<string, { className: string }> = {
  "Нужна доработка": { className: "bg-destructive/10 text-destructive" },
  "Одобрено": { className: "bg-success/10 text-success" },
  "Комментарий": { className: "bg-info/10 text-info" },
};

export default function EmployeeFeedbackPage() {
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [replySent, setReplySent] = useState<Record<string, boolean>>({});
  const [rewriteMode, setRewriteMode] = useState<Record<string, boolean>>({});
  const [rewriteText, setRewriteText] = useState<Record<string, string>>({});
  const [rewriteSent, setRewriteSent] = useState<Record<string, boolean>>({});

  const goalTextMap = Object.fromEntries(myGoals.map((g) => [g.id, g.text]));

  const sendReply = (id: string) => {
    if (!replies[id]?.trim()) return;
    setReplySent((prev) => ({ ...prev, [id]: true }));
  };

  const sendRewrite = (id: string) => {
    if (!rewriteText[id]?.trim()) return;
    setRewriteSent((prev) => ({ ...prev, [id]: true }));
    setRewriteMode((prev) => ({ ...prev, [id]: false }));
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Обратная связь</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Комментарии руководителя и запросы на доработку целей
        </p>
      </div>

      {myFeedback.length === 0 && (
        <div className="glass-card p-10 text-center text-muted-foreground text-sm">
          Нет комментариев по вашим целям
        </div>
      )}

      <div className="space-y-4">
        {myFeedback.map((item) => {
          const goalText = goalTextMap[item.goalId];
          const verdictStyle = verdictConfig[item.verdict] ?? verdictConfig["Комментарий"];

          return (
            <div key={item.id} className="glass-card p-5 space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={`text-xs ${verdictStyle.className}`}>
                      {item.verdict}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{item.date}</span>
                  </div>
                  {/* Goal text (not raw ID) */}
                  {goalText ? (
                    <p className="text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2 mt-2 italic">
                      «{goalText}»
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Цель: {item.goalId}</p>
                  )}
                </div>
              </div>

              {/* Reviewer comment */}
              <div className="border-l-2 border-primary/30 pl-3">
                <p className="text-xs text-muted-foreground mb-1">
                  <span className="font-medium text-foreground/70">{item.reviewer}</span> пишет:
                </p>
                <p className="text-sm text-muted-foreground">{item.comment}</p>
              </div>

              {/* Rewrite result */}
              {rewriteSent[item.id] && (
                <div className="bg-success/5 border border-success/20 rounded-lg p-3 text-xs text-success flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  Переформулировка отправлена на повторное согласование
                </div>
              )}

              {/* Reply sent */}
              {replySent[item.id] && (
                <div className="bg-success/5 border border-success/20 rounded-lg p-3 text-xs text-success flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  Ответ отправлен руководителю
                </div>
              )}

              {/* Rewrite form */}
              {rewriteMode[item.id] && !rewriteSent[item.id] && (
                <div className="space-y-2 animate-fade-in">
                  <label className="text-xs font-medium text-muted-foreground">
                    Новая формулировка цели:
                  </label>
                  <Textarea
                    rows={2}
                    placeholder="Введите переформулированную цель..."
                    defaultValue={goalText ?? ""}
                    value={rewriteText[item.id] ?? goalText ?? ""}
                    onChange={(e) => setRewriteText((prev) => ({ ...prev, [item.id]: e.target.value }))}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => sendRewrite(item.id)}
                      disabled={!rewriteText[item.id]?.trim()}
                    >
                      Отправить на согласование
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setRewriteMode((prev) => ({ ...prev, [item.id]: false }))}
                    >
                      Отмена
                    </Button>
                  </div>
                </div>
              )}

              {/* Reply form */}
              {!replySent[item.id] && !rewriteMode[item.id] && !rewriteSent[item.id] && (
                <div className="space-y-2">
                  <Textarea
                    rows={2}
                    placeholder="Ваш ответ руководителю..."
                    value={replies[item.id] ?? ""}
                    onChange={(e) => setReplies((prev) => ({ ...prev, [item.id]: e.target.value }))}
                  />
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      size="sm"
                      className="gap-1"
                      onClick={() => sendReply(item.id)}
                      disabled={!replies[item.id]?.trim()}
                    >
                      <MessageSquare className="w-3 h-3" /> Ответить
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() => {
                        setRewriteText((prev) => ({ ...prev, [item.id]: goalText ?? "" }));
                        setRewriteMode((prev) => ({ ...prev, [item.id]: true }));
                      }}
                    >
                      <Wand2 className="w-3 h-3" /> Переформулировать
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
