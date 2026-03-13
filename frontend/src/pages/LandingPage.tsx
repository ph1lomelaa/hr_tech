import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { HeroSection } from "@/components/ui/hero-section-shadcnui";
import { useRole } from "@/context/RoleContext";
import { useTheme } from "@/context/ThemeContext";
import { motion, type Variants } from "framer-motion";
import {
  Moon,
  Sun,
  Sparkles,
  Target,
  LineChart,
  Shield,
  Zap,
  ChevronDown,
} from "lucide-react";
import type { Role } from "@/context/RoleContext";

const roleEntries = [
  { role: "hr" as Role, label: "HR Директор", path: "/hr", dot: "bg-emerald-500" },
  { role: "manager" as Role, label: "Руководитель", path: "/manager", dot: "bg-violet-500" },
  { role: "employee" as Role, label: "Сотрудник", path: "/employee", dot: "bg-blue-500" },
];

const features = [
  {
    icon: Sparkles,
    title: "SMART-оценка и AI рекомендации",
    description: "Автоматическая проверка по 5 критериям, индикаторы слабых мест и предложение переформулировки.",
  },
  {
    icon: Target,
    title: "Генерация целей из ВНД",
    description: "RAG-поиск по нормативной базе, цитирование источников, привязка к KPI и стратегии.",
  },
  {
    icon: LineChart,
    title: "Аналитика и дашборды",
    description: "Индекс зрелости целеполагания по командам, динамика SMART, структура набора целей.",
  },
  {
    icon: Shield,
    title: "Контроль и согласования",
    description: "Флоу утверждения целей, версионирование, история изменений и уведомления.",
  },
];

const featureVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: "easeOut", delay: i * 0.08 },
  }),
};

export default function LandingPage() {
  const navigate = useNavigate();
  const { setRole } = useRole();
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  const enterAs = (entry: typeof roleEntries[0]) => {
    setRole(entry.role);
    navigate(entry.path);
    setMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <p className="text-sm font-bold tracking-tight">GoalAI Platform</p>
              <p className="text-[10px] text-muted-foreground leading-none mt-0.5">Performance Management</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-xs hidden sm:flex">v1.0 · Хакатон 2026</Badge>
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg border border-border bg-muted/40 hover:bg-muted transition-colors"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                Войти <ChevronDown className={`w-3.5 h-3.5 transition-transform ${menuOpen ? "rotate-180" : ""}`} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-44 rounded-xl border border-border bg-background shadow-lg overflow-hidden z-50">
                  {roleEntries.map((entry) => (
                    <button
                      key={entry.role}
                      onClick={() => enterAs(entry)}
                      className="w-full flex items-center gap-2.5 px-4 py-3 text-sm hover:bg-muted/60 transition-colors text-left"
                    >
                      <div className={`w-2 h-2 rounded-full shrink-0 ${entry.dot}`} />
                      {entry.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6">

        {/* Hero — анимированный */}
        <HeroSection />

        {/* Features */}
        <section className="space-y-6 py-16">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center space-y-2"
          >
            <h2 className="text-2xl font-bold">Ключевые возможности</h2>
            <p className="text-muted-foreground text-sm">AI-слой поверх системы управления целями</p>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                custom={i}
                variants={featureVariants}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                className="glass-card p-6 flex gap-4"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <f.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">{f.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{f.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center text-xs text-muted-foreground pb-10">
          <p>GoalAI Platform · Хакатон «Внедрение ИИ в HR-процессы» 2026</p>
        </footer>
      </main>
    </div>
  );
}
