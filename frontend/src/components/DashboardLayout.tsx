import { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Target,
  Sparkles,
  FileText,
  Users,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Bell,
  Moon,
  Sun,
  MessageSquare,
  LogOut,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRole } from "@/context/RoleContext";
import { useTheme } from "@/context/ThemeContext";
import { api } from "@/lib/api";
import { useCurrentEmployee } from "@/hooks/use-current-employee";
import type { Role } from "@/context/RoleContext";
import IdentitySwitcher from "@/components/IdentitySwitcher";

const hrNavGroups = [
  [
    { icon: BarChart3, label: "Аналитика", path: "/hr/analytics" },
    { icon: LayoutDashboard, label: "Дашборд", path: "/hr" },
  ],
  [
    { icon: Target, label: "Цели", path: "/hr/goals" },
    { icon: Sparkles, label: "AI Генерация", path: "/hr/generate" },
  ],
  [
    { icon: FileText, label: "Нормативная база", path: "/hr/documents" },
    { icon: Users, label: "Сотрудники", path: "/hr/employees" },
  ],
];

const managerNavGroups = [
  [
    { icon: LayoutDashboard, label: "Дашборд", path: "/manager" },
  ],
  [
    { icon: Users, label: "Цели команды", path: "/manager/team-goals" },
    { icon: Target, label: "Мои цели", path: "/manager/my-goals" },
    { icon: Sparkles, label: "AI Генерация", path: "/manager/generate" },
  ],
  [
    { icon: Users, label: "Сотрудники", path: "/manager/employees" },
    { icon: MessageSquare, label: "Обратная связь", path: "/manager/feedback" },
    { icon: FileText, label: "Нормативная база", path: "/manager/documents" },
  ],
];

const employeeNavGroups = [
  [
    { icon: LayoutDashboard, label: "Обзор", path: "/employee" },
  ],
  [
    { icon: Target, label: "Мои цели", path: "/employee/goals" },
    { icon: Sparkles, label: "AI Подбор целей", path: "/employee/generate" },
  ],
  [
    { icon: FileText, label: "Нормативная база", path: "/employee/documents" },
    { icon: MessageSquare, label: "Обратная связь", path: "/employee/feedback" },
  ],
];

const roleHomePaths: Record<Role, string> = {
  hr: "/hr",
  manager: "/manager",
  employee: "/employee",
};

function roleFromPath(pathname: string): Role | null {
  if (pathname.startsWith("/employee")) return "employee";
  if (pathname.startsWith("/manager")) return "manager";
  if (pathname.startsWith("/hr")) return "hr";
  return null;
}

export default function DashboardLayout({ children }: { children?: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { role, setRole } = useRole();
  const { theme, toggleTheme } = useTheme();
  const { employeeId } = useCurrentEmployee();

  const navGroups =
    role === "employee" ? employeeNavGroups :
    role === "manager" ? managerNavGroups :
    hrNavGroups;

  const alertsQuery = useQuery({
    queryKey: ["alerts", role, employeeId],
    queryFn: () => api.employees.alerts(employeeId!),
    enabled: role !== "hr" && !!employeeId,
    staleTime: 30_000,
  });

  const alerts = useMemo(() => {
    if (role === "hr") return [];
    const raw = alertsQuery.data ?? [];
    const titleMap: Record<string, string> = {
      low_smart: "Низкий SMART",
      duplicate: "Возможный дубликат",
      weight_mismatch: "Сумма весов",
      too_few_goals: "Мало целей",
      too_many_goals: "Слишком много целей",
    };
    return raw.map((a) => ({
      id: a.id,
      severity: a.severity === "critical" ? "high" : "medium",
      title: titleMap[a.alert_type] ?? a.alert_type.replace(/_/g, " "),
      description: a.message,
    }));
  }, [alertsQuery.data, role]);

  const activeAlertCount = (alertsQuery.data ?? []).filter((a) => !a.is_read).length;

  const queryClient = useQueryClient();
  const markReadMutation = useMutation({
    mutationFn: (alertId: string) => api.employees.markAlertRead(employeeId!, alertId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alerts", role, employeeId] }),
  });

  const handleNotificationsOpen = (open: boolean) => {
    if (!open || !employeeId) return;
    const unread = (alertsQuery.data ?? []).filter((a) => !a.is_read);
    unread.forEach((a) => markReadMutation.mutate(a.id));
  };

  // Keep role context in sync with URL to avoid role switch race conditions.
  useEffect(() => {
    const urlRole = roleFromPath(location.pathname);
    if (urlRole && urlRole !== role) {
      setRole(urlRole);
    }
  }, [location.pathname, role, setRole]);

  const content = children ?? <Outlet />;

  return (
    <div className="app-shell flex h-screen overflow-hidden">
      <div className="app-shell-grid" />
      {/* Sidebar */}
      <aside
        className={`app-sidebar relative z-10 flex flex-col transition-all duration-300 ${
          collapsed ? "w-16" : "w-64"
        }`}
      >
        <div
          className={cn(
            "flex h-16 border-b border-sidebar-border px-4",
            collapsed ? "items-center justify-center" : "items-center",
          )}
        >
          <Link to={roleHomePaths[role]} className="block h-full w-full" aria-label="На главную" />
        </div>


        {/* Nav */}
        <nav className="flex-1 py-4 px-2 overflow-y-auto">
          {navGroups.map((group, gi) => (
            <div key={gi}>
              {gi > 0 && (
                <div className="h-px bg-sidebar-border/40 my-2 mx-1" />
              )}
              <div className="space-y-0.5">
                {group.map((item) => {
                  const active = location.pathname === item.path ||
                    (item.path !== "/hr" && item.path !== "/manager" && item.path !== "/employee" &&
                    location.pathname.startsWith(item.path));
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                        active
                          ? "bg-sidebar-accent text-primary"
                          : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                      }`}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary" />
                      )}
                      <item.icon className="w-5 h-5 shrink-0" />
                      {!collapsed && (
                        <span className="transition-opacity duration-200">{item.label}</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Collapse toggle */}
        <div className="p-2 border-t border-sidebar-border">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center justify-center w-full py-2 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="app-main flex-1 flex flex-col overflow-hidden transition-all duration-300">
        {/* Top bar */}
        <header className="app-topbar flex items-center justify-end gap-4 h-16 px-5 xl:px-6">
          <div className="flex items-center gap-3">
            <IdentitySwitcher />

            <button onClick={toggleTheme} className="p-2 rounded-lg border border-border/55 bg-muted/40 hover:bg-muted transition-colors" aria-label="Переключить тему">
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Notifications */}
            <DropdownMenu onOpenChange={handleNotificationsOpen}>
              <DropdownMenuTrigger asChild>
                <button className="relative p-2 rounded-lg hover:bg-muted transition-colors">
                  <Bell className="w-5 h-5 text-muted-foreground" />
                  {activeAlertCount > 0 && (
                    <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full bg-primary text-[10px] text-primary-foreground">
                      {activeAlertCount}
                    </span>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel>Уведомления</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {alerts.map((alert) => (
                  <DropdownMenuItem key={alert.id} className="flex flex-col items-start gap-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={
                        alert.severity === "high"
                          ? "bg-destructive/10 text-destructive"
                          : alert.severity === "medium"
                          ? "bg-warning/10 text-warning"
                          : "bg-muted text-muted-foreground"
                      }>
                        {alert.severity === "high" ? "Критично" : alert.severity === "medium" ? "Важно" : "Инфо"}
                      </Badge>
                      <span className="text-xs font-medium">{alert.title}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{alert.description}</span>
                  </DropdownMenuItem>
                ))}
                {alerts.length === 0 && (
                  <DropdownMenuItem className="text-xs text-muted-foreground">
                    Нет уведомлений
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Home link */}
            <Link
              to="/"
              className="p-2 rounded-lg border border-border/55 bg-muted/40 hover:bg-muted transition-colors"
              aria-label="На главную"
            >
              <LogOut className="w-4 h-4 text-muted-foreground" />
            </Link>
          </div>
        </header>

      {/* Content */}
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-[86rem] px-5 py-6 xl:px-6">{content}</div>
      </main>
      </div>
    </div>
  );
}
