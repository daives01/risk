export function formatLuckScore(score: number) {
  const rounded = Number(score.toFixed(2));
  if (rounded === 0) return "0.00";
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(2)}`;
}

export function luckScoreStyle(score: number) {
  const rounded = Number(score.toFixed(2));
  if (rounded === 0) return { color: "var(--foreground)" };
  const strength = Math.round(22 + Math.min(Math.abs(rounded) / 1.25, 1) * 78);
  const target = rounded > 0 ? "#34d399" : "#fb7185";
  return { color: `color-mix(in oklab, var(--foreground), ${target} ${strength}%)` };
}
