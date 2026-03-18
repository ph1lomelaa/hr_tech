import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { api } from "@/lib/api";
import DocSplitPanel from "@/components/DocSplitPanel";

export default function DocumentsPage() {
  const [activeId, setActiveId] = useState("");
  const [semanticQuery, setSemanticQuery] = useState("");

  const { data: documents = [], isLoading, isError } = useQuery({
    queryKey: ["documents"],
    queryFn: () => api.documents.list({}),
  });

  const { data: docDetail } = useQuery({
    queryKey: ["doc-detail", activeId],
    queryFn: () => api.documents.get(activeId),
    enabled: !!activeId,
  });

  const {
    data: searchResults,
    isPending: searching,
    mutate: runSearch,
    reset: clearSearch,
  } = useMutation({
    mutationFn: (q: string) => api.documents.search(q, 5),
  });

  const handleSemanticSearch = () => {
    if (semanticQuery.trim()) runSearch(semanticQuery.trim());
  };

  const semanticBlock = (
    <div className="glass-card-elevated p-4 space-y-3">
      <p className="text-sm font-semibold">Семантический поиск по содержанию (RAG)</p>
      <div className="flex gap-2">
        <Input
          placeholder="Например: KPI для разработчиков, стратегические приоритеты…"
          value={semanticQuery}
          onChange={(e) => setSemanticQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSemanticSearch()}
          className="control-surface"
        />
        <Button
          onClick={handleSemanticSearch}
          disabled={!semanticQuery.trim() || searching}
          className="shrink-0"
        >
          <Search className="w-4 h-4 mr-1.5" />
          {searching ? "Поиск…" : "Найти"}
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
                <div key={i} className="border-l-2 border-primary/40 pl-3 text-sm space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-xs">{r.doc_title ?? "—"}</span>
                    {r.doc_type && (
                      <Badge variant="outline" className="text-[10px]">
                        {r.doc_type}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">
                      Релевантность: {(r.relevance * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-muted-foreground leading-relaxed line-clamp-3">{r.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <DocSplitPanel
      documents={documents}
      isLoading={isLoading}
      isError={isError}
      activeId={activeId}
      onDocSelect={setActiveId}
      docDetail={docDetail}
      pageTitle="Нормативная база"
      pageSubtitle="ВНД, стратегии и KPI-фреймворки для выравнивания целей"
      headerActions={<Button variant="outline">Загрузить документ</Button>}
      extraAbove={semanticBlock}
    />
  );
}
