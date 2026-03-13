export type DocumentRecord = {
  id: string;
  type: "ВНД" | "Стратегия" | "KPI-фреймворк" | "Политика";
  title: string;
  contentPreview: string;
  validFrom: string;
  validTo: string;
  ownerDepartment: string;
  departmentScope: string[];
  keywords: string[];
  version: string;
  isActive: boolean;
};

export const mockDocuments: DocumentRecord[] = [
  {
    id: "doc-045",
    type: "ВНД",
    title: "ВНД-045: Политика адаптации персонала",
    contentPreview:
      "Стандарт адаптации определяет сроки прохождения онбординга (не более 7 рабочих дней) и обязательный цифровой чек-лист доступа.",
    validFrom: "2025-01-01",
    validTo: "2027-01-01",
    ownerDepartment: "HR Департамент",
    departmentScope: ["HR Департамент", "IT Департамент"],
    keywords: ["онбординг", "адаптация", "цифровизация"],
    version: "1.3",
    isActive: true,
  },
  {
    id: "doc-020",
    type: "Стратегия",
    title: "Стратегия HR 2026",
    contentPreview:
      "Фокус 2026: повышение вовлечённости (eNPS +15 п.п.), развитие лидерства, автоматизация ключевых HR-процессов.",
    validFrom: "2026-01-01",
    validTo: "2026-12-31",
    ownerDepartment: "HR Департамент",
    departmentScope: ["HR Департамент"],
    keywords: ["eNPS", "лидерство", "цифровизация"],
    version: "2.0",
    isActive: true,
  },
  {
    id: "doc-078",
    type: "KPI-фреймворк",
    title: "KPI HR Департамента Q1-Q2 2026",
    contentPreview:
      "Ключевые KPI: срок закрытия вакансий, NPS кандидатов, % прохождения онбординга в срок, доля обученных руководителей.",
    validFrom: "2026-01-01",
    validTo: "2026-06-30",
    ownerDepartment: "HR Департамент",
    departmentScope: ["HR Департамент"],
    keywords: ["KPI", "подбор", "онбординг"],
    version: "1.0",
    isActive: true,
  },
  {
    id: "doc-112",
    type: "Политика",
    title: "Политика обучения и развития",
    contentPreview:
      "Ежегодно не менее 70% руководителей проходят программу развития лидерства с измеримым эффектом.",
    validFrom: "2024-07-01",
    validTo: "2027-07-01",
    ownerDepartment: "HR Департамент",
    departmentScope: ["HR Департамент", "Продажи", "Маркетинг"],
    keywords: ["обучение", "лидерство", "развитие"],
    version: "1.5",
    isActive: true,
  },
  {
    id: "doc-210",
    type: "ВНД",
    title: "Регламент управления проектами",
    contentPreview:
      "Регламентирует подготовку проектных отчётов, сроки согласований и метрики эффективности проекта.",
    validFrom: "2025-04-01",
    validTo: "2028-04-01",
    ownerDepartment: "PMO",
    departmentScope: ["IT Департамент", "Финансы", "Маркетинг"],
    keywords: ["проекты", "отчётность", "метрики"],
    version: "3.2",
    isActive: true,
  },
  {
    id: "doc-302",
    type: "Стратегия",
    title: "Стратегия цифровой трансформации 2026",
    contentPreview:
      "Цель: перевести 60% внутренних процессов в цифровые каналы, снизив операционные издержки на 12%.",
    validFrom: "2026-01-01",
    validTo: "2028-12-31",
    ownerDepartment: "IT Департамент",
    departmentScope: ["IT Департамент", "HR Департамент", "Финансы"],
    keywords: ["цифровизация", "оптимизация", "процессы"],
    version: "1.1",
    isActive: true,
  },
];
