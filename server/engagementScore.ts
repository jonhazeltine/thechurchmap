export function computeEffectiveScore(baseScore: number, lastActivityAt: Date): number {
  const now = new Date();
  const daysSinceActivity = (now.getTime() - lastActivityAt.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceActivity <= 0) return baseScore;

  if (daysSinceActivity <= 14) {
    const decayFactor = 1.0 - (0.4 * (daysSinceActivity / 14));
    return baseScore * decayFactor;
  }

  if (daysSinceActivity <= 90) {
    const phase2Days = daysSinceActivity - 14;
    const decayFactor = 0.6 * (1.0 - (phase2Days / 76));
    return Math.max(0, baseScore * decayFactor);
  }

  return 0;
}

export function computeRecoveredScore(currentBaseScore: number, activityType: string): number {
  const recoveryAmounts: Record<string, number> = {
    'prayer_submitted': 0.15,
    'prayer_response': 0.10,
    'budget_updated': 0.05,
  };
  const recovery = recoveryAmounts[activityType] || 0.05;
  return Math.min(1.0, currentBaseScore + recovery);
}
