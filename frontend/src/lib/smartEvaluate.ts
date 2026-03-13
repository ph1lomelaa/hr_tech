export type SmartEvalResult = {
  smartIndex: number;
  scores: { key: string; label: string; value: number }[];
  goalType: "activity" | "output" | "impact";
  suggestedMetric: string;
  suggestedDeadline: string;
  weakCriteria: string[];
  recommendations: string[];
  rewrite: string;
};

export function evaluateSmart(text: string): SmartEvalResult {
  const t = text.toLowerCase();
  const hasNumber = /\d+/.test(t);
  const hasPercent = /%|процент|доля/.test(t);
  const hasDate = /\d{4}|к \d|до \d|квартал|q\d|июн|мар|дек|сент|апр|май|янв|фев|окт|ноя/.test(t);
  const hasAction = /повысить|снизить|разработать|внедрить|сократить|увеличить|обеспечить|запустить|создать|достичь|улучшить/.test(t);
  const hasContext = /за счёт|через|с помощью|путём|за счет/.test(t);
  const wordCount = text.trim().split(/\s+/).length;

  const S = hasAction ? (wordCount > 8 ? 0.85 : 0.6) : 0.35;
  const M = hasNumber || hasPercent ? 0.88 : hasDate ? 0.5 : 0.2;
  const A = wordCount > 5 ? 0.75 : 0.5;
  const R = hasContext ? 0.9 : 0.65;
  const Tv = hasDate ? 0.85 : 0.15;

  const smartIndex = parseFloat(((S + M + A + R + Tv) / 5).toFixed(2));

  // Classify goal type
  const isImpact = /eNPS|вовлечённость|удовлетворённость|доход|прибыль|выручка|nps|retention/.test(t);
  const isActivity = hasAction && !hasNumber && !hasPercent;
  const goalType: "activity" | "output" | "impact" = isImpact ? "impact" : isActivity ? "activity" : "output";

  // Suggest metric
  let suggestedMetric = "";
  if (hasPercent || hasNumber) {
    const match = text.match(/(\d+[\s,.]?\d*\s*%?[\s—–-]+\d+[\s,.]?\d*\s*%?)/);
    suggestedMetric = match ? match[0].trim() : "Числовой показатель из текста цели";
  } else {
    suggestedMetric = "Добавьте числовой KPI (%, количество, срок)";
  }

  // Suggest deadline
  const datePatterns = [
    text.match(/к\s+(\d{1,2}[.\s]\d{2}[.\s]\d{4})/),
    text.match(/(\d{4}-\d{2}-\d{2})/),
    text.match(/к\s+(концу|Q[1-4])\s+(\d{4})/),
  ];
  const foundDate = datePatterns.find(Boolean);
  let suggestedDeadline = "2026-06-30";
  if (foundDate) {
    const raw = foundDate[1] ?? "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) suggestedDeadline = raw;
    else if (/Q1/.test(raw)) suggestedDeadline = "2026-03-31";
    else if (/Q2/.test(raw)) suggestedDeadline = "2026-06-30";
    else if (/Q3/.test(raw)) suggestedDeadline = "2026-09-30";
    else if (/Q4/.test(raw)) suggestedDeadline = "2026-12-31";
  }

  const weakCriteria: string[] = [];
  if (S < 0.6) weakCriteria.push("Specific");
  if (M < 0.6) weakCriteria.push("Measurable");
  if (A < 0.6) weakCriteria.push("Achievable");
  if (R < 0.6) weakCriteria.push("Relevant");
  if (Tv < 0.6) weakCriteria.push("Time-bound");

  const recommendations: string[] = [];
  if (M < 0.6) recommendations.push("Добавьте измеримый показатель (%, количество, срок)");
  if (Tv < 0.6) recommendations.push("Уточните конкретный срок выполнения");
  if (S < 0.6) recommendations.push("Опишите конкретный ожидаемый результат");
  if (!hasContext) recommendations.push("Укажите механизм достижения (за счёт / через)");

  const rewrite = smartIndex < 0.7
    ? `${text.trim()} — добавить числовой KPI и срок к ${suggestedDeadline}`
    : text.trim();

  return {
    smartIndex,
    scores: [
      { key: "S", label: "Specific", value: S },
      { key: "M", label: "Measurable", value: M },
      { key: "A", label: "Achievable", value: A },
      { key: "R", label: "Relevant", value: R },
      { key: "T", label: "Time-bound", value: Tv },
    ],
    goalType,
    suggestedMetric,
    suggestedDeadline,
    weakCriteria,
    recommendations,
    rewrite,
  };
}
