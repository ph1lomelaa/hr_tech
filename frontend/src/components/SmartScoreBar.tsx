interface SmartScoreBarProps {
  scores: { label: string; key: string; value: number };
}

const colorMap: Record<string, string> = {
  S: "bg-smart-s",
  M: "bg-smart-m",
  A: "bg-smart-a",
  R: "bg-smart-r",
  T: "bg-smart-t",
};

export default function SmartScoreBar({ scores }: SmartScoreBarProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono font-semibold text-muted-foreground">{scores.label}</span>
        <span className="text-xs font-mono font-bold">{(scores.value * 100).toFixed(0)}%</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`smart-bar h-full ${colorMap[scores.key] || "bg-primary"}`}
          style={{ width: `${scores.value * 100}%` }}
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
