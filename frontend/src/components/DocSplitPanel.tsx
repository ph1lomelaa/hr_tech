import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Search } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── types ───────────────────────────────────────────────────────────────── */
export interface DocListItem {
  doc_id: string;
  title: string;
  doc_type: string;
  version: string;
  valid_from?: string | null;
  valid_to?: string | null;
  keywords?: string[];
  is_active?: boolean;
  approval_status?: string;
  department_scope?: string[];
}

export interface DocDetail extends DocListItem {
  content?: string | null;
}

interface DocSplitPanelProps {
  documents: DocListItem[];
  isLoading: boolean;
  isError?: boolean;
  activeId: string;
  onDocSelect: (id: string) => void;
  docDetail: DocDetail | undefined | null;
  /** Extra content rendered below the preview body (e.g. approval actions) */
  extraPreview?: React.ReactNode;
  /** Extra content rendered above the split grid (e.g. semantic search) */
  extraAbove?: React.ReactNode;
  /** Extra actions in the page header row */
  headerActions?: React.ReactNode;
  pageTitle: string;
  pageSubtitle: string;
}

/* ─── approval label map (shared) ─────────────────────────────────────────── */
export const APPROVAL_LABELS: Record<string, string> = {
  pending: "На согласовании",
  manager_approved: "Согласовано менеджером",
  manager_rejected: "Отклонено менеджером",
  approved: "Утверждено HR",
  rejected: "Отклонено HR",
};

const PANEL_HEIGHT = "calc(100vh - 260px)";
const PANEL_MIN_H = "400px";

/* ─── Highlight helper ────────────────────────────────────────────────────── */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-warning/35 text-foreground rounded-[2px] px-[1px]">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

/* ─── Component ───────────────────────────────────────────────────────────── */
export default function DocSplitPanel({
  documents,
  isLoading,
  isError,
  activeId,
  onDocSelect,
  docDetail,
  extraPreview,
  extraAbove,
  headerActions,
  pageTitle,
  pageSubtitle,
}: DocSplitPanelProps) {
  const [search, setSearch] = useState("");

  /* Client-side filtering */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return documents.filter(
      (doc) =>
        !q ||
        doc.title.toLowerCase().includes(q) ||
        (doc.keywords ?? []).join(" ").toLowerCase().includes(q),
    );
  }, [documents, search]);

  /* Auto-select first result when active doc is filtered out */
  useEffect(() => {
    if (filtered.length === 0) return;
    const stillVisible = filtered.some((d) => d.doc_id === activeId);
    if (!stillVisible) onDocSelect(filtered[0].doc_id);
  }, [filtered, activeId, onDocSelect]);

  const selected = filtered.find((d) => d.doc_id === activeId) ?? filtered[0] ?? null;

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{pageTitle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{pageSubtitle}</p>
        </div>
        {headerActions}
      </div>

      {/* Search */}
      <div className="glass-card-elevated p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Поиск по названию и ключевым словам…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="control-surface pl-10"
          />
        </div>
      </div>

      {/* Optional extra block (e.g. semantic search for HR) */}
      {extraAbove}

      {/* Split grid — both panels independently scrollable */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-3 items-start">

        {/* ── Left panel: document list ── */}
        <div
          className="overflow-y-auto pr-1 space-y-2"
          style={{ maxHeight: PANEL_HEIGHT, minHeight: PANEL_MIN_H }}
        >
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))
          ) : isError ? (
            <div className="glass-card-elevated state-panel p-8 text-center text-sm text-muted-foreground">
              Не удалось загрузить документы. Проверьте подключение к API.
            </div>
          ) : filtered.length === 0 ? (
            <div className="glass-card-elevated state-panel p-8 text-center text-sm text-muted-foreground">
              Документы не найдены
            </div>
          ) : (
            filtered.map((doc) => {
              const isActive = doc.doc_id === selected?.doc_id;
              return (
                <button
                  key={doc.doc_id}
                  type="button"
                  onClick={() => onDocSelect(doc.doc_id)}
                  className={cn(
                    "relative w-full text-left rounded-xl border p-4 transition-all overflow-hidden",
                    isActive
                      ? "border-[#1D9E75]/60 bg-[#E1F5EE]/60 dark:bg-[#1D9E75]/10 dark:border-[#1D9E75]/50 shadow-sm"
                      : "border-border/70 bg-card/80 hover:border-primary/35 hover:bg-muted/30",
                  )}
                >
                  {/* Left accent bar */}
                  {isActive && (
                    <span className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl bg-[#1D9E75]" />
                  )}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{doc.doc_type}</Badge>
                      {doc.approval_status && (
                        <Badge variant="outline" className="text-[10px]">
                          {APPROVAL_LABELS[doc.approval_status] ?? doc.approval_status}
                        </Badge>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className={doc.is_active
                        ? "bg-success/10 text-success border-success/20"
                        : "bg-muted text-muted-foreground"}
                    >
                      {doc.is_active ? "Активен" : "Архив"}
                    </Badge>
                  </div>
                  <h3 className="mt-2 text-sm font-semibold leading-snug">
                    <Highlight text={doc.title} query={search} />
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Версия {doc.version}
                    {(doc.valid_from || doc.valid_to) && ` · ${doc.valid_from ?? "—"} — ${doc.valid_to ?? "—"}`}
                  </p>
                </button>
              );
            })
          )}
        </div>

        {/* ── Right panel: document preview ── */}
        <div
          className="overflow-y-auto"
          style={{ maxHeight: PANEL_HEIGHT, minHeight: PANEL_MIN_H }}
        >
          {selected && docDetail ? (
            <div className="glass-card-elevated p-6 space-y-5">
              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="outline" className="text-xs">{docDetail.doc_type}</Badge>
                    {docDetail.approval_status && (
                      <Badge variant="outline" className="text-[10px]">
                        {APPROVAL_LABELS[docDetail.approval_status] ?? docDetail.approval_status}
                      </Badge>
                    )}
                  </div>
                  <h2 className="mt-2 text-lg font-semibold leading-tight">
                    <Highlight text={docDetail.title} query={search} />
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">Версия {docDetail.version}</p>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "shrink-0",
                    docDetail.is_active
                      ? "bg-success/10 text-success border-success/20"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {docDetail.is_active ? "Активен" : "Архив"}
                </Badge>
              </div>

              {/* Meta grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Период действия</p>
                  <p className="font-medium">{docDetail.valid_from ?? "—"} — {docDetail.valid_to ?? "—"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Подразделения</p>
                  <div className="flex flex-wrap gap-1">
                    {(docDetail.department_scope ?? []).length > 0 ? (
                      (docDetail.department_scope ?? []).map((d) => (
                        <Badge key={d} variant="secondary" className="text-[10px]">{d}</Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">Все подразделения</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Content body */}
              {docDetail.content && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Содержание</p>
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-4 text-sm text-foreground/85 leading-relaxed whitespace-pre-wrap">
                    <Highlight text={docDetail.content} query={search} />
                  </div>
                </div>
              )}

              {/* How it affects goals */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Как влияет на цели</p>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  {[
                    "Формирует фокус квартала и рекомендуемые KPI",
                    "Используется при оценке релевантности и стратегической связки",
                    "Поддерживает авто-цитирование при генерации целей",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1D9E75]" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Role-specific extra (e.g. approval buttons) */}
              {extraPreview}
            </div>
          ) : (
            <div
              className="glass-card-elevated state-panel flex flex-col items-center justify-center gap-3 text-center text-muted-foreground"
              style={{ minHeight: PANEL_MIN_H }}
            >
              <FileText className="h-10 w-10 opacity-25" />
              <p className="text-sm">Выберите документ из списка</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
