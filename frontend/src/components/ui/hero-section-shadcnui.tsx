import { motion, type Variants } from "framer-motion";
import { Sparkles, BarChart3, Target, Users, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useRole } from "@/context/RoleContext";
import type { Role } from "@/context/RoleContext";

const roleEntries = [
  { role: "hr" as Role, label: "HR Директор", path: "/hr", color: "from-emerald-500 to-emerald-600", dot: "bg-emerald-400", icon: BarChart3 },
  { role: "manager" as Role, label: "Руководитель", path: "/manager", color: "from-violet-500 to-violet-600", dot: "bg-violet-400", icon: Users },
  { role: "employee" as Role, label: "Сотрудник", path: "/employee", color: "from-blue-500 to-blue-600", dot: "bg-blue-400", icon: Target },
];

const stats = [
  { value: "9 000+", label: "Целей в базе" },
  { value: "160", label: "Документов ВНД" },
  { value: "0.74", label: "Средний SMART" },
];

export function HeroSection() {
  const navigate = useNavigate();
  const { setRole } = useRole();

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.12, delayChildren: 0.1 },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 24 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.55, ease: "easeOut" },
    },
  };

  const cardVariants: Variants = {
    hidden: { opacity: 0, y: 30, scale: 0.96 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { duration: 0.5, ease: "easeOut", delay: 0.5 + i * 0.1 },
    }),
  };

  const enterAs = (entry: typeof roleEntries[0]) => {
    setRole(entry.role);
    navigate(entry.path);
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="flex flex-col items-center justify-center px-4 py-20 text-center"
    >
      {/* Badge */}
      <motion.div variants={itemVariants} className="mb-5">
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-4 py-1.5 text-sm font-medium text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          AI-модуль управления эффективностью персонала
        </span>
      </motion.div>

      {/* Headline */}
      <motion.h1
        variants={itemVariants}
        className="mb-5 text-5xl font-bold tracking-tight leading-tight md:text-6xl max-w-3xl"
      >
        Цели, которые{" "}
        <span className="gradient-text">действительно</span>
        <br />
        связаны со стратегией
      </motion.h1>

      {/* Subtext */}
      <motion.p
        variants={itemVariants}
        className="mb-10 max-w-2xl text-lg text-muted-foreground leading-relaxed"
      >
        GoalAI автоматически оценивает качество целей по методологии SMART,
        генерирует стратегически связанные цели из ВНД и обеспечивает
        каскадирование от руководителей к командам.
      </motion.p>

      {/* Role cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-3xl mb-12">
        {roleEntries.map((entry, i) => {
          const Icon = entry.icon;
          return (
            <motion.button
              key={entry.role}
              custom={i}
              variants={cardVariants}
              initial="hidden"
              animate="visible"
              whileHover={{ scale: 1.03, y: -4 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => enterAs(entry)}
              className={`relative overflow-hidden glass-card p-5 text-left cursor-pointer group transition-shadow hover:shadow-xl`}
            >
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${entry.color} flex items-center justify-center mb-3`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              <p className="text-sm font-semibold">{entry.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Войти в кабинет</p>
              <ArrowRight className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-200" />
            </motion.button>
          );
        })}
      </div>

      {/* Stats */}
      <motion.div
        variants={itemVariants}
        className="flex items-center gap-8 text-sm text-muted-foreground"
      >
        {stats.map((stat, i) => (
          <div key={stat.label} className="flex items-center gap-8">
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">{stat.value}</div>
              <div>{stat.label}</div>
            </div>
            {i < stats.length - 1 && (
              <div className="h-8 w-px bg-border" />
            )}
          </div>
        ))}
      </motion.div>
    </motion.div>
  );
}
