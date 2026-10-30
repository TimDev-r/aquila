/** Resolve a CSS custom property (e.g. "--success") to an rgb() string the chart canvas understands. */
export function themeColor(varName: string, alpha = 1): string {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    const ctx = c.getContext("2d");
    if (!ctx || !raw) return "rgb(0,0,0)";
    ctx.fillStyle = raw;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `rgba(${r},${g},${b},${alpha})`;
  } catch {
    return "rgb(0,0,0)";
  }
}
