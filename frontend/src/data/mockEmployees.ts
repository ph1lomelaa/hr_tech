export type EmployeeRecord = {
  id: string;
  name: string;
  position: string;
  department: string;
  manager: string;
  goalsCount: number;
  avgSmart: number;
  strategicShare: number;
  status: "active" | "inactive";
};

export const mockEmployees: EmployeeRecord[] = [
  {
    id: "e-001",
    name: "Петров Алексей",
    position: "Ведущий разработчик",
    department: "IT Департамент",
    manager: "Смирнов Павел",
    goalsCount: 4,
    avgSmart: 0.81,
    strategicShare: 68,
    status: "active",
  },
  {
    id: "e-002",
    name: "Сидорова Мария",
    position: "HR Менеджер",
    department: "HR Департамент",
    manager: "Иванова Анна",
    goalsCount: 3,
    avgSmart: 0.62,
    strategicShare: 47,
    status: "active",
  },
  {
    id: "e-003",
    name: "Козлов Дмитрий",
    position: "Финансовый аналитик",
    department: "Финансы",
    manager: "Гаврилов Илья",
    goalsCount: 5,
    avgSmart: 0.86,
    strategicShare: 75,
    status: "active",
  },
  {
    id: "e-004",
    name: "Николаева Елена",
    position: "Маркетолог",
    department: "Маркетинг",
    manager: "Орлова Светлана",
    goalsCount: 2,
    avgSmart: 0.58,
    strategicShare: 33,
    status: "active",
  },
  {
    id: "e-005",
    name: "Васильев Игорь",
    position: "Руководитель отдела",
    department: "Продажи",
    manager: "Кузнецов Артём",
    goalsCount: 4,
    avgSmart: 0.77,
    strategicShare: 61,
    status: "active",
  },
  {
    id: "e-006",
    name: "Романова Ольга",
    position: "Юрист",
    department: "Юридический",
    manager: "Савин Олег",
    goalsCount: 1,
    avgSmart: 0.41,
    strategicShare: 22,
    status: "active",
  },
];

export const employeeQuarterSummary = {
  quarter: "Q1 2026",
  avgSmart: 0.67,
  weakCriteria: ["Specific", "Time-bound"],
  totalGoals: 4,
  weightSum: 110,
  strategicShare: 52,
  alerts: [
    "Количество целей меньше рекомендуемого (3–5)",
    "Суммарный вес целей превышает 100%",
    "2 цели без стратегической связки",
  ],
};
