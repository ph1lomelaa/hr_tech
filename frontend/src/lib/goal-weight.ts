const DEFAULT_TARGET_GOALS = 3;

export function getRemainingWeight(weightSum: number): number {
  return Math.max(0, Math.round(100 - weightSum));
}

export function getSuggestedGoalWeight(
  totalGoals: number,
  weightSum: number,
  targetGoals = DEFAULT_TARGET_GOALS,
): number {
  const remainingWeight = getRemainingWeight(weightSum);
  if (remainingWeight <= 0) return 0;

  if (totalGoals >= targetGoals) {
    return remainingWeight;
  }

  const slotsLeft = Math.max(1, targetGoals - totalGoals);
  return Math.min(remainingWeight, Math.max(1, Math.ceil(remainingWeight / slotsLeft)));
}
