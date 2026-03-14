import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { Search, FileText } from "lucide-react";

const DOC_TYPES = ["Все", "strategy", "policy", "kpi_framework", "vnd"] as const;
const TYPE_LABELS: Record<string, string> = {
  Все: "Все",
  strategy: "Стратегия",
  policy: "Политика",
  kpi_framework: "KPI-фреймворк",
  vnd: "ВНД",
};

export default function DocumentsPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("Все");
  const [activeId, setActiveId] = useState<string>("");
  const [semanticQuery, setSemanticQuery] = useState("");

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["documents", typeFilter],
    queryFn: () =>
      api.documents.list({ doc_type: typeFilter !== "Все" ? typeFilter : undefined }),
  });

  const {
    data: searchResults,
    isPending: searching,
    mutate: runSearch,
    reset: clearSearch,
  } = useMutation({
    mutationFn: (q: string) => api.documents.search(q, 5),
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return documents;
    const q = search.toLowerCase();
    return documents.filter(
      (doc) =>
        doc.title.toLowerCase().includes(q) ||
        (doc.keywords ?? []).join(" ").toLowerCase().includes(q),
    );
  }, [documents, search]);

  const effectiveActiveId = activeId || filtered[0]?.doc_id;
  const selected = filtered.find((doc) => doc.doc_id === effectiveActiveId) ?? filtered[0];

  const { data: docDetail } = useQuery({
    queryKey: ["doc-detail", selected?.doc_id],
    queryFn: () => api.documents.get(selected!.doc_id),
    enabled: !!selected?.doc_id,
  });

  const handleSemanticSearch = () => {
    if (semanticQuery.trim()) runSearch(semanticQuery.trim());
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Нормативная база</h1>
          <p className="text-sm text-muted-foreground mt-1">
            ВНД, стратегии и KPI-фреймворки для выравнивания целей
          </p>
        </div>
        <Button variant="outline">Загрузить документ</Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 max-w-xs">
          <Input
            placeholder="Поиск по названию и ключевым словам..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-muted/50 border-transparent"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-48 bg-muted/50 border-transparent">
            <SelectValue placeholder="Тип документа" />
          </SelectTrigger>
          <SelectContent>
            {DOC_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {TYPE_LABELS[type] ?? type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="outline" className="text-xs">
          {filtered.length} документов
        </Badge>
      </div>

      {/* Semantic search bar */}
      <div className="glass-card p-4 space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Семантический поиск по содержанию (RAG)
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="Например: KPI для разработчиков, стратегические приоритеты..."
            value={semanticQuery}
            onChange={(e) => setSemanticQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSemanticSearch()}
            className="bg-muted/50 border-transparent"
          />
          <Button
            onClick={handleSemanticSearch}
            disabled={!semanticQuery.trim() || searching}
            className="shrink-0"
          >
            <Search className="w-4 h-4 mr-1.5" />
            {searching ? "Поиск..." : "Найти"}
          </Button>
          {searchResults && (
            <Button variant="ghost" size="sm" onClick={clearSearch} className="shrink-0">
              Сбросить
            </Button>
          )}
        </div>

        {searchResults && (
          <div className="space-y-3 pt-1">
            <p className="text-xs font-medium">
              Результаты для: «{searchResults.query}» · {searchResults.results.length} фрагментов
            </p>
            {searchResults.results.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ничего не найдено</p>
            ) : (
              <div className="space-y-2">
                {searchResults.results.map((r, i) => (
                  <div
                    key={i}
                    className="border-l-2 border-primary/40 pl-3 text-sm space-y-1"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-xs">{r.doc_title ?? "—"}</span>
                      {r.doc_type && (
                        <Badge variant="outline" className="text-[10px]">
                          {TYPE_LABELS[r.doc_type] ?? r.doc_type}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto">
                        Релевантность: {(r.relevance * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-muted-foreground leading-relaxed line-clamp-3">
                      {r.text}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Document list + detail */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1.4fr] gap-4">
        <div className="space-y-3">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))
          ) : filtered.length === 0 ? (
            <div className="glass-card p-8 text-center text-sm text-muted-foreground">
              Документы не найдены
            </div>
          ) : (
            filtered.map((doc) => (
              <button
                key={doc.doc_id}
                onClick={() => setActiveId(doc.doc_id)}
                className={`glass-card p-4 text-left w-full transition-all hover:shadow-md ${
                  doc.doc_id === selected?.doc_id
                    ? "ring-2 ring-primary bg-primary/5"
                    : "hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className="text-xs">
                    {TYPE_LABELS[doc.doc_type] ?? doc.doc_type}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={
                      doc.is_active
                        ? "bg-success/10 text-success border-success/20"
                        : "bg-muted text-muted-foreground"
                    }
                  >
                    {doc.is_active ? "Активен" : "Архив"}
                  </Badge>
                </div>
                <h3 className="mt-2 text-sm font-semibold leading-snug">{doc.title}</h3>
                <p className="text-xs text-muted-foreground mt-1">Версия {doc.version}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {(doc.keywords ?? []).slice(0, 3).map((k) => (
                    <Badge key={k} variant="secondary" className="text-[10px]">
                      {k}
                    </Badge>
                  ))}
                </div>
              </button>
            ))
          )}
        </div>

        {selected ? (
          <div className="glass-card p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Badge variant="outline" className="text-xs">
                  {TYPE_LABELS[selected.doc_type] ?? selected.doc_type}
                </Badge>
                <h2 className="text-lg font-semibold mt-2 leading-tight">{selected.title}</h2>
                <p className="text-xs text-muted-foreground mt-1">Версия {selected.version}</p>
              </div>
              <Badge
                variant="outline"
                className={
                  selected.is_active
                    ? "bg-success/10 text-success border-success/20 shrink-0"
                    : "bg-muted text-muted-foreground shrink-0"
                }
              >
                {selected.is_active ? "Активен" : "Архив"}
              </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Период действия</p>
                <p className="font-medium">
                  {selected.valid_from ?? "—"} — {selected.valid_to ?? "—"}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Применимо к подразделениям</p>
                <div className="flex flex-wrap gap-1">
                  {(selected.department_scope ?? []).length > 0 ? (
                    (selected.department_scope ?? []).map((d) => (
                      <Badge key={d} variant="secondary" className="text-[10px]">
                        {d}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-muted-foreground text-xs">Все подразделения</span>
                  )}
                </div>
              </div>
              <div className="space-y-1 md:col-span-2">
                <p className="text-xs text-muted-foreground">Ключевые темы</p>
                <div className="flex flex-wrap gap-1">
                  {(selected.keywords ?? []).map((k) => (
                    <Badge key={k} variant="outline" className="text-[10px]">
                      {k}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            {docDetail?.content ? (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Содержание документа</h3>
                <div className="text-sm text-muted-foreground leading-relaxed max-h-64 overflow-y-auto whitespace-pre-wrap bg-muted/30 rounded-lg p-3">
                  {docDetail.content}
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Как влияет на цели</h3>
              <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-1">
                <li>Формирует фокус квартала и рекомендуемые KPI</li>
                <li>Используется при оценке релевантности и стратегической связки</li>
                <li>Поддерживает авто-цитирование при генерации целей</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="glass-card p-8 flex flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <FileText className="w-10 h-10 opacity-30" />
            <p className="text-sm">Выберите документ из списка</p>
          </div>
        )}
      </div>
    </div>
  );
}
