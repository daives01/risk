export function formatTurnTimer(ms: number): string {
  const totalHours = Math.max(0, Math.round(ms / (60 * 60 * 1000)));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days > 0 && hours > 0) return `${days}d ${hours}hr`;
  if (days > 0) return `${days}d`;
  return `${hours}hr`;
}
