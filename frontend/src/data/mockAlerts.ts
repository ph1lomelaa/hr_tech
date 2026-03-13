export type AlertRecord = {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  goalId?: string;
  employeeName?: string;
  type: "smart" | "alignment" | "count" | "weight" | "duplicate" | "achievable";
};

export const hrAlerts: AlertRecord[] = [
  {
    id: "a-101",
    severity: "high",
    title: "SMART ниже порога",
    description: "Цель сотрудника Сидоровой Марии имеет SMART 0.32 и требует переформулировки.",
    goalId: "g-002",
    employeeName: "Сидорова Мария",
    type: "smart",
  },
  {
    id: "a-102",
    severity: "medium",
    title: "Нет стратегической связки",
    description: "2 цели отдела Маркетинга не связаны со стратегическими приоритетами.",
    type: "alignment",
  },
  {
    id: "a-103",
    severity: "medium",
    title: "Неверная структура набора",
    description: "У Васильева Игоря 2 цели и суммарный вес 130%.",
    employeeName: "Васильев Игорь",
    type: "weight",
  },
  {
    id: "a-104",
    severity: "low",
    title: "Потенциальные дубликаты",
    description: "Найдены 2 похожие цели в HR Департаменте (сходство 0.82).",
    type: "duplicate",
  },
];

export const employeeAlerts: AlertRecord[] = [
  {
    id: "e-201",
    severity: "high",
    title: "Цель требует уточнения",
    description: "В цели нет измеримого показателя и срока. SMART 0.32.",
    goalId: "g-002",
    type: "smart",
  },
  {
    id: "e-202",
    severity: "medium",
    title: "Суммарный вес 110%",
    description: "Скорректируйте веса целей так, чтобы сумма была 100%.",
    type: "weight",
  },
  {
    id: "e-203",
    severity: "low",
    title: "Цель без стратегической связки",
    description: "Добавьте ссылку на ВНД или KPI подразделения.",
    type: "alignment",
  },
];
