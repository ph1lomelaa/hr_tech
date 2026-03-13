import { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Target,
  Sparkles,
  FileText,
  Users,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Search,
  Bell,
  Zap,
  Moon,
  Sun,
  UserCheck,
  MessageSquare,
  LogOut,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRole } from "@/context/RoleContext";
import { employeeAlerts, hrAlerts } from "@/data/mockAlerts";
import { managerAlerts } from "@/data/mockManager";
import { useTheme } from "@/context/ThemeContext";
import type { Role } from "@/context/RoleContext";

const hrNavItems = [
  { icon: LayoutDashboard, label: "Дашборд", path: "/hr" },
  { icon: Target, label: "Цели", path: "/hr/goals" },
  { icon: Sparkles, label: "AI Генерация", path: "/hr/generate" },
  { icon: FileText, label: "Нормативная база", path: "/hr/documents" },
  { icon: Users, label: "Сотрудники", path: "/hr/employees" },
  { icon: BarChart3, label: "Аналитика", path: "/hr/analytics" },
];

const managerNavItems = [
  { icon: LayoutDashboard, label: "Дашборд", path: "/manager" },
  { icon: Users, label: "Цели команды", path: "/manager/team-goals" },
  { icon: Target, label: "Мои цели", path: "/manager/my-goals" },
  { icon: Sparkles, label: "AI Генерация", path: "/manager/generate" },
  { icon: FileText, label: "Нормативная база", path: "/manager/documents" },
];

const employeeNavItems = [
  { icon: LayoutDashboard, label: "Обзор", path: "/employee" },
  { icon: Target, label: "Мои цели", path: "/employee/goals" },
  { icon: Sparkles, label: "AI Подбор целей", path: "/employee/generate" },
  { icon: FileText, label: "Нормативная база", path: "/employee/documents" },
  { icon: MessageSquare, label: "Обратная связь", path: "/employee/feedback" },
];

const roleColors: Record<Role, string> = {
  hr: "bg-emerald-500",
  manager: "bg-violet-500",
  employee: "bg-blue-500",
};

const roleHomePaths: Record<Role, string> = {
  hr: "/hr",
  manager: "/manager",
  employee: "/employee",
};

export default function DashboardLayout({ children }: { children?: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { role, setRole, profile } = useRole();
  const { theme, toggleTheme } = useTheme();

  const navItems =
    role === "employee" ? employeeNavItems :
    role === "manager" ? managerNavItems :
    hrNavItems;

  const alerts = useMemo(() =>
    role === "employee" ? employeeAlerts :
    role === "manager" ? managerAlerts :
    hrAlerts,
    [role]
  );
  const activeAlertCount = alerts.length;

  const handleRoleChange = (value: string) => {
    const nextRole = value as Role;
    if (nextRole === role) return;
    setRole(nextRole);
    navigate(roleHomePaths[nextRole]);
  };

  // Redirect if on wrong role's pages
  useEffect(() => {
    const path = location.pathname;
    if (role === "employee" && !path.startsWith("/employee")) {
      navigate("/employee");
    } else if (role === "manager" && !path.startsWith("/manager")) {
      navigate("/manager");
    } else if (role === "hr" && (path.startsWith("/employee") || path.startsWith("/manager"))) {
      navigate("/hr");
    }
  }, [role, location.pathname, navigate]);

  const content = children ?? <Outlet />;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside
        className={`flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-300 ${
          collapsed ? "w-16" : "w-64"
        }`}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-sidebar-border">
          <Link to={roleHomePaths[role]} className="flex items-center gap-3">
            <div className={`flex items-center justify-center w-8 h-8 rounded-lg ${roleColors[role]}`}>
              <Zap className="w-4 h-4 text-white" />
            </div>
            {!collapsed && (
              <span className="text-lg font-bold text-sidebar-accent-foreground tracking-tight">
                GoalAI
              </span>
            )}
          </Link>
        </div>

        {/* Role badge */}
        {!collapsed && (
          <div className="px-4 py-3 border-b border-sidebar-border">
            <div className={`text-xs font-medium px-2 py-1 rounded-md inline-flex items-center gap-1.5 ${
              role === "hr" ? "bg-emerald-500/10 text-emerald-600" :
              role === "manager" ? "bg-violet-500/10 text-violet-600" :
              "bg-blue-500/10 text-blue-600"
            }`}>
              <UserCheck className="w-3 h-3" />
              {profile.label}
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 py-4 px-2 space-y-1">
          {navItems.map((item) => {
            const active = location.pathname === item.path ||
              (item.path !== "/hr" && item.path !== "/manager" && item.path !== "/employee" &&
               location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? "bg-sidebar-accent text-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
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
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between h-16 px-6 border-b border-border bg-card/70 backdrop-blur-sm">
          <div className="relative w-80 hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Поиск целей, сотрудников..."
              className="pl-9 bg-muted/50 border-transparent focus:border-primary"
            />
          </div>
          <div className="flex items-center gap-3">
            {/* Role switcher — 3 buttons */}
            <div className="hidden sm:flex items-center gap-1 bg-muted/50 rounded-lg p-1">
              {(["hr", "manager", "employee"] as Role[]).map((r) => (
                <button
                  key={r}
                  onClick={() => handleRoleChange(r)}
                  className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
                    role === r
                      ? `${roleColors[r]} text-white shadow-sm`
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {r === "hr" ? "HR" : r === "manager" ? "Менеджер" : "Сотрудник"}
                </button>
              ))}
            </div>

            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg border border-border bg-muted/40 hover:bg-muted transition-colors"
              aria-label="Переключить тему"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Notifications */}
            <DropdownMenu>
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

            {/* User */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 hover:bg-muted rounded-lg px-2 py-1 transition-colors">
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className={`text-white text-xs font-semibold ${roleColors[role]}`}>
                      {profile.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden md:block text-left">
                    <p className="text-sm font-medium">{profile.name}</p>
                    <p className="text-xs text-muted-foreground">{profile.title}</p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="text-xs text-muted-foreground">{profile.label}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/" className="flex items-center gap-2 cursor-pointer">
                    <LogOut className="w-4 h-4" />
                    На главную
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-6">{content}</main>
      </div>
    </div>
  );
}
