import { motion, type Variants } from "framer-motion";
import { Sparkles } from "lucide-react";

const stats = [
  { value: "9 000+", label: "Целей в базе" },
  { value: "160", label: "Документов ВНД" },
  { value: "0.74", label: "Средний SMART" },
];

export function HeroSection() {
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
