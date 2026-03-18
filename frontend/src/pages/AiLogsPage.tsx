import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { api, type AiLogItem } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const PRESET_EVENTS = [
  "llm.request",
  "llm.response",
  "llm.error",
  "rag.query",
  "rag.results",
  "generate.request",
  "generate.response",
];

function formatTs(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function EventCard({ item }: { item: AiLogItem }) {
  return (
    <div className="glass-card-elevated p-4 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-primary">{item.event}</span>
        <span className="text-xs text-muted-foreground">{formatTs(item.ts)}</span>
      </div>
      <pre className="text-xs whitespace-pre-wrap break-words rounded bg-muted/40 p-3 text-muted-foreground">
        {JSON.stringify(item.payload, null, 2)}
      </pre>
    </div>
  );
}

export default function AiLogsPage() {
  const [limit, setLimit] = useState(80);
  const [eventFilter, setEventFilter] = useState("");
  const [paused, setPaused] = useState(false);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["ai-logs", limit, eventFilter],
    queryFn: () => api.ai.logs({ limit, event: eventFilter || undefined }),
    refetchInterval: paused ? false : 3000,
    staleTime: 1_000,
  });

  const items = useMemo(() => (data?.items ?? []).slice().reverse(), [data]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI Логи</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Входящие данные в AI, RAG-контекст и ответы моделей в реальном времени
        </p>
      </div>

      <div className="glass-card-elevated p-4 grid grid-cols-1 md:grid-cols-[220px_1fr_auto_auto] gap-3 items-end">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Лимит</label>
          <Input
            type="number"
            min={10}
            max={1000}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value) || 80)}
            className="control-surface"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Фильтр события</label>
          <Input
            list="ai-events"
            placeholder="например: llm.response"
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
            className="control-surface"
          />
          <datalist id="ai-events">
            {PRESET_EVENTS.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        </div>
        <Button
          variant={paused ? "outline" : "default"}
          onClick={() => setPaused((v) => !v)}
        >
          {paused ? "Возобновить" : "Пауза"}
        </Button>
        <Button variant="outline" className="gap-2" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          Обновить
        </Button>
      </div>

      <div className="text-xs text-muted-foreground">
        Показано событий: {items.length}
      </div>

      <div className="space-y-3">
        {isLoading && (
          <>
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </>
        )}
        {!isLoading && isError && (
          <div className="glass-card-elevated state-panel p-6 text-sm text-muted-foreground">
            Не удалось загрузить AI-логи. Проверьте, что backend запущен и endpoint `/api/v1/ai/logs` доступен.
          </div>
        )}
        {!isLoading && !isError && items.length === 0 && (
          <div className="glass-card-elevated state-panel p-6 text-sm text-muted-foreground">
            Логи пока пустые. Запусти генерацию/оценку цели, чтобы увидеть события.
          </div>
        )}
        {items.map((item, idx) => (
          <EventCard key={`${item.ts}-${item.event}-${idx}`} item={item} />
        ))}
      </div>
    </div>
  );
}
