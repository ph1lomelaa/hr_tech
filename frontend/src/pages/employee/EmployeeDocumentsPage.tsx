import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useCurrentEmployee } from "@/hooks/use-current-employee";
import DocSplitPanel from "@/components/DocSplitPanel";

export default function EmployeeDocumentsPage() {
  const [activeId, setActiveId] = useState("");
  const { detail } = useCurrentEmployee();
  const department = detail?.department ?? undefined;
  const canLoadDocuments = !!detail?.id;

  const { data: documents = [], isLoading, isError } = useQuery({
    queryKey: ["documents", department],
    queryFn: () =>
      api.documents.list({
        department,
        is_active: true,
      }),
    enabled: canLoadDocuments,
    staleTime: 60_000,
  });

  const { data: docDetail } = useQuery({
    queryKey: ["doc-detail", activeId],
    queryFn: () => api.documents.get(activeId),
    enabled: !!activeId,
  });

  return (
    <DocSplitPanel
      documents={documents}
      isLoading={isLoading}
      isError={isError}
      activeId={activeId}
      onDocSelect={setActiveId}
      docDetail={docDetail}
      pageTitle="Нормативная база"
      pageSubtitle="Документы, релевантные вашим целям"
    />
  );
}
