/**
 * GoalAI Platform — типизированный API-клиент
 * Все запросы идут через Vite-прокси /api → http://localhost:8000
 */

const BASE = "/api/v1";

// ── Утилита ──────────────────────────────────────────────────────────────────

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error((err as { detail?: string }).detail ?? "Ошибка API");
  }
  return res.json() as Promise<T>;
}

// ── Типы ─────────────────────────────────────────────────────────────────────

export interface SmartScores {
  S: number;
  M: number;
  A: number;
  R: number;
  T: number;
}

export interface EvaluateGoalRequest {
  goal_text: string;
  employee_id?: string;
  position?: string;
  department?: string;
  quarter?: string;
}

export interface EvaluateGoalResponse {
  smart_index: number;
  scores: SmartScores;
  goal_type: "activity" | "output" | "impact";
  alignment_level: "strategic" | "functional" | "operational";
  alignment_source: string | null;
  weak_criteria: string[];
  recommendations: string[];
  rewrite: string;
  model_version: string;
}

export interface RewriteGoalRequest {
  goal_text: string;
  position?: string;
  department?: string;
  weak_criteria?: string[];
}

export interface RewriteGoalResponse {
  original: string;
  rewritten: string;
  smart_index_before: number;
  smart_index_after: number;
  improvements: string[];
}

export interface GenerateGoalsRequest {
  employee_id: string;
  quarter: string; // "Q1" | "Q2" | "Q3" | "Q4"
  year: number;
  focus_direction?: string;
  include_manager_goals?: boolean;
}

export interface SuggestedGoalItem {
  id: string;
  goal_text: string;
  metric: string | null;
  deadline: string | null;
  weight_suggestion: number | null;
  smart_index: number;
  goal_type: string;
  source_doc_title: string | null;
  source_quote: string | null;
  generation_context: string;
}

export interface GenerateGoalsResponse {
  session_id: string;
  employee_id: string;
  quarter: string;
  suggestions: SuggestedGoalItem[];
  manager_goals_used: string[];
  documents_used: string[];
}

export interface AcceptGoalRequest {
  suggested_goal_id: string;
  employee_id: string;
  weight?: number;
}

export interface AcceptGoalResponse {
  goal_id: string;
  message: string;
}

export interface Employee {
  id: string;
  full_name: string;
  position: string | null;
  department: string | null;
}

export interface EmployeeDetail extends Employee {
  email: string;
  manager_id: string | null;
}

export interface GoalItem {
  id: string;
  employee_id: string;
  employee_name: string | null;
  position: string | null;
  department: string | null;
  title: string;
  goal_text: string | null;
  metric: string | null;
  deadline: string | null;
  weight: number | null;
  status: string;
  reviewer_comment: string | null;
  quarter: string | null;
  year: number | null;
  created_at: string | null;
  // AI
  smart_index: number | null;
  scores: SmartScores | null;
  goal_type: string | null;
  alignment_level: string | null;
  alignment_source: string | null;
  recommendations: string[];
  rewrite: string | null;
  weak_criteria: string[];
}

export interface AlertItem {
  id: string;
  alert_type: string;
  severity: "warning" | "critical";
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface ManagerGoal {
  id: string;
  goal_text: string;
  weight: number | null;
  status: string;
}

export interface DepartmentMaturity {
  department_id: string;
  department_name: string;
  quarter: string;
  year: number;
  maturity_index: number;
  avg_smart: number;
  strategic_percent: number;
  total_goals: number;
  weak_criteria: Record<string, number>;
  goal_type_dist: Record<string, number>;
  recommendations: string[];
}

export interface CompanyDashboard {
  quarter: string;
  year: number;
  total_employees: number;
  total_goals: number;
  avg_smart_company: number;
  strategic_percent: number;
  departments: DepartmentMaturity[];
}

export interface DocumentItem {
  doc_id: string;
  doc_type: string;
  title: string;
  version: string;
  valid_from: string | null;
  valid_to: string | null;
  department_scope: string[] | null;
  keywords: string[] | null;
  is_active: boolean;
}

export interface VndSearchResult {
  text: string;
  doc_title: string | null;
  doc_type: string | null;
  doc_id: string | null;
  relevance: number;
}

// ── API-объект ────────────────────────────────────────────────────────────────

export const api = {
  /** Оценка целей */
  evaluate: {
    goal: (data: EvaluateGoalRequest) =>
      req<EvaluateGoalResponse>("/evaluate/goal", { method: "POST", body: JSON.stringify(data) }),

    existingGoal: (goalId: string) =>
      req<EvaluateGoalResponse>(`/evaluate/goal/${goalId}`, { method: "POST" }),
  },

  /** Генерация и переформулировка */
  generate: {
    goals: (data: GenerateGoalsRequest) =>
      req<GenerateGoalsResponse>("/generate/goals", { method: "POST", body: JSON.stringify(data) }),

    accept: (data: AcceptGoalRequest) =>
      req<AcceptGoalResponse>("/generate/accept", { method: "POST", body: JSON.stringify(data) }),

    rewrite: (data: RewriteGoalRequest) =>
      req<RewriteGoalResponse>("/generate/rewrite", { method: "POST", body: JSON.stringify(data) }),
  },

  /** Цели */
  goals: {
    list: (params?: {
      status?: string;
      quarter?: string;
      year?: number;
      employee_id?: string;
      limit?: number;
    }) => {
      const qs = new URLSearchParams();
      if (params?.status) qs.set("status", params.status);
      if (params?.quarter) qs.set("quarter", params.quarter);
      if (params?.year) qs.set("year", String(params.year));
      if (params?.employee_id) qs.set("employee_id", params.employee_id);
      if (params?.limit) qs.set("limit", String(params.limit));
      const q = qs.toString();
      return req<GoalItem[]>(`/goals/${q ? `?${q}` : ""}`);
    },

    get: (id: string) => req<GoalItem>(`/goals/${id}`),

    create: (data: {
      employee_id: string;
      goal_text: string;
      metric?: string;
      weight?: number;
      deadline?: string;
      status?: string;
      quarter?: string;
      year?: number;
    }) => req<GoalItem>("/goals/", { method: "POST", body: JSON.stringify(data) }),

    updateStatus: (id: string, status: string, reviewer_comment?: string) =>
      req<{ ok: boolean }>(`/goals/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, reviewer_comment }),
      }),
  },

  /** Сотрудники */
  employees: {
    list: (params?: { department_id?: string }) => {
      const qs = params?.department_id ? `?department_id=${params.department_id}` : "";
      return req<Employee[]>(`/employees/${qs}`);
    },

    get: (id: string) => req<EmployeeDetail>(`/employees/${id}`),

    goals: (id: string, params?: { quarter?: string; year?: number }) => {
      const qs = new URLSearchParams();
      if (params?.quarter) qs.set("quarter", params.quarter);
      if (params?.year) qs.set("year", String(params.year));
      const q = qs.toString();
      return req<GoalItem[]>(`/employees/${id}/goals${q ? `?${q}` : ""}`);
    },

    managerGoals: (id: string, quarter: string, year: number) =>
      req<ManagerGoal[]>(`/employees/${id}/manager-goals?quarter=${quarter}&year=${year}`),

    alerts: (id: string, unreadOnly = false) =>
      req<AlertItem[]>(`/employees/${id}/alerts${unreadOnly ? "?unread_only=true" : ""}`),

    markAlertRead: (employeeId: string, alertId: string) =>
      req<{ ok: boolean }>(`/employees/${employeeId}/alerts/${alertId}/read`, { method: "PATCH" }),
  },

  /** Аналитика */
  analytics: {
    company: (quarter: string, year: number) =>
      req<CompanyDashboard>(`/analytics/company?quarter=${quarter}&year=${year}`),

    department: (id: string, quarter: string, year: number) =>
      req<DepartmentMaturity>(`/analytics/department/${id}?quarter=${quarter}&year=${year}`),

    refresh: (quarter: string, year: number) =>
      req<{ refreshed: number }>(`/analytics/refresh?quarter=${quarter}&year=${year}`, { method: "POST" }),
  },

  /** Документы ВНД */
  documents: {
    list: (params?: { doc_type?: string; is_active?: boolean }) => {
      const qs = new URLSearchParams();
      if (params?.doc_type) qs.set("doc_type", params.doc_type);
      if (params?.is_active !== undefined) qs.set("is_active", String(params.is_active));
      const q = qs.toString();
      return req<DocumentItem[]>(`/documents/${q ? `?${q}` : ""}`);
    },

    get: (id: string) =>
      req<DocumentItem & { content: string }>(`/documents/${id}`),

    search: (q: string, n = 5) =>
      req<{ query: string; results: VndSearchResult[] }>(
        `/documents/search?q=${encodeURIComponent(q)}&n=${n}`
      ),
  },
};

// ── Вспомогательные конвертеры для GoalCard ───────────────────────────────────

/** Конвертирует GoalItem из API в формат GoalCard */
export function toGoalCard(g: GoalItem) {
  const scoreEntries = g.scores
    ? [
        { key: "S", label: "Specific", value: g.scores.S },
        { key: "M", label: "Measurable", value: g.scores.M },
        { key: "A", label: "Achievable", value: g.scores.A },
        { key: "R", label: "Relevant", value: g.scores.R },
        { key: "T", label: "Time-bound", value: g.scores.T },
      ]
    : [
        { key: "S", label: "Specific", value: 0.5 },
        { key: "M", label: "Measurable", value: 0.5 },
        { key: "A", label: "Achievable", value: 0.5 },
        { key: "R", label: "Relevant", value: 0.5 },
        { key: "T", label: "Time-bound", value: 0.5 },
      ];

  // Маппинг статусов API → UI
  const statusMap: Record<string, "draft" | "review" | "approved" | "rejected"> = {
    draft: "draft",
    pending: "review",
    approved: "approved",
    rejected: "rejected",
  };

  return {
    id: g.id,
    employeeName: g.employee_name ?? "Сотрудник",
    position: g.position ?? "Должность",
    department: g.department ?? "Подразделение",
    text: g.goal_text ?? g.title,
    status: statusMap[g.status] ?? "draft",
    smartIndex: g.smart_index ?? 0.5,
    smartScores: scoreEntries,
    linkType: (g.alignment_level ?? "operational") as "strategic" | "functional" | "operational",
    quarter: g.quarter ? `${g.quarter} ${g.year ?? ""}`.trim() : "—",
    weight: g.weight ?? 0,
    goalType: (g.goal_type ?? undefined) as "activity" | "output" | "impact" | undefined,
    source: g.alignment_source ?? undefined,
  };
}

/** Парсит строку вида "Q2 2026" или "Q2" → возвращает { quarter: "Q2", year: 2026 } */
export function parseQuarter(raw: string): { quarter: string; year: number } {
  const parts = raw.trim().split(/\s+/);
  const q = parts[0]?.toUpperCase() ?? "Q1";
  const y = parseInt(parts[1] ?? "2026", 10) || 2026;
  return { quarter: q, year: y };
}
