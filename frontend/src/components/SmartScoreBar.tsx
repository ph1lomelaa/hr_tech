import { useEffect, useRef, useState } from "react";

interface SmartScoreBarProps {
  scores: { label: string; key: string; value: number };
}

const SMART_COLORS: Record<string, string> = {
  S: "142 71% 45%",
  M: "210 100% 52%",
  A: "38 92% 50%",
  R: "280 65% 55%",
  T: "0 72% 51%",
};

export default function SmartScoreBar({ scores }: SmartScoreBarProps) {
  const hsl = SMART_COLORS[scores.key];
  const color = hsl ? `hsl(${hsl})` : "hsl(var(--primary))";
  const pct = Math.round(scores.value * 100);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setMounted(true); },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="space-y-1.5" ref={ref}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[10px] font-bold leading-none"
            style={{
              backgroundColor: `hsl(${hsl} / 0.15)`,
              color,
              borderColor: `hsl(${hsl} / 0.35)`,
            }}
          >
            {scores.key}
          </span>
          <span className="text-xs font-medium truncate" style={{ color }}>
            {scores.label}
          </span>
        </div>
        <span className="text-xs font-mono font-bold tabular-nums shrink-0" style={{ color: "hsl(var(--foreground) / 0.8)" }}>
          {pct}%
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "hsl(var(--muted))" }}>
        <div
          className="h-full rounded-full transition-all duration-700 ease-out origin-left"
          style={{
            width: `${pct}%`,
            backgroundColor: color,
            transform: mounted ? "scaleX(1)" : "scaleX(0)",
            transition: mounted ? "transform 0.8s ease-out, width 0.5s ease-out" : "none",
          }}
        />
      </div>
    </div>
  );
}

export function SmartScoreGroup({ scores }: { scores: { key: string; label: string; value: number }[] }) {
  return (
    <div className="space-y-3">
      {scores.map((s) => (
        <SmartScoreBar key={s.key} scores={s} />
      ))}
    </div>
  );
}
