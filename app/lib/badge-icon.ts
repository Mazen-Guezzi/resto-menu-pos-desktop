'use client';

/**
 * Draw a numbered badge icon (red circle, white count) at 32×32 for the
 * Windows taskbar overlay. macOS + Linux use `app.setBadgeCount` natively —
 * this canvas render only matters on Windows.
 *
 * We render at 32×32 (Windows scales it into ~16×16 taskbar overlay slot).
 * Anything more than 99 shows as "99+" so we don't overflow the circle.
 */
export function generateBadgeIcon(count: number): string {
  if (count <= 0 || typeof document === 'undefined') return '';

  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Solid red circle background (attention-getting, matches macOS' native
  // badge color so cross-platform installs feel consistent).
  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
  ctx.fill();

  // Thin white ring so the badge pops against dark taskbar themes.
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Count. 99+ for anything higher so it stays legible.
  ctx.fillStyle = 'white';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = count > 99 ? '99+' : String(count);
  // Shrink font size for 2- and 3-char labels so they still fit.
  const fontSize = label.length === 1 ? 20 : label.length === 2 ? 16 : 12;
  ctx.font = `bold ${fontSize}px -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.fillText(label, size / 2, size / 2 + 1);

  return canvas.toDataURL('image/png');
}
