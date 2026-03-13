import { createContext, useContext, useEffect, useMemo, useState } from "react";

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
  const [role, setRoleState] = useState<Role>(() => {
    if (typeof window === "undefined") return "hr";
    const stored = window.localStorage.getItem(ROLE_STORAGE_KEY) as Role | null;
    if (stored === "employee" || stored === "hr" || stored === "manager") return stored;
    return "hr";
  });

  const setRole = (newRole: Role) => {
    setRoleState(newRole);
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-role", newRole);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ROLE_STORAGE_KEY, role);
    }
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-role", role);
    }
  }, [role]);

  const value = useMemo(
    () => ({
      role,
      setRole,
      profile: roleProfiles[role],
    }),
    [role]
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
