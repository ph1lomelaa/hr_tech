import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { mockDocuments } from "@/data/mockDocuments";

const typeOptions = ["Все", "ВНД", "Стратегия", "KPI-фреймворк", "Политика"] as const;

export default function DocumentsPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("Все");
  const [activeId, setActiveId] = useState(mockDocuments[0]?.id ?? "");

  const filtered = useMemo(() => {
    return mockDocuments.filter((doc) => {
      const matchesType = typeFilter === "Все" || doc.type === typeFilter;
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        doc.title.toLowerCase().includes(q) ||
        doc.keywords.join(" ").toLowerCase().includes(q);
      return matchesType && matchesSearch;
    });
  }, [search, typeFilter]);

  const selected = filtered.find((doc) => doc.id === activeId) ?? filtered[0];

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

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Input
            placeholder="Поиск по документам и ключевым словам..."
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
            {typeOptions.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="outline" className="text-xs">
          {filtered.length} документов
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1.4fr] gap-4">
        <div className="space-y-3">
          {filtered.map((doc) => (
            <button
              key={doc.id}
              onClick={() => setActiveId(doc.id)}
              className={`glass-card p-4 text-left w-full transition-all hover:shadow-md ${
                doc.id === selected?.id ? "ring-2 ring-primary bg-primary/5" : "hover:bg-muted/40"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <Badge variant="outline" className="text-xs">
                  {doc.type}
                </Badge>
                <Badge
                  variant="outline"
                  className={doc.isActive ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}
                >
                  {doc.isActive ? "Активен" : "Архив"}
                </Badge>
              </div>
              <h3 className="mt-2 text-sm font-semibold leading-snug">{doc.title}</h3>
              <p className="text-xs text-muted-foreground mt-1">{doc.contentPreview}</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {doc.keywords.slice(0, 3).map((k) => (
                  <Badge key={k} variant="secondary" className="text-[10px]">
                    {k}
                  </Badge>
                ))}
              </div>
            </button>
          ))}
        </div>

        {selected && (
          <div className="glass-card p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Badge variant="outline" className="text-xs">
                  {selected.type}
                </Badge>
                <h2 className="text-lg font-semibold mt-2">{selected.title}</h2>
                <p className="text-xs text-muted-foreground mt-1">Версия {selected.version}</p>
              </div>
              <Button size="sm">Открыть</Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Период действия</p>
                <p className="font-medium">
                  {selected.validFrom} — {selected.validTo}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Ответственный департамент</p>
                <p className="font-medium">{selected.ownerDepartment}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Применимо к подразделениям</p>
                <div className="flex flex-wrap gap-1">
                  {selected.departmentScope.map((d) => (
                    <Badge key={d} variant="secondary" className="text-[10px]">
                      {d}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Ключевые темы</p>
                <div className="flex flex-wrap gap-1">
                  {selected.keywords.map((k) => (
                    <Badge key={k} variant="outline" className="text-[10px]">
                      {k}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Релевантный фрагмент</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{selected.contentPreview}</p>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Как влияет на цели</h3>
              <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-1">
                <li>Формирует фокус квартала и рекомендуемые KPI</li>
                <li>Используется при оценке релевантности и стратегической связки</li>
                <li>Поддерживает авто-цитирование при генерации целей</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
