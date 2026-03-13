import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { mockDocuments } from "@/data/mockDocuments";

const typeOptions = ["Все", "ВНД", "Стратегия", "KPI-фреймворк", "Политика"] as const;
const managerDepartment = "Продажи";

export default function ManagerDocumentsPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("Все");

  const filtered = useMemo(() => {
    return mockDocuments.filter((doc) => {
      const matchesDept = doc.departmentScope.includes(managerDepartment);
      const matchesType = typeFilter === "Все" || doc.type === typeFilter;
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        doc.title.toLowerCase().includes(q) ||
        doc.keywords.join(" ").toLowerCase().includes(q);
      return matchesDept && matchesType && matchesSearch;
    });
  }, [search, typeFilter]);

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Нормативная база</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Документы, релевантные подразделению «{managerDepartment}»
          </p>
        </div>
        <Button variant="outline">Запросить доступ</Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Input
            placeholder="Поиск по документам..."
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

      <div className="space-y-3">
        {filtered.map((doc) => (
          <div key={doc.id} className="glass-card p-5">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-xs">{doc.type}</Badge>
              <Badge
                variant="outline"
                className={doc.isActive ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}
              >
                {doc.isActive ? "Активен" : "Архив"}
              </Badge>
            </div>
            <h3 className="text-sm font-semibold mt-2">{doc.title}</h3>
            <p className="text-xs text-muted-foreground mt-1">Версия {doc.version} · {doc.validFrom} — {doc.validTo}</p>
            <p className="text-sm text-muted-foreground mt-3">{doc.contentPreview}</p>
            <div className="flex flex-wrap gap-1 mt-3">
              {doc.keywords.map((k) => (
                <Badge key={k} variant="secondary" className="text-[10px]">{k}</Badge>
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="glass-card p-8 text-center text-muted-foreground text-sm">
            Нет документов по выбранным фильтрам
          </div>
        )}
      </div>
    </div>
  );
}
