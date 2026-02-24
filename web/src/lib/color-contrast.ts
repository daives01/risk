function parseHexColor(hex: string) {
  const normalized = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function toLinearSrgb(channel: number) {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string) {
  const rgb = parseHexColor(hex);
  if (!rgb) return null;
  const r = toLinearSrgb(rgb.r);
  const g = toLinearSrgb(rgb.g);
  const b = toLinearSrgb(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string) {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  if (l1 == null || l2 == null) return null;
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function getReadableTextColor(backgroundHex: string) {
  const blackContrast = contrastRatio(backgroundHex, "#000000");
  const whiteContrast = contrastRatio(backgroundHex, "#ffffff");
  if (blackContrast == null || whiteContrast == null) return "#ffffff";
  return blackContrast >= whiteContrast ? "#000000" : "#ffffff";
}

