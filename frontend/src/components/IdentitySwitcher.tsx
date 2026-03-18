import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ArrowRightLeft,
  Building2,
  Loader2,
  Search,
  ShieldCheck,
  User,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRole, type Role } from "@/context/RoleContext";
import { useCurrentEmployee } from "@/hooks/use-current-employee";
import { api, type ImpersonationCandidate } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";

type IdentitySwitcherProps = {
  variant?: "dashboard" | "landing";
};

const roleHomePaths: Record<Role, string> = {
  hr: "/hr",
  manager: "/manager",
  employee: "/employee",
};

const roleMeta: Record<Role, {
  label: string;
  shortLabel: string;
  description: string;
  icon: typeof ShieldCheck;
  badgeClassName: string;
}> = {
  hr: {
    label: "HR",
    shortLabel: "HR",
    description: "Полный обзор системы, аналитики и целей по всей компании.",
    icon: ShieldCheck,
    badgeClassName: "bg-emerald-500/12 text-emerald-700 border-emerald-500/25",
  },
  manager: {
    label: "Руководитель",
    shortLabel: "Менеджер",
    description: "Работа с целями команды, согласование и контроль покрытия.",
    icon: Users,
    badgeClassName: "bg-violet-500/12 text-violet-700 border-violet-500/25",
  },
  employee: {
    label: "Сотрудник",
    shortLabel: "Сотрудник",
    description: "Личный кабинет сотрудника: цели, документы и AI-подбор.",
    icon: User,
    badgeClassName: "bg-sky-500/12 text-sky-700 border-sky-500/25",
  },
};

function matchesSearch(employee: ImpersonationCandidate, query: string): boolean {
  if (!query) return true;
  const normalized = query.toLowerCase();
  return [
    employee.full_name,
    employee.position ?? "",
    employee.department ?? "",
  ].some((value) => value.toLowerCase().includes(normalized));
}

export default function IdentitySwitcher({ variant = "dashboard" }: IdentitySwitcherProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { role, setRole } = useRole();
  const { employee, detail, employeeId } = useCurrentEmployee();

  const [open, setOpen] = useState(false);
  const [draftRole, setDraftRole] = useState<Role>(role);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(employeeId ?? "");
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");

  const { data: options, isLoading } = useQuery({
    queryKey: ["identity-switcher", "options"],
    queryFn: () => api.auth.options(),
    staleTime: 60_000,
  });

  const candidatePool = useMemo(() => {
    if (draftRole === "hr") return [];
    return [...(options?.roles[draftRole].employees ?? [])].sort((left, right) =>
      left.full_name.localeCompare(right.full_name, "ru"),
    );
  }, [draftRole, options]);

  const departmentOptions = useMemo(() => {
    const seen = new Map<string, { id: number | null; name: string }>();
    for (const candidate of candidatePool) {
      const name = candidate.department?.trim();
      if (!name || seen.has(name)) continue;
      seen.set(name, {
        id: candidate.department_id ?? null,
        name,
      });
    }
    return Array.from(seen.values()).sort((left, right) => left.name.localeCompare(right.name, "ru"));
  }, [candidatePool]);

  const visibleCandidates = useMemo(
    () => candidatePool.filter((item) => {
      const matchesDepartment = departmentFilter === "all" || item.department === departmentFilter;
      return matchesDepartment && matchesSearch(item, search);
    }),
    [candidatePool, departmentFilter, search],
  );

  const currentLabel = role === "hr"
    ? "Полный доступ HR"
    : (detail?.full_name ?? employee?.full_name ?? "Не выбран сотрудник");

  const currentSubtitle = role === "hr"
    ? "Все сотрудники и вся аналитика"
    : [detail?.position ?? employee?.position ?? null, detail?.department ?? employee?.department ?? null]
        .filter(Boolean)
        .join(" · ");

  useEffect(() => {
    if (!open) return;
    setDraftRole(role);
    setSearch("");
    setDepartmentFilter("all");
  }, [open, role]);

  useEffect(() => {
    if (!open) return;
    if (draftRole === "hr") {
      setSelectedEmployeeId("");
      return;
    }

    const storedEmployeeId = draftRole === role
      ? employeeId
      : api.auth.getStoredEmployeeId(draftRole);
    const fallbackId = candidatePool[0]?.id ?? "";
    const nextSelected = candidatePool.some((item) => item.id === storedEmployeeId)
      ? (storedEmployeeId ?? "")
      : fallbackId;
    setSelectedEmployeeId(nextSelected);
  }, [candidatePool, draftRole, employeeId, open, role]);

  useEffect(() => {
    if (!open || draftRole === "hr") return;
    if (visibleCandidates.length === 0) return;
    const selectedIsVisible = visibleCandidates.some((item) => item.id === selectedEmployeeId);
    if (!selectedIsVisible) {
      setSelectedEmployeeId(visibleCandidates[0].id);
    }
  }, [draftRole, open, selectedEmployeeId, visibleCandidates]);

  const selectedCandidate = visibleCandidates.find((item) => item.id === selectedEmployeeId)
    ?? candidatePool.find((item) => item.id === selectedEmployeeId)
    ?? null;

  const isCurrentActor = draftRole === role && (
    draftRole === "hr" || selectedEmployeeId === (employeeId ?? "")
  );

  const switchMutation = useMutation({
    mutationFn: async () => {
      await api.auth.impersonate(
        draftRole,
        draftRole === "hr" ? null : selectedEmployeeId,
      );
    },
    onSuccess: () => {
      queryClient.clear();
      setRole(draftRole);
      navigate(roleHomePaths[draftRole]);
      setOpen(false);
      toast({
        title: "Режим переключён",
        description: draftRole === "hr"
          ? "Открыт обзор HR."
          : `Открыт кабинет: ${selectedCandidate?.full_name ?? "сотрудник"}.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Не удалось переключить режим",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const avatarBg: Record<Role, string> = {
    hr:       "from-emerald-500 to-emerald-600",
    manager:  "from-violet-500 to-violet-600",
    employee: "from-sky-500 to-blue-600",
  };

  const avatarInitials = role === "hr"
    ? "HR"
    : currentLabel.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  const dashboardTrigger = (
    <button
      type="button"
      className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-muted/50 transition-colors text-left"
    >
      <div className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br shadow-sm",
        avatarBg[role],
      )}>
        <span className="text-[13px] font-bold text-white leading-none">{avatarInitials}</span>
      </div>
      <div className="min-w-0 hidden sm:block">
        <p className="truncate text-[0.88rem] font-semibold leading-tight text-foreground max-w-[13rem]">
          {currentLabel}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground/75">
          Сменить роль
        </p>
      </div>
    </button>
  );

  const landingTrigger = (
    <button
      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white/80 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-white hover:border-slate-300"
      type="button"
    >
      <ArrowRightLeft className="h-3.5 w-3.5 text-slate-500" />
      Войти как
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {variant === "landing" ? landingTrigger : dashboardTrigger}
      </DialogTrigger>
      <DialogContent className="h-[min(86vh,760px)] w-[min(96vw,1080px)] max-w-none overflow-hidden rounded-[1.35rem] border-border/80 bg-card p-0 shadow-[0_30px_80px_rgba(15,23,42,0.32)]">
        <div className="flex h-full min-h-0 flex-col overflow-y-auto md:grid md:grid-cols-[290px_minmax(0,1fr)] md:overflow-hidden">
          <div className="border-b border-border/80 bg-muted/80 p-6 md:min-h-0 md:overflow-y-auto md:border-b-0 md:border-r">
            <DialogHeader className="space-y-2 text-left">
              <DialogTitle className="text-[1.35rem] font-semibold tracking-tight">
                Войти как
              </DialogTitle>
              <DialogDescription className="text-[15px] leading-6 text-muted-foreground">
                Быстро переключайте роль и конкретного человека без выхода из системы.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-6 space-y-3">
              {(Object.keys(roleMeta) as Role[]).map((candidateRole) => {
                const Icon = roleMeta[candidateRole].icon;
                const active = draftRole === candidateRole;
                return (
                  <button
                    key={candidateRole}
                    type="button"
                    onClick={() => setDraftRole(candidateRole)}
                    className={cn(
                      "w-full rounded-[1.2rem] border px-4 py-4 text-left transition-all",
                      active
                        ? "border-primary/55 bg-primary/8 shadow-[0_12px_30px_rgba(15,23,42,0.08)]"
                        : "border-border/75 bg-card hover:border-primary/30 hover:bg-muted/40",
                    )}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-primary" />
                          <p className="text-[15px] font-semibold">{roleMeta[candidateRole].label}</p>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {roleMeta[candidateRole].description}
                        </p>
                      </div>
                      {active && (
                        <Badge variant="outline" className={roleMeta[candidateRole].badgeClassName}>
                          Активно
                        </Badge>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 rounded-[1.2rem] border border-border/75 bg-card p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Сейчас
              </p>
              <p className="mt-2 text-[15px] font-semibold leading-6">{currentLabel}</p>
              {currentSubtitle && (
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{currentSubtitle}</p>
              )}
            </div>
          </div>

          <div className="flex h-full min-h-0 flex-col bg-card p-6 md:overflow-hidden">
            {draftRole === "hr" ? (
              <div className="flex h-full min-h-0 flex-col justify-between overflow-y-auto rounded-[1.2rem] border border-border/75 bg-muted/35 p-5">
                <div>
                  <Badge variant="outline" className={roleMeta.hr.badgeClassName}>
                    HR доступ
                  </Badge>
                  <h3 className="mt-4 text-xl font-semibold tracking-tight">
                    Полный обзор платформы
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">
                    Этот режим не привязан к конкретному сотруднику: доступны цели по компании,
                    аналитика, документы и просмотр карточек сотрудников.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-[1.25rem] font-semibold tracking-tight">
                      Выберите {draftRole === "manager" ? "руководителя" : "сотрудника"}
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {visibleCandidates.length} из {candidatePool.length} доступно в этом режиме
                    </p>
                  </div>
                  <Badge variant="outline" className={roleMeta[draftRole].badgeClassName}>
                    {roleMeta[draftRole].shortLabel}
                  </Badge>
                </div>

                <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_250px]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Поиск по имени, должности или подразделению"
                      className="control-surface h-12 rounded-2xl pl-10 text-sm"
                    />
                  </div>
                  <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                    <SelectTrigger className="control-surface h-12 rounded-2xl text-sm">
                      <SelectValue placeholder="Все департаменты" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Все департаменты</SelectItem>
                      {departmentOptions.map((department) => (
                        <SelectItem key={department.name} value={department.name}>
                          {department.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="mt-5 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                  {visibleCandidates.map((candidate) => {
                    const active = candidate.id === selectedEmployeeId;
                    return (
                      <button
                        key={candidate.id}
                        type="button"
                        onClick={() => setSelectedEmployeeId(candidate.id)}
                        className={cn(
                          "w-full rounded-[1.2rem] border bg-card p-4 text-left transition-all",
                          active
                            ? "border-primary/55 bg-primary/8 shadow-[0_10px_28px_rgba(15,23,42,0.08)]"
                            : "border-border/75 hover:border-primary/30 hover:bg-muted/35",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-[15px] font-semibold leading-6">{candidate.full_name}</p>
                            <p className="mt-1 truncate text-sm leading-6 text-muted-foreground">
                              {candidate.position ?? "Должность не указана"}
                            </p>
                          </div>
                          {active && (
                            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                              Выбран
                            </Badge>
                          )}
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/25 px-3 py-1.5 text-xs text-muted-foreground">
                            <Building2 className="h-3.5 w-3.5" />
                            <span className="truncate">{candidate.department ?? "Подразделение не указано"}</span>
                          </span>
                        </div>
                      </button>
                    );
                  })}

                  {!isLoading && visibleCandidates.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-border/80 bg-muted/35 p-6 text-sm text-muted-foreground">
                      Ничего не найдено по текущему фильтру.
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="mt-4 shrink-0 flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-muted-foreground">
                {draftRole === "hr"
                  ? "После переключения откроется общий HR-кабинет."
                  : `После переключения откроется кабинет: ${selectedCandidate?.full_name ?? "выберите сотрудника"}.`}
              </div>
              <Button
                type="button"
                className="h-10 rounded-2xl px-5 text-sm font-semibold"
                disabled={switchMutation.isPending || draftRole !== "hr" && !selectedEmployeeId || isCurrentActor}
                onClick={() => switchMutation.mutate()}
              >
                {switchMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Переключаем...
                  </>
                ) : (
                  <>
                    <ArrowRightLeft className="mr-2 h-4 w-4" />
                    Переключить режим
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
