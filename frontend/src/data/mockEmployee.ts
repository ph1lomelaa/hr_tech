export const myGoals = [
  {
    id: "g-002",
    employeeName: "Сидорова Мария",
    position: "HR Менеджер",
    department: "HR Департамент",
    text: "Улучшить показатели отдела по качеству подбора персонала.",
    status: "review" as const,
    smartIndex: 0.32,
    smartScores: [
      { key: "S", label: "Specific", value: 0.2 },
      { key: "M", label: "Measurable", value: 0.1 },
      { key: "A", label: "Achievable", value: 0.7 },
      { key: "R", label: "Relevant", value: 0.6 },
      { key: "T", label: "Time-bound", value: 0.0 },
    ],
    linkType: "functional" as const,
    quarter: "Q1 2026",
    weight: 40,
    goalType: "activity",
    deadline: "2026-03-31",
  },
  {
    id: "g-102",
    employeeName: "Сидорова Мария",
    position: "HR Менеджер",
    department: "HR Департамент",
    text: "Сократить срок онбординга новых сотрудников с 14 до 7 дней к 30 июня 2026 г.",
    status: "approved" as const,
    smartIndex: 0.88,
    smartScores: [
      { key: "S", label: "Specific", value: 0.9 },
      { key: "M", label: "Measurable", value: 0.85 },
      { key: "A", label: "Achievable", value: 0.9 },
      { key: "R", label: "Relevant", value: 0.95 },
      { key: "T", label: "Time-bound", value: 0.8 },
    ],
    linkType: "strategic" as const,
    quarter: "Q2 2026",
    weight: 35,
    goalType: "output",
    deadline: "2026-06-30",
  },
  {
    id: "g-103",
    employeeName: "Сидорова Мария",
    position: "HR Менеджер",
    department: "HR Департамент",
    text: "Повысить eNPS подразделения с 32 до 45 баллов к концу Q2 2026.",
    status: "draft" as const,
    smartIndex: 0.78,
    smartScores: [
      { key: "S", label: "Specific", value: 0.8 },
      { key: "M", label: "Measurable", value: 0.85 },
      { key: "A", label: "Achievable", value: 0.7 },
      { key: "R", label: "Relevant", value: 0.85 },
      { key: "T", label: "Time-bound", value: 0.7 },
    ],
    linkType: "strategic" as const,
    quarter: "Q2 2026",
    weight: 35,
    goalType: "impact",
    deadline: "2026-06-30",
  },
];

export const myGoalSummary = {
  totalGoals: 3,
  approved: 1,
  review: 1,
  draft: 1,
  avgSmart: 0.66,
  strategicShare: 67,
  weightSum: 110,
  quarter: "Q2 2026",
};

export const mySmartEvaluation = {
  smartIndex: 0.34,
  scores: [
    { key: "S", label: "Specific", value: 0.2 },
    { key: "M", label: "Measurable", value: 0.1 },
    { key: "A", label: "Achievable", value: 0.7 },
    { key: "R", label: "Relevant", value: 0.6 },
    { key: "T", label: "Time-bound", value: 0.1 },
  ],
  recommendations: [
    "Добавьте измеримый показатель (%, количество, срок)",
    "Уточните конкретный результат и срок",
  ],
  rewrite:
    "Повысить долю вакансий, закрытых в срок, с 62% до 75% к 30.06.2026 за счёт еженедельных 1:1 с рекрутерами.",
};

export const mySuggestions = [
  {
    id: 1,
    text: "Сократить срок онбординга новых сотрудников с 14 до 7 рабочих дней к 30 июня 2026 г. за счёт цифрового чек-листа и автоматизации доступов.",
    smartIndex: 0.89,
    scores: [
      { key: "S", label: "Specific", value: 0.9 },
      { key: "M", label: "Measurable", value: 0.85 },
      { key: "A", label: "Achievable", value: 0.9 },
      { key: "R", label: "Relevant", value: 0.95 },
      { key: "T", label: "Time-bound", value: 0.85 },
    ],
    source: "ВНД-045: Политика адаптации персонала",
    sourceSnippet:
      "Срок прохождения онбординга не должен превышать 7 рабочих дней при условии использования цифрового чек-листа.",
    linkType: "strategic",
    goalType: "output",
    context:
      "Для роли HR Менеджера в фокусе квартала — цифровизация и ускорение адаптации.",
  },
  {
    id: 2,
    text: "Повысить eNPS подразделения с 32 до 45 баллов к концу Q2 2026 через проведение ежемесячных 1:1 встреч и 3 инициатив по результатам опроса.",
    smartIndex: 0.83,
    scores: [
      { key: "S", label: "Specific", value: 0.85 },
      { key: "M", label: "Measurable", value: 0.9 },
      { key: "A", label: "Achievable", value: 0.75 },
      { key: "R", label: "Relevant", value: 0.85 },
      { key: "T", label: "Time-bound", value: 0.8 },
    ],
    source: "Стратегия HR 2026: п.3.2 Вовлечённость",
    sourceSnippet:
      "Целевой рост eNPS +15 п.п. за счёт регулярной обратной связи и инициатив вовлечённости.",
    linkType: "strategic",
    goalType: "impact",
    context: "Связано с KPI вовлечённости HR-стратегии 2026.",
  },
  {
    id: 3,
    text: "Разработать и внедрить систему грейдирования для 25 позиций департамента к 15 мая 2026 г. на основе методологии Hay Group.",
    smartIndex: 0.86,
    scores: [
      { key: "S", label: "Specific", value: 0.9 },
      { key: "M", label: "Measurable", value: 0.8 },
      { key: "A", label: "Achievable", value: 0.85 },
      { key: "R", label: "Relevant", value: 0.9 },
      { key: "T", label: "Time-bound", value: 0.85 },
    ],
    source: "KPI HR Департамента Q1-Q2",
    sourceSnippet:
      "Цель: описать и внедрить грейды для ключевых ролей департамента с покрытием не менее 25 позиций.",
    linkType: "functional",
    goalType: "output",
    context: "Фокус квартала — оптимизация системы грейдирования.",
  },
];

export const myFeedback = [
  {
    id: "f-01",
    goalId: "g-002",
    reviewer: "Иванова Анна",
    verdict: "Нужна доработка",
    comment: "Добавьте измеримый KPI и срок. Сейчас цель не проходит SMART-порог.",
    date: "2026-01-15",
  },
  {
    id: "f-02",
    goalId: "g-103",
    reviewer: "Иванова Анна",
    verdict: "Комментарий",
    comment: "Хорошая связка, но уточните ответственную роль за сбор eNPS.",
    date: "2026-02-01",
  },
];
