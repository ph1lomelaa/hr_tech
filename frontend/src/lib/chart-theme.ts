import React from "react";

export const getTooltipStyle = (): React.CSSProperties => ({
  borderRadius: 12,
  border: "1px solid hsl(var(--tooltip-border))",
  fontSize: 12,
  background: "hsl(var(--tooltip-bg) / 0.97)",
  color: "hsl(var(--tooltip-fg))",
  backdropFilter: "blur(8px)",
  boxShadow: "0 8px 24px hsl(var(--background) / 0.3)",
  padding: "8px 12px",
});

export const CHART_GRID_COLOR = "hsl(var(--border) / 0.3)";
export const CHART_AXIS_COLOR = "hsl(var(--muted-foreground) / 0.6)";

export const SMART_COLORS = {
  S: { bar: "hsl(142,71%,45%)", bg: "hsl(142,71%,45%,0.15)", hsl: "142 71% 45%" },
  M: { bar: "hsl(210,100%,52%)", bg: "hsl(210,100%,52%,0.15)", hsl: "210 100% 52%" },
  A: { bar: "hsl(38,92%,50%)", bg: "hsl(38,92%,50%,0.15)", hsl: "38 92% 50%" },
  R: { bar: "hsl(280,65%,55%)", bg: "hsl(280,65%,55%,0.15)", hsl: "280 65% 55%" },
  T: { bar: "hsl(0,72%,51%)", bg: "hsl(0,72%,51%,0.15)", hsl: "0 72% 51%" },
} as const;

export const GOAL_TYPE_COLORS = {
  activity: "hsl(38,92%,50%)",
  output:   "hsl(142,71%,45%)",
  impact:   "hsl(210,100%,52%)",
};
