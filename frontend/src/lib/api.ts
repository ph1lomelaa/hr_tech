/**
 * GoalAI Platform — типизированный API-клиент
 * Все запросы идут через Vite-прокси /api → http://localhost:8000
 */

import { getCurrentQuarterYear } from "@/lib/date";

const BASE = "/api/v1";
const ROLE_STORAGE_KEY = "goalai_role";
const AUTH_TOKEN_STORAGE_PREFIX = "goalai_access_token_";

function getEmployeeStorageKey(role: string): string {
  return `goalai_employee_id_${role}`;
}

function getAuthTokenStorageKey(role: string): string {
  return `${AUTH_TOKEN_STORAGE_PREFIX}${role}`;
}

function readStoredEmployeeId(role: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(getEmployeeStorageKey(role));
}

function writeStoredEmployeeId(role: string, employeeId: string | null): void {
  if (typeof window === "undefined") return;
  if (employeeId) {
    window.localStorage.setItem(getEmployeeStorageKey(role), employeeId);
  } else {
    window.localStorage.removeItem(getEmployeeStorageKey(role));
  }
}

function clearStoredAuthToken(role: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(getAuthTokenStorageKey(role));
}

function getCurrentRole(): string {
  if (typeof window === "undefined") return "hr";
  return (window.localStorage.getItem(ROLE_STORAGE_KEY) ?? "hr").toLowerCase();
}

type ImpersonateResponse = {
  access_token: string;
  token_type: "bearer";
  actor?: {
    role: string;
    employee_id: string | null;
    full_name?: string | null;
    department?: string | null;
    position?: string | null;
  };
};

let authBootstrapPromise: Promise<void> | null = null;

async function bootstrapAuthToken(
  force = false,
  override?: { role?: string; employeeId?: string | null },
): Promise<void> {
  if (typeof window === "undefined") return;
  const role = override?.role ?? getCurrentRole();
  const tokenStorageKey = getAuthTokenStorageKey(role);
  const existingToken = window.localStorage.getItem(tokenStorageKey);
  if (existingToken && !force) {
    return;
  }
  if (authBootstrapPromise) {
    return authBootstrapPromise;
  }

  authBootstrapPromise = (async () => {
    const employeeId = role === "hr"
      ? null
      : (override?.employeeId ?? readStoredEmployeeId(role));
    const res = await fetch(`${BASE}/auth/impersonate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role,
        employee_id: employeeId || undefined,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error((err as { detail?: string }).detail ?? "Не удалось инициализировать auth-сессию");
    }
    const data = (await res.json()) as ImpersonateResponse;
    if (data.access_token) {
      window.localStorage.setItem(tokenStorageKey, data.access_token);
    }
    if (data.actor?.employee_id) {
      writeStoredEmployeeId(role, data.actor.employee_id);
    } else if (role === "hr") {
      writeStoredEmployeeId(role, null);
    }
  })().finally(() => {
    authBootstrapPromise = null;
  });
  return authBootstrapPromise;
}

function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};

  const role = getCurrentRole();
  const token = window.localStorage.getItem(getAuthTokenStorageKey(role));
  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

// ── Утилита ──────────────────────────────────────────────────────────────────

async function fetchWithAuth(path: string, options?: RequestInit): Promise<Response> {
  await bootstrapAuthToken();
  const doFetch = () => {
    const authHeaders = getAuthHeaders();
    return fetch(`${BASE}${path}`, {
      headers: { "Content-Type": "application/json", ...authHeaders, ...options?.headers },
      ...options,
    });
  };

  let res = await doFetch();
  if (res.status === 401 && typeof window !== "undefined") {
    const role = getCurrentRole();
    window.localStorage.removeItem(getAuthTokenStorageKey(role));
    await bootstrapAuthToken(true);
    res = await doFetch();
  }
  return res;
}

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetchWithAuth(path, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error((err as { detail?: string }).detail ?? "Ошибка API");
  }
  if (res.status === 204) {
    return undefined as T;
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return undefined as T;
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
  year?: number;
}

export interface EvaluateGoalResponse {
  smart_index: number;
  scores: SmartScores;
  criteria_explanations: Record<"S" | "M" | "A" | "R" | "T", string>;
  goal_type: "activity" | "output" | "impact";
  alignment_level: "strategic" | "functional" | "operational";
  alignment_source: string | null;
  weak_criteria: string[];
  recommendations: string[];
  rewrite: string;
  model_version: string;
  achievability_warning?: string | null;
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

export interface BatchEvaluateRequest {
  employee_id: string;
  quarter: string;
  year: number;
}

export interface BatchGoalItem {
  goal_id: string;
  goal_text: string;
  smart_index: number;
  scores: SmartScores;
  goal_type: string;
  weak_criteria: string[];
}

export interface BatchEvaluateResponse {
  employee_id: string;
  quarter: string;
  total_goals: number;
  avg_smart: number;
  weight_total: number;
  weak_criteria_summary: Record<string, number>;
  goals: BatchGoalItem[];
  alerts: string[];
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
  scores: SmartScores | null;
  goal_type: string;
  alignment_level: "strategic" | "functional" | "operational" | null;
  alignment_source: string | null;
  source_doc_id: string | null;
  source_doc_title: string | null;
  source_doc_link: string | null;
  source_quote: string | null;
  source_reference?: string | null;
  generation_context: string;
  duplicate_score: number | null;
  duplicate_with: string[];
  warnings: string[];
}

export interface GenerateGoalsResponse {
  session_id: string;
  employee_id: string;
  quarter: string;
  suggestions: SuggestedGoalItem[];
  manager_goals_used: string[];
  documents_used: string[];
  warnings: string[];
}

export interface AcceptGoalRequest {
  suggested_goal_id: string;
  employee_id: string;
  weight?: number;
}

export interface AcceptGoalResponse {
  goal_id: string;
  message: string;
  warnings: string[];
}

export interface RejectGoalRequest {
  suggested_goal_id: string;
  employee_id: string;
  reason?: string;
}

export interface RejectGoalResponse {
  suggested_goal_id: string;
  message: string;
}

export interface Employee {
  id: string;
  full_name: string;
  position: string | null;
  department: string | null;
  manager_id?: string | null;
}

export interface ImpersonationCandidate extends Employee {
  department_id?: number | null;
}

export interface ImpersonationOptionsResponse {
  roles: {
    hr: {
      requires_employee: false;
      count: number;
    };
    manager: {
      requires_employee: true;
      count: number;
      employees: ImpersonationCandidate[];
    };
    employee: {
      requires_employee: true;
      count: number;
      employees: ImpersonationCandidate[];
    };
  };
  departments: Array<{
    id: number;
    name: string;
  }>;
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
  status_code?: string;
  status_label_ru?: string | null;
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
  // Источник AI-генерации (если цель принята из suggestions)
  source_doc_id?: string | null;
  source_doc_title?: string | null;
  source_quote?: string | null;
  generation_context?: string | null;
  suggested_goal_id?: string | null;
  generation_session_id?: string | null;
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
  status_code?: string;
  status_label_ru?: string | null;
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
  alignment_dist?: Record<string, number>;
  smart_buckets?: { critical: number; needs_work: number; good: number };
  maturity_delta?: number | null;
  recommendations: string[];
}

export interface CompanyDashboard {
  quarter: string;
  year: number;
  total_employees: number;
  total_goals: number;
  avg_smart_company: number;
  strategic_percent: number;
  alignment_dist?: Record<string, number>;
  smart_buckets?: { critical: number; needs_work: number; good: number };
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
  approval_status?: "pending" | "manager_approved" | "manager_rejected" | "approved" | "rejected";
  latest_manager_review?: DocumentReviewItem | null;
  latest_hr_review?: DocumentReviewItem | null;
}

export interface DocumentReviewItem {
  id: string;
  doc_id: string;
  reviewer_id: string | null;
  reviewer_role: string;
  stage: "manager" | "hr";
  verdict: "approved" | "rejected";
  comment: string | null;
  created_at: string;
}

export interface DocumentApprovalsResponse {
  doc_id: string;
  approval_status: "pending" | "manager_approved" | "manager_rejected" | "approved" | "rejected";
  latest_manager_review: DocumentReviewItem | null;
  latest_hr_review: DocumentReviewItem | null;
  history: DocumentReviewItem[];
}

export interface VndSearchResult {
  text: string;
  doc_title: string | null;
  doc_type: string | null;
  doc_id: string | null;
  relevance: number;
}

export interface AiLogItem {
  ts: string;
  event: string;
  payload: Record<string, unknown>;
}

// ── API-объект ────────────────────────────────────────────────────────────────

export const api = {
  auth: {
    bootstrap: () => bootstrapAuthToken(),

    impersonate: async (role: string, employeeId?: string | null) => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(ROLE_STORAGE_KEY, role);
      }
      if (role === "hr") {
        writeStoredEmployeeId(role, null);
      } else {
        writeStoredEmployeeId(role, employeeId ?? null);
      }
      clearStoredAuthToken(role);
      await bootstrapAuthToken(true, { role, employeeId: role === "hr" ? null : (employeeId ?? null) });
    },

    getStoredEmployeeId: (role: string) => readStoredEmployeeId(role),

    options: () => req<ImpersonationOptionsResponse>("/auth/options"),

    whoami: () =>
      req<{ actor: { role: string; employee_id: string | null; full_name?: string | null } }>("/auth/whoami"),
  },

  /** Оценка целей */
  evaluate: {
    goal: (data: EvaluateGoalRequest) =>
      req<EvaluateGoalResponse>("/evaluate/goal", { method: "POST", body: JSON.stringify(data) }),

    existingGoal: (goalId: string) =>
      req<EvaluateGoalResponse>(`/evaluate/goal/${goalId}`, { method: "POST" }),

    batch: (data: BatchEvaluateRequest) =>
      req<BatchEvaluateResponse>("/evaluate/batch", { method: "POST", body: JSON.stringify(data) }),

    backfill: () =>
      req<{ processed: number; failed: number; total_without_eval: number }>("/evaluate/backfill", { method: "POST" }),
  },

  /** Генерация и переформулировка */
  generate: {
    goals: (data: GenerateGoalsRequest) =>
      req<GenerateGoalsResponse>("/generate/goals", { method: "POST", body: JSON.stringify(data) }),

    accept: (data: AcceptGoalRequest) =>
      req<AcceptGoalResponse>("/generate/accept", { method: "POST", body: JSON.stringify(data) }),

    reject: (data: RejectGoalRequest) =>
      req<RejectGoalResponse>("/generate/reject", { method: "POST", body: JSON.stringify(data) }),

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
    }) =>
      req<GoalItem>("/goals/", { method: "POST", body: JSON.stringify(data) }),

    updateStatus: (goalId: string, status: string, reviewer_comment?: string) =>
      req<GoalItem>(`/goals/${goalId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status_code: status, status, reviewer_comment }),
      }),

    delete: (goalId: string) =>
      req<void>(`/goals/${goalId}`, { method: "DELETE" }),

    events: (goalId: string) =>
      req<Array<{
        id: string;
        event_type: string;
        old_status: string | null;
        new_status: string | null;
        old_text: string | null;
        new_text: string | null;
        created_at: string | null;
      }>>(`/goals/${goalId}/events`),
  },

  /** Сотрудники */
  employees: {
    list: () => req<Employee[]>("/employees/"),

    get: (employeeId: string) => req<EmployeeDetail>(`/employees/${employeeId}`),

    goals: (employeeId: string, params?: { quarter?: string; year?: number }) => {
      const qs = new URLSearchParams();
      if (params?.quarter) qs.set("quarter", params.quarter);
      if (params?.year) qs.set("year", String(params.year));
      const q = qs.toString();
      return req<GoalItem[]>(`/employees/${employeeId}/goals${q ? `?${q}` : ""}`);
    },

    managerGoals: (employeeId: string, quarter: string, year: number) =>
      req<ManagerGoal[]>(`/employees/${employeeId}/manager-goals?quarter=${quarter}&year=${year}`),

    alerts: (employeeId: string) => req<AlertItem[]>(`/employees/${employeeId}/alerts`),

    markAlertRead: (employeeId: string, alertId: string) =>
      req<void>(`/employees/${employeeId}/alerts/${alertId}/read`, { method: "PATCH" }),
  },

  /** Документы */
  documents: {
    list: (params?: { doc_type?: string; department?: string; is_active?: boolean }) => {
      const qs = new URLSearchParams();
      if (params?.doc_type) qs.set("doc_type", params.doc_type);
      if (params?.department) qs.set("department", params.department);
      if (params?.is_active !== undefined) qs.set("is_active", String(params.is_active));
      const q = qs.toString();
      return req<DocumentItem[]>(`/documents/${q ? `?${q}` : ""}`);
    },

    get: (docId: string) => req<DocumentItem & { content?: string }>(`/documents/${docId}`),

    search: (q: string, n = 5) =>
      req<{ query: string; results: VndSearchResult[] }>(`/documents/search?q=${encodeURIComponent(q)}&n=${n}`),

    approvals: (docId: string) =>
      req<DocumentApprovalsResponse>(`/documents/${docId}/approvals`),

    submitApproval: (docId: string, payload: { verdict: "approved" | "rejected"; comment?: string }) =>
      req<{ approval_status: string; is_active: boolean; review: DocumentReviewItem }>(
        `/documents/${docId}/approvals`,
        { method: "POST", body: JSON.stringify(payload) },
      ),
  },

  /** Аналитика */
  analytics: {
    company: (quarter: string, year: number) =>
      req<CompanyDashboard>(`/analytics/company?quarter=${quarter}&year=${year}`),

    refresh: (quarter: string, year: number) =>
      req<{ refreshed: number }>(`/analytics/refresh?quarter=${quarter}&year=${year}`, { method: "POST" }),
  },

  /** AI trace logs */
  ai: {
    logs: (params?: { limit?: number; event?: string }) => {
      const qs = new URLSearchParams();
      if (params?.limit) qs.set("limit", String(params.limit));
      if (params?.event) qs.set("event", params.event);
      const q = qs.toString();
      return req<{ items: AiLogItem[] }>(`/ai/logs/${q ? `?${q}` : ""}`);
    },
  },
};

// ── UI helpers ───────────────────────────────────────────────────────────────

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

  const apiStatus = g.status_code ?? g.status;

  // Маппинг статусов API → UI
  const statusMap: Record<string, "draft" | "review" | "approved" | "rejected"> = {
    draft: "draft",
    pending: "review",
    pending_approval: "review",
    submitted: "review",
    approved: "approved",
    active: "approved",
    in_progress: "approved",
    done: "approved",
    rejected: "rejected",
    cancelled: "rejected",
    overdue: "rejected",
    archived: "rejected",
  };

  return {
    id: g.id,
    employeeName: g.employee_name ?? "Сотрудник",
    position: g.position ?? "Должность",
    department: g.department ?? "Подразделение",
    text: g.goal_text ?? g.title,
    status: statusMap[apiStatus] ?? "draft",
    smartIndex: g.smart_index ?? 0.5,
    smartScores: scoreEntries,
    hasScores: !!g.scores,
    linkType: (g.alignment_level ?? "operational") as "strategic" | "functional" | "operational",
    quarter: g.quarter ? `${g.quarter} ${g.year ?? ""}`.trim() : "—",
    weight: g.weight ?? 0,
    goalType: (g.goal_type ?? undefined) as "activity" | "output" | "impact" | undefined,
    source: g.alignment_source ?? undefined,
  };
}

/** Парсит строку вида "Q2 2026" или "Q2" → возвращает { quarter: "Q2", year } */
export function parseQuarter(raw: string): { quarter: string; year: number } {
  const parts = raw.trim().split(/\s+/);
  const q = parts[0]?.toUpperCase() ?? "Q1";
  const defaultYear = getCurrentQuarterYear().year;
  const y = parseInt(parts[1] ?? "", 10) || defaultYear;
  return { quarter: q, year: y };
}
