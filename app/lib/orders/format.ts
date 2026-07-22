export function formatCents(cents: number, currency = 'EUR'): string {
  const amount = (cents ?? 0) / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      currencyDisplay: 'symbol',
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

type Translator = (key: string, opts?: { count?: number }) => string;

export function formatRelativeTime(iso: string, t?: Translator): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const s = Math.round(diffMs / 1000);
  const tr = t ?? ((k: string, o?: { count?: number }) => fallback(k, o?.count));
  if (s < 45) return tr('time.justNow');
  const m = Math.round(s / 60);
  if (m < 60) return tr('time.m', { count: m });
  const h = Math.round(m / 60);
  if (h < 24) return tr('time.h', { count: h });
  const d = Math.round(h / 24);
  return tr('time.d', { count: d });
}

function fallback(k: string, count?: number): string {
  if (k === 'time.justNow') return 'just now';
  if (k === 'time.m') return `${count}m ago`;
  if (k === 'time.h') return `${count}h ago`;
  if (k === 'time.d') return `${count}d ago`;
  return k;
}

export function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
