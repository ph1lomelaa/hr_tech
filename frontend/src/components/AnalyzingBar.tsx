import { useEffect, useRef, useState } from "react";

/** Animated indeterminate-style progress bar shown while SMART evaluation is in progress. */
export default function AnalyzingBar() {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    // Animate from 0 → ~72% over ~2.4s (ease-out cubic), then plateau
    const duration = 2400;
    const target = 72;

    const tick = (now: number) => {
      if (!startRef.current) startRef.current = now;
      const elapsed = now - startRef.current;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setProgress(Math.round(eased * target));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-medium text-muted-foreground">Анализируется…</span>
        <span className="text-[11px] font-mono text-primary/70">{progress}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${progress}%`,
            background: "linear-gradient(90deg, hsl(var(--primary) / 0.6), hsl(var(--primary)))",
            transition: "none",
          }}
        />
      </div>
    </div>
  );
}
