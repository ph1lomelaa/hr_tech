import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type Role = "hr" | "manager" | "employee";

const ROLE_STORAGE_KEY = "goalai_role";

type RoleProfile = {
  label: string;
  name: string;
  title: string;
  initials: string;
};

const roleProfiles: Record<Role, RoleProfile> = {
  hr: {
    label: "HR Директор",
    name: "Анна Иванова",
    title: "HR Директор",
    initials: "АИ",
  },
  manager: {
    label: "Руководитель",
    name: "Васильев Игорь",
    title: "Руководитель отдела продаж",
    initials: "ВИ",
  },
  employee: {
    label: "Сотрудник",
    name: "Сидорова Мария",
    title: "HR Менеджер",
    initials: "СМ",
  },
};

type RoleContextValue = {
  role: Role;
  setRole: (role: Role) => void;
  profile: RoleProfile;
};

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [role, setRoleState] = useState<Role>(() => {
    if (typeof window === "undefined") return "hr";
    try {
      const stored = window.localStorage.getItem(ROLE_STORAGE_KEY) as Role | null;
      if (stored === "employee" || stored === "hr" || stored === "manager") return stored;
    } catch {
      // Ignore storage access errors and continue with default role.
    }
    return "hr";
  });

  const setRole = useCallback((newRole: Role) => {
    setRoleState((prevRole) => {
      if (newRole === prevRole) return prevRole;
      queryClient.clear();
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(ROLE_STORAGE_KEY, newRole);
        } catch {
          // Ignore storage access errors.
        }
      }
      if (typeof document !== "undefined") {
        document.documentElement.setAttribute("data-role", newRole);
      }
      return newRole;
    });
  }, [queryClient]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(ROLE_STORAGE_KEY, role);
      } catch {
        // Ignore storage access errors.
      }
    }
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-role", role);
    }
    void api.auth.bootstrap().catch(() => {
      // Will be surfaced by concrete API calls if auth bootstrap is invalid.
    });
  }, [role]);

  const value = useMemo(
    () => ({
      role,
      setRole,
      profile: roleProfiles[role],
    }),
    [role, setRole]
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) {
    throw new Error("useRole must be used within RoleProvider");
  }
  return ctx;
}
