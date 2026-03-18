import { useNavigate } from "react-router-dom";
import { motion, type Variants } from "framer-motion";
import {
  ArrowRight,
  Sparkles,
  BarChart3,
  Shield,
  Target,
  Moon,
  Sun,
} from "lucide-react";

import IdentitySwitcher from "@/components/IdentitySwitcher";
import { useTheme } from "@/context/ThemeContext";

const mvpBlocks = [
  {
    icon: Target,
    title: "Цели с бизнес-связкой",
    note: "Каждая цель получает источник из ВНД/KPI и уровень связки: strategic, functional или operational.",
  },
  {
    icon: Sparkles,
    title: "RAG + LLM конвейер",
    note: "Документы индексируются, извлекаются релевантные фрагменты, затем модель генерирует и перепроверяет цели.",
  },
  {
    icon: Shield,
    title: "Контроль качества набора",
    note: "Система валидирует состав целей: 3–5 на период, суммарный вес 100%, дубликаты и достижимость.",
  },
  {
    icon: BarChart3,
    title: "Дашборд зрелости подразделения",
    note: "Агрегация SMART-оценок, типов целей и уровня стратегической связки по командам и кварталам.",
  },
];

const heroVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

const subVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut", delay: 0.15 } },
};

const ctaVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut", delay: 0.28 } },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, delay: 0.1 + i * 0.08, ease: "easeOut" },
  }),
};

export default function LandingPage() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  return (
    <div
      className="landing-shell min-h-screen"
      style={{ fontFamily: '"Space Grotesk", "Manrope", system-ui, sans-serif' }}
    >
      <div className="landing-glow landing-glow-a" />
      <div className="landing-glow landing-glow-b" />
      <div className="landing-grid" />
      <div className="landing-dots" />

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-900/08 bg-white/70 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/70">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          {/* Left: empty — logo removed */}
          <div />

          <div className="flex items-center gap-3">
            <span className="hidden rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 sm:inline-flex">
              MVP · Hackathon 2026
            </span>
            <button
              onClick={toggleTheme}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white/85 text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/85 dark:text-slate-200 dark:hover:bg-slate-900"
              aria-label="Переключить тему"
              type="button"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <IdentitySwitcher variant="landing" />
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-6">
        <section className="pb-14 pt-16 md:pb-20 md:pt-24 text-center">
          {/* Headline */}
          <motion.h1
            variants={heroVariants}
            initial="hidden"
            animate="visible"
            className="mx-auto max-w-5xl text-balance text-[clamp(2.6rem,6.2vw,5rem)] font-bold leading-[1.04] tracking-[-0.035em]"
          >
            <span className="text-slate-900 dark:text-slate-50">
              Цели сотрудников,
            </span>
            <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-indigo-500 to-violet-500">
              связанные со стратегией
            </span>
          </motion.h1>

          <motion.p
            variants={subVariants}
            initial="hidden"
            animate="visible"
            className="mx-auto mt-8 max-w-2xl text-balance text-xl leading-relaxed text-slate-600 dark:text-slate-300 md:text-2xl"
          >
            GoalAI связывает цели сотрудников с ВНД и KPI в одном потоке: генерация, SMART-оценка, каскадирование и аналитика по подразделениям.
          </motion.p>

          <motion.div
            variants={ctaVariants}
            initial="hidden"
            animate="visible"
            className="mt-10 flex flex-wrap items-center justify-center gap-3"
          >
            <button
              onClick={() => navigate("/hr")}
              className="relative inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 shadow-[0_4px_20px_rgba(30,50,120,0.22)] hover:shadow-[0_6px_28px_rgba(30,50,120,0.32)] dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
            >
              Перейти в HR кабинет
              <ArrowRight className="h-4 w-4" />
            </button>
            <IdentitySwitcher variant="landing" />
          </motion.div>
        </section>

        <section id="landing-metrics" className="pb-14">
          <div className="landing-panel p-5 md:p-8">
            <div className="mb-5">
              <h2 className="text-base font-medium tracking-wide text-slate-400">
                Ключевые функции
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {mvpBlocks.map((item, i) => (
                <motion.article
                  key={item.title}
                  custom={i}
                  variants={cardVariants}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, amount: 0.3 }}
                  whileHover={{ scale: 1.02, rotateX: -1, rotateY: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  style={{ transformPerspective: 1000 }}
                  className="landing-metric-card cursor-default"
                >
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 rounded-lg border border-blue-100 bg-blue-50 p-2 dark:border-sky-500/20 dark:bg-sky-500/10">
                      <item.icon className="h-4 w-4 text-blue-500 dark:text-sky-300" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold tracking-[0.01em] text-slate-800 dark:text-slate-100 md:text-base">{item.title}</p>
                      <p className="mt-2 text-[14px] leading-relaxed text-slate-500 dark:text-slate-300">{item.note}</p>
                    </div>
                  </div>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        <footer className="pb-10 text-center text-xs tracking-[0.08em] text-slate-400 dark:text-slate-500">
          GoalAI Platform · AI for Performance Management · 2026
        </footer>
      </main>
    </div>
  );
}
