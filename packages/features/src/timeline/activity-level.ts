export type ActivityLevel = 0 | 1 | 2 | 3 | 4 | 5;

export function levelForCount(count: number): ActivityLevel {
  if (count >= 12) {
    return 5;
  }
  if (count >= 6) {
    return 4;
  }
  if (count >= 4) {
    return 3;
  }
  if (count >= 2) {
    return 2;
  }
  if (count >= 1) {
    return 1;
  }
  return 0;
}

export function activityLevelClass(count: number): string {
  return `df-activity-green-${levelForCount(count)}`;
}
