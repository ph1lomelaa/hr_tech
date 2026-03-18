export function SkeletonGoalCard() {
  return (
    <div className="glass-card-elevated p-6 space-y-4 animate-fade-in">
      <div className="flex gap-2">
        <div className="skeleton-shimmer h-5 w-20 rounded-md" />
        <div className="skeleton-shimmer h-5 w-28 rounded-md" />
        <div className="skeleton-shimmer h-5 w-16 rounded-md" />
      </div>
      <div className="flex items-center gap-3 mt-2">
        <div className="skeleton-shimmer h-10 w-10 rounded-2xl shrink-0" />
        <div className="space-y-1.5 flex-1">
          <div className="skeleton-shimmer h-3.5 w-36 rounded" />
          <div className="skeleton-shimmer h-3 w-48 rounded" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="skeleton-shimmer h-4 w-full rounded" />
        <div className="skeleton-shimmer h-4 w-5/6 rounded" />
        <div className="skeleton-shimmer h-4 w-3/4 rounded" />
      </div>
      <div className="flex gap-2">
        <div className="skeleton-shimmer h-7 w-20 rounded-lg" />
        <div className="skeleton-shimmer h-7 w-24 rounded-lg" />
        <div className="skeleton-shimmer h-7 w-20 rounded-lg" />
      </div>
    </div>
  );
}

export function SkeletonStatCard() {
  return (
    <div className="glass-card-elevated p-5 space-y-3 animate-fade-in">
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <div className="skeleton-shimmer h-3 w-24 rounded" />
          <div className="skeleton-shimmer h-8 w-20 rounded" />
          <div className="skeleton-shimmer h-4 w-16 rounded-md" />
        </div>
        <div className="skeleton-shimmer h-10 w-10 rounded-xl shrink-0" />
      </div>
    </div>
  );
}
