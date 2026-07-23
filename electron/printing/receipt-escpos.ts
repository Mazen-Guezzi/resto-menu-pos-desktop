import { EscposBuilder } from './escpos';

// Kept intentionally minimal + serializable so the renderer can pass it
// straight over IPC without translation.
export interface EscposOrderItem {
  quantity: number;
  product_name: string;
  variant_name?: string | null;
  line_total_cents: number;
  note?: string | null;
  extras?: Array<{ name: string; group_name?: string | null; price_cents: number }>;
  /** Optional — used by the router to filter items per station printer. */
  product_id?: number | null;
}

export interface EscposOrder {
  short_code: string;
  type: 'dine_in' | 'takeaway' | 'delivery';
  table_number?: string | null;
  customer_name: string;
  customer_phone?: string | null;
  notes?: string | null;
  subtotal_cents: number;
  total_cents: number;
  currency: string;
  created_at: string;
  items: EscposOrderItem[];
  business_name?: string | null;
  business_address?: string | null;
  business_phone?: string | null;
}

const WIDTH = 42; // 80mm at Font A ≈ 42 chars

function money(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

function typeLabel(t: EscposOrder['type']): string {
  if (t === 'dine_in') return 'SUR PLACE';
  if (t === 'delivery') return 'LIVRAISON';
  return 'A EMPORTER';
}

export function buildCustomerReceipt(order: EscposOrder): Buffer {
  const b = new EscposBuilder().init().codepage();

  // --- Header (business info) -------------------------------------------
  if (order.business_name) {
    b.align('center').size('double').bold(true).line(order.business_name).size('normal').bold(false);
  }
  if (order.business_address) b.align('center').line(order.business_address);
  if (order.business_phone) b.align('center').line(order.business_phone);
  b.feed();

  // --- Order code + type ------------------------------------------------
  b.align('center').size('double-h').bold(true).line(`#${order.short_code}`).size('normal').bold(false);
  b.align('center').bold(true).line(typeLabel(order.type)).bold(false);
  if (order.type === 'dine_in' && order.table_number) {
    b.align('center').line(`Table ${order.table_number}`);
  }
  b.feed();

  b.align('left').divider('-', WIDTH);

  // --- Customer ---------------------------------------------------------
  b.line(`Client:  ${order.customer_name}`);
  if (order.customer_phone) b.line(`Tel:     ${order.customer_phone}`);
  b.line(`Date:    ${new Date(order.created_at).toLocaleString('fr-FR')}`);
  b.divider('-', WIDTH);

  // --- Items ------------------------------------------------------------
  for (const it of order.items) {
    const qtyPart = `${it.quantity} x `;
    const namePart = it.product_name + (it.variant_name ? ` — ${it.variant_name}` : '');
    b.row(qtyPart + namePart, money(it.line_total_cents, order.currency), WIDTH);
    for (const ex of it.extras ?? []) {
      const label = ex.group_name ? `  + ${ex.group_name}: ${ex.name}` : `  + ${ex.name}`;
      if (ex.price_cents > 0) {
        b.row(label, `+${money(ex.price_cents, order.currency)}`, WIDTH);
      } else {
        b.line(label);
      }
    }
    if (it.note) b.line(`  "${it.note}"`);
  }
  b.divider('-', WIDTH);

  // --- Totals -----------------------------------------------------------
  if (order.subtotal_cents !== order.total_cents) {
    b.row('Sous-total', money(order.subtotal_cents, order.currency), WIDTH);
  }
  b.size('double-h').bold(true).row('TOTAL', money(order.total_cents, order.currency), WIDTH).size('normal').bold(false);
  b.divider('-', WIDTH);

  if (order.notes) {
    b.feed().line(`Note: ${order.notes}`);
  }

  b.feed().align('center').line('Merci de votre visite !').line('Propulse par SwiftQR');
  b.feed(4).cut();

  return b.build();
}

export function buildKitchenTicket(order: EscposOrder, stationLabel = 'CUISINE'): Buffer {
  const b = new EscposBuilder().init().codepage();

  b.align('center').size('double').bold(true).line(stationLabel.toUpperCase()).bold(false).size('normal');
  b.align('center').size('huge').bold(true).line(`#${order.short_code}`).size('normal').bold(false);

  b.align('center').bold(true).line(typeLabel(order.type)).bold(false);
  if (order.type === 'dine_in' && order.table_number) {
    b.align('center').size('double-h').bold(true).line(`Table ${order.table_number}`).bold(false).size('normal');
  }
  const hhmm = new Date(order.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  b.align('center').line(hhmm);

  b.feed().align('left').divider('=', WIDTH);

  for (const it of order.items) {
    b.size('double-h').bold(true).line(`${it.quantity} x  ${it.product_name}`).bold(false).size('normal');
    if (it.variant_name) b.line(`      ${it.variant_name}`);
    for (const ex of it.extras ?? []) {
      const label = ex.group_name ? `      + ${ex.group_name}: ${ex.name}` : `      + ${ex.name}`;
      b.line(label);
    }
    if (it.note) {
      b.bold(true).line(`      ! ${it.note}`).bold(false);
    }
    b.feed();
  }

  if (order.notes) {
    b.divider('=', WIDTH);
    b.bold(true).line('NOTE CLIENT:').bold(false).line(order.notes);
  }

  b.feed(4).cut();
  return b.build();
}
