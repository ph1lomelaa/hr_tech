import type { AlertRecord } from "@/data/mockAlerts";

export type GoalDetail = {
  id: string;
  metric: string;
  deadline: string;
  weight: number;
  owner: string;
  department: string;
  position: string;
  quarter: string;
  status: "draft" | "review" | "approved" | "rejected";
  smartIndex: number;
  smartScores: { key: string; label: string; value: number; note: string }[];
  goalType: "activity" | "output" | "impact";
  alignmentLevel: "strategic" | "functional" | "operational";
  alignmentSource: {
    title: string;
    snippet: string;
  };
  recommendations: string[];
  rewrite: string;
  achievabilityNote: string;
  duplicates: { id: string; text: string; similarity: number }[];
  alerts: AlertRecord[];
  reviewHistory: { reviewer: string; verdict: string; comment: string; date: string }[];
};

export const mockGoalDetails: GoalDetail[] = [
  {
    id: "g-001",
    metric: "Среднее время обработки заявок, часы",
    deadline: "2026-03-31",
    weight: 30,
    owner: "Петров Алексей",
    department: "IT Департамент",
    position: "Ведущий разработчик",
    quarter: "Q1 2026",
    status: "approved",
    smartIndex: 0.87,
    smartScores: [
      { key: "S", label: "Specific", value: 0.9, note: "Чётко указан процесс и целевое значение." },
      { key: "M", label: "Measurable", value: 0.85, note: "Есть базовое и целевое значения в часах." },
      { key: "A", label: "Achievable", value: 0.8, note: "Сопоставимо с историческими данными отдела." },
      { key: "R", label: "Relevant", value: 0.95, note: "Связано с приоритетом снижения сроков сервиса." },
      { key: "T", label: "Time-bound", value: 0.85, note: "Указан дедлайн на конец Q1." },
    ],
    goalType: "output",
    alignmentLevel: "strategic",
    alignmentSource: {
      title: "Стратегия цифровой трансформации 2026",
      snippet: "Сократить время обработки внутренних запросов на 20% за счёт автоматизации процесса распределения задач.",
    },
    recommendations: [
      "Добавить ответственного за контроль показателя",
      "Уточнить источник данных для метрики",
    ],
    rewrite:
      "Снизить среднее время обработки заявок отдела с 48 до 36 часов к 31.03.2026, закрепив источник данных в Service Desk и ежемесячно отслеживая показатель.",
    achievabilityNote:
      "Порог снижения сопоставим со снижением на 18% в прошлом квартале для аналогичных процессов.",
    duplicates: [
      {
        id: "g-014",
        text: "Сократить время обработки заявок на 15% к концу Q1 2026",
        similarity: 0.82,
      },
    ],
    alerts: [],
    reviewHistory: [
      {
        reviewer: "Смирнов Павел",
        verdict: "Approved",
        comment: "Хорошая связка с инициативой по автоматизации.",
        date: "2026-01-12",
      },
    ],
  },
  {
    id: "g-003",
    metric: "Время подготовки отчёта, часы",
    deadline: "2026-04-15",
    weight: 35,
    owner: "Козлов Дмитрий",
    department: "Финансы",
    position: "Финансовый аналитик",
    quarter: "Q1 2026",
    status: "approved",
    smartIndex: 0.91,
    smartScores: [
      { key: "S", label: "Specific", value: 0.95, note: "Чётко описан процесс и ожидаемый результат." },
      { key: "M", label: "Measurable", value: 0.9, note: "Есть базовое и целевое значения в часах." },
      { key: "A", label: "Achievable", value: 0.85, note: "Сопоставимо с аналогичными задачами прошлых периодов." },
      { key: "R", label: "Relevant", value: 0.9, note: "Поддерживает стратегию автоматизации отчётности." },
      { key: "T", label: "Time-bound", value: 0.95, note: "Указан конкретный дедлайн." },
    ],
    goalType: "output",
    alignmentLevel: "strategic",
    alignmentSource: {
      title: "Регламент управления проектами",
      snippet: "Сокращение сроков подготовки ключевой отчётности — приоритет Q1 для финансовых подразделений.",
    },
    recommendations: [
      "Зафиксировать владельца процесса автоматизации",
      "Согласовать KPI с руководителем направления",
    ],
    rewrite:
      "Автоматизировать формирование отчёта по дебиторской задолженности до 15.04.2026, сократив время подготовки с 8 до 2 часов и закрепив контроль метрики в BI-дашборде.",
    achievabilityNote:
      "Целевой уровень соответствует лучшим практикам по подразделению за 2025 год.",
    duplicates: [],
    alerts: [],
    reviewHistory: [
      {
        reviewer: "Гаврилов Илья",
        verdict: "Approved",
        comment: "Отличная цель, хорошо измерима и релевантна.",
        date: "2026-01-10",
      },
    ],
  },
  {
    id: "g-004",
    metric: "Конверсия лендинга, %",
    deadline: "2026-06-30",
    weight: 20,
    owner: "Николаева Елена",
    department: "Маркетинг",
    position: "Маркетолог",
    quarter: "Q2 2026",
    status: "draft",
    smartIndex: 0.74,
    smartScores: [
      { key: "S", label: "Specific", value: 0.8, note: "Указан конкретный объект оптимизации." },
      { key: "M", label: "Measurable", value: 0.85, note: "Задано целевое изменение конверсии." },
      { key: "A", label: "Achievable", value: 0.6, note: "Требуется уточнение ресурса и гипотез." },
      { key: "R", label: "Relevant", value: 0.75, note: "Соответствует задачам отдела маркетинга." },
      { key: "T", label: "Time-bound", value: 0.7, note: "Указан период до конца Q2." },
    ],
    goalType: "output",
    alignmentLevel: "operational",
    alignmentSource: {
      title: "KPI Маркетинга Q2 2026",
      snippet: "Рост конверсии ключевых лендингов не менее чем на 15% за квартал.",
    },
    recommendations: [
      "Добавить план A/B тестирования",
      "Зафиксировать целевую аудиторию",
    ],
    rewrite:
      "Повысить конверсию лендинга продукта X на 20% к 30.06.2026 через 4 A/B теста и оптимизацию формы заявки.",
    achievabilityNote:
      "Цель выше средних значений прошлого квартала (+12%).",
    duplicates: [],
    alerts: [],
    reviewHistory: [],
  },
  {
    id: "g-005",
    metric: "Выручка B2B, %",
    deadline: "2026-03-31",
    weight: 40,
    owner: "Васильев Игорь",
    department: "Продажи",
    position: "Руководитель отдела",
    quarter: "Q1 2026",
    status: "approved",
    smartIndex: 0.82,
    smartScores: [
      { key: "S", label: "Specific", value: 0.85, note: "Задано конкретное направление продаж." },
      { key: "M", label: "Measurable", value: 0.9, note: "Есть количественная цель по выручке." },
      { key: "A", label: "Achievable", value: 0.7, note: "Требует подтверждения ресурсами." },
      { key: "R", label: "Relevant", value: 0.85, note: "Соответствует стратегии роста B2B." },
      { key: "T", label: "Time-bound", value: 0.8, note: "Период — Q1 2026." },
    ],
    goalType: "impact",
    alignmentLevel: "strategic",
    alignmentSource: {
      title: "Стратегия продаж 2026",
      snippet: "Целевой рост B2B-сегмента на 15% за счёт партнёрских программ и новых каналов.",
    },
    recommendations: [
      "Добавить владельцев партнёрских инициатив",
      "Зафиксировать план по новым каналам",
    ],
    rewrite:
      "Увеличить выручку B2B-сегмента на 15% за Q1 2026 за счёт запуска 3 партнёрских программ и 2 новых каналов продаж.",
    achievabilityNote:
      "Цель сопоставима с ростом 12% в предыдущем квартале.",
    duplicates: [],
    alerts: [],
    reviewHistory: [
      {
        reviewer: "Кузнецов Артём",
        verdict: "Approved",
        comment: "Цель корректна, просьба добавить план по каналам до середины квартала.",
        date: "2026-01-11",
      },
    ],
  },
  {
    id: "g-102",
    metric: "Длительность онбординга, дни",
    deadline: "2026-06-30",
    weight: 35,
    owner: "Сидорова Мария",
    department: "HR Департамент",
    position: "HR Менеджер",
    quarter: "Q2 2026",
    status: "approved",
    smartIndex: 0.88,
    smartScores: [
      { key: "S", label: "Specific", value: 0.9, note: "Указан конкретный процесс и целевое значение." },
      { key: "M", label: "Measurable", value: 0.85, note: "Есть измеримая метрика в днях." },
      { key: "A", label: "Achievable", value: 0.9, note: "Сопоставимо с историческими данными HR." },
      { key: "R", label: "Relevant", value: 0.95, note: "Связано с приоритетом цифровизации HR." },
      { key: "T", label: "Time-bound", value: 0.8, note: "Указан срок до конца Q2." },
    ],
    goalType: "output",
    alignmentLevel: "strategic",
    alignmentSource: {
      title: "ВНД-045: Политика адаптации персонала",
      snippet: "Срок прохождения онбординга не должен превышать 7 рабочих дней.",
    },
    recommendations: [
      "Зафиксировать владельца чек-листа адаптации",
      "Уточнить мониторинг показателя по месяцам",
    ],
    rewrite:
      "Сократить срок онбординга новых сотрудников с 14 до 7 дней к 30.06.2026, внедрив цифровой чек-лист и ежемесячный контроль показателя.",
    achievabilityNote:
      "Сравнимо с пилотным снижением на 40% в Q4 2025.",
    duplicates: [],
    alerts: [],
    reviewHistory: [
      {
        reviewer: "Иванова Анна",
        verdict: "Approved",
        comment: "Цель соответствует ВНД и KPI по адаптации.",
        date: "2026-02-05",
      },
    ],
  },
  {
    id: "g-103",
    metric: "eNPS, баллы",
    deadline: "2026-06-30",
    weight: 35,
    owner: "Сидорова Мария",
    department: "HR Департамент",
    position: "HR Менеджер",
    quarter: "Q2 2026",
    status: "draft",
    smartIndex: 0.78,
    smartScores: [
      { key: "S", label: "Specific", value: 0.8, note: "Определён показатель вовлечённости." },
      { key: "M", label: "Measurable", value: 0.85, note: "Цель выражена в баллах eNPS." },
      { key: "A", label: "Achievable", value: 0.7, note: "Потребуются инициативы и поддержка руководителей." },
      { key: "R", label: "Relevant", value: 0.85, note: "Соответствует HR-стратегии 2026." },
      { key: "T", label: "Time-bound", value: 0.7, note: "Указан срок до конца Q2." },
    ],
    goalType: "impact",
    alignmentLevel: "strategic",
    alignmentSource: {
      title: "Стратегия HR 2026",
      snippet: "Рост eNPS на +15 п.п. за счёт инициатив по вовлечённости и регулярной обратной связи.",
    },
    recommendations: [
      "Добавить план по инициативам вовлечённости",
      "Уточнить владельца метрики eNPS",
    ],
    rewrite:
      "Повысить eNPS подразделения с 32 до 45 баллов к 30.06.2026 за счёт ежемесячных 1:1 и 3 инициатив по вовлечённости.",
    achievabilityNote:
      "Рост +13 п.п. выше среднего по HR (+9 п.п.) — требуется план мероприятий.",
    duplicates: [],
    alerts: [],
    reviewHistory: [],
  },
  {
    id: "g-002",
    metric: "Индекс качества подбора, %",
    deadline: "2026-03-31",
    weight: 25,
    owner: "Сидорова Мария",
    department: "HR Департамент",
    position: "HR Менеджер",
    quarter: "Q1 2026",
    status: "review",
    smartIndex: 0.32,
    smartScores: [
      { key: "S", label: "Specific", value: 0.2, note: "Нет конкретного результата и объекта улучшения." },
      { key: "M", label: "Measurable", value: 0.1, note: "Отсутствует измеримый показатель." },
      { key: "A", label: "Achievable", value: 0.7, note: "Реалистично для роли." },
      { key: "R", label: "Relevant", value: 0.6, note: "Требуется привязка к KPI департамента." },
      { key: "T", label: "Time-bound", value: 0.0, note: "Не указан срок." },
    ],
    goalType: "activity",
    alignmentLevel: "functional",
    alignmentSource: {
      title: "KPI HR Департамента Q1-Q2 2026",
      snippet: "KPI: доля вакансий, закрытых в срок, и качество подбора по оценке руководителей.",
    },
    recommendations: [
      "Добавить измеримый показатель (например, % закрытых вакансий в срок)",
      "Указать срок выполнения",
      "Уточнить связь с KPI по качеству подбора",
    ],
    rewrite:
      "Повысить долю вакансий, закрытых в срок, с 62% до 75% к 31.03.2026, внедрив еженедельный мониторинг статусов и корректировки источников найма.",
    achievabilityNote:
      "Порог +13 п.п. превышает медиану по отделу за последний год (+8 п.п.).",
    duplicates: [],
    alerts: [
      {
        id: "a-101",
        severity: "high",
        title: "SMART ниже порога",
        description: "SMART 0.32. Нет измеримости и срока.",
        type: "smart",
      },
    ],
    reviewHistory: [
      {
        reviewer: "Иванова Анна",
        verdict: "Needs rework",
        comment: "Нужно добавить KPI и срок, иначе цель не принимается.",
        date: "2026-01-15",
      },
    ],
  },
];
