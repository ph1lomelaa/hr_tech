import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRole } from "@/context/RoleContext";
import { api, type Employee, type EmployeeDetail } from "@/lib/api";

type UseCurrentEmployeeResult = {
  employee: Employee | null;
  detail: EmployeeDetail | null;
  employeeId: string | null;
  isLoading: boolean;
  error: unknown;
};

function normalizeName(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function employeeStorageKey(role: string): string {
  return `goalai_employee_id_${role}`;
}

function readStoredEmployeeId(role: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(employeeStorageKey(role));
  } catch {
    return null;
  }
}

function writeStoredEmployeeId(role: string, employeeId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (employeeId) {
      window.localStorage.setItem(employeeStorageKey(role), employeeId);
    } else {
      window.localStorage.removeItem(employeeStorageKey(role));
    }
  } catch {
    // Ignore storage errors.
  }
}

export function useCurrentEmployee(): UseCurrentEmployeeResult {
  const { profile, role } = useRole();

  const employeesQuery = useQuery({
    queryKey: ["employees", role],
    queryFn: () => api.employees.list(),
    staleTime: 60_000,
  });

  const employee = useMemo(() => {
    const list = employeesQuery.data ?? [];
    if (list.length === 0) return null;

    const storedId = readStoredEmployeeId(role);
    if (storedId) {
      const byStoredId = list.find((e) => e.id === storedId);
      if (byStoredId) {
        writeStoredEmployeeId(role, byStoredId.id);
        return byStoredId;
      }
    }

    const profileName = normalizeName(profile.name);
    const byName = list.find(
      (e) => normalizeName(e.full_name) === profileName
    );
    if (byName) {
      writeStoredEmployeeId(role, byName.id);
      return byName;
    }

    const managerIds = new Set(
      list.map((e) => e.manager_id).filter((id): id is string => typeof id === "string" && id.length > 0)
    );
    if (role === "manager") {
      const managerCandidate = list.find((e) => managerIds.has(e.id));
      if (managerCandidate) {
        writeStoredEmployeeId(role, managerCandidate.id);
        return managerCandidate;
      }
    }
    if (role === "employee") {
      const employeeCandidate = list.find((e) => !managerIds.has(e.id));
      if (employeeCandidate) {
        writeStoredEmployeeId(role, employeeCandidate.id);
        return employeeCandidate;
      }
    }

    const fallback = list.find((e) => typeof e.id === "string" && e.id.length > 0) ?? null;
    if (fallback) {
      writeStoredEmployeeId(role, fallback.id);
    }
    return fallback;
  }, [employeesQuery.data, profile.name, role]);

  const detailQuery = useQuery({
    queryKey: ["employee", role, employee?.id],
    queryFn: () => api.employees.get(employee!.id),
    enabled: !!employee?.id,
    staleTime: 60_000,
  });

  return {
    employee,
    detail: detailQuery.data ?? null,
    employeeId: employee?.id ?? null,
    isLoading: employeesQuery.isLoading || detailQuery.isLoading,
    error: employeesQuery.error ?? detailQuery.error,
  };
}
