import { formatCents } from './format';
import type { Order, OrderItem } from './types';

export type PrintMode = 'customer' | 'kitchen' | 'both';

export interface PrintBusinessInfo {
  name?: string | null;
  address?: string | null;
  phone_number?: string | null;
}

export interface PrintStrings {
  receipt: string;
  order: string;
  dineIn: string;
  takeaway: string;
  delivery: string;
  deliveryAddress: string;
  table: string;
  customer: string;
  phone: string;
  items: string;
  subtotal: string;
  deliveryFee: string;
  discount: string;
  menuDuJour: string;
  total: string;
  thanks: string;
  servedBy: string;
  createdAt: string;
  completedAt: string;
  kitchenTitle: string;
}

// Hardcoded French — parity with PWA. Kitchen tickets always French per project
// convention; customer receipts follow suit for a POS in a French-speaking market.
export const DEFAULT_STRINGS: PrintStrings = {
  receipt: 'Reçu',
  order: 'Commande',
  dineIn: 'Sur place',
  takeaway: 'À emporter',
  delivery: 'Livraison',
  deliveryAddress: 'Adresse de livraison',
  table: 'Table',
  customer: 'Client',
  phone: 'Tél',
  items: 'Articles',
  subtotal: 'Sous-total',
  deliveryFee: 'Frais de livraison',
  discount: 'Remise',
  menuDuJour: 'Menu du jour',
  total: 'Total',
  thanks: 'Merci de votre visite !',
  servedBy: '',
  createdAt: 'Commandé le',
  completedAt: 'Terminé le',
  kitchenTitle: 'CUISINE',
};

/**
 * Produces a complete standalone HTML document ready to be loaded into a
 * BrowserWindow and printed silently. Two-ticket ("both") mode inserts a
 * page break between kitchen and customer slips.
 */
export function buildReceiptDocument(
  order: Order,
  business: PrintBusinessInfo | null,
  mode: PrintMode,
  strings: PrintStrings = DEFAULT_STRINGS,
): string {
  const sections: string[] = [];
  if (mode === 'kitchen' || mode === 'both') {
    sections.push(`<section class="ticket">${kitchenTicketHtml(order, strings)}</section>`);
  }
  if (mode === 'customer' || mode === 'both') {
    const cls = sections.length > 0 ? 'ticket page-break' : 'ticket';
    sections.push(`<section class="${cls}">${customerReceiptHtml(order, business, strings)}</section>`);
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Receipt ${esc(order.short_code)}</title>
  <style>${PRINT_STYLES}</style>
</head>
<body>
  <div id="swiftqr-receipt">${sections.join('')}</div>
</body>
</html>`;
}

function orderTypeLabel(order: Order, s: PrintStrings): string {
  if (order.type === 'dine_in') return s.dineIn;
  if (order.type === 'delivery') return s.delivery;
  return s.takeaway;
}

function customerReceiptHtml(order: Order, business: PrintBusinessInfo | null, s: PrintStrings): string {
  const items = (order.items ?? []).map((it) => renderCustomerItem(it, order, s)).join('');

  return `
    <div class="center">
      ${business?.name ? `<div class="h1">${esc(business.name)}</div>` : ''}
      ${business?.address ? `<div class="muted">${esc(business.address)}</div>` : ''}
      ${business?.phone_number ? `<div class="muted">${esc(business.phone_number)}</div>` : ''}
    </div>
    <div class="divider"></div>
    <div class="row">
      <div>
        <div class="muted">${esc(s.order)}</div>
        <div class="h2">#${esc(order.short_code)}</div>
      </div>
      <div class="right"><span class="status-badge">${esc(order.status)}</span></div>
    </div>
    <div class="row" style="margin-top:6px;">
      <div class="muted">${esc(s.createdAt)}</div>
      <div>${esc(new Date(order.created_at).toLocaleString('fr-FR'))}</div>
    </div>
    ${
      order.completed_at
        ? `<div class="row"><div class="muted">${esc(s.completedAt)}</div><div>${esc(new Date(order.completed_at).toLocaleString('fr-FR'))}</div></div>`
        : ''
    }
    <div class="order-type">
      <span class="order-type-badge">${esc(orderTypeLabel(order, s)).toUpperCase()}</span>
      ${
        order.type === 'dine_in' && order.table_number
          ? `<span class="order-type-extra">${esc(s.table)} ${esc(order.table_number)}</span>`
          : ''
      }
    </div>
    ${
      order.type === 'delivery' && order.delivery_lat != null && order.delivery_lng != null
        ? `<div style="margin-top:4px;">
             <div class="muted">${esc(s.deliveryAddress)}</div>
             ${order.delivery_address ? `<div>${esc(order.delivery_address)}</div>` : ''}
             <div class="muted">${esc(`${order.delivery_lat.toFixed(5)}, ${order.delivery_lng.toFixed(5)}`)}</div>
           </div>`
        : ''
    }
    <div class="divider"></div>
    <div class="muted">${esc(s.customer)}</div>
    <div>${esc(order.customer_name)}</div>
    <div>${esc(s.phone)}: ${esc(order.customer_phone)}</div>
    ${order.customer_email ? `<div>${esc(order.customer_email)}</div>` : ''}
    ${order.notes ? `<div class="muted" style="margin-top:4px;">"${esc(order.notes)}"</div>` : ''}
    <div class="divider"></div>
    <div class="muted">${esc(s.items)}</div>
    <table>${items}</table>
    <div class="divider"></div>
    ${renderTotalsBlock(order, s)}
    <div class="total-row">
      <div>${esc(s.total)}</div>
      <div class="val">${esc(formatCents(order.total_cents, order.currency))}</div>
    </div>
    <div class="divider"></div>
    <div class="center muted">${esc(s.thanks)}</div>
    <div class="powered-by center">Propulsé par SwiftQR</div>
  `;
}

function renderCustomerItem(item: OrderItem, order: Order, s: PrintStrings): string {
  const extras =
    item.extras && item.extras.length > 0
      ? `<div class="line-extras">${item.extras
          .map((e) => {
            const priceStr = e.price_cents > 0 ? ` · +${formatCents(e.price_cents, order.currency)}` : '';
            return e.group_name
              ? `${esc(e.group_name)}: ${esc(e.name)}${priceStr}`
              : `+ ${esc(e.name)}${priceStr}`;
          })
          .join('<br/>')}</div>`
      : '';
  const comboItems =
    item.combo_id && item.combo_items && item.combo_items.length > 0
      ? `<div class="line-combo">${item.combo_items.map((n) => `• ${esc(n)}`).join('<br/>')}</div>`
      : '';
  const note = item.note ? `<div class="line-note">"${esc(item.note)}"</div>` : '';
  return `
    <tr>
      <td class="qty">${item.quantity}×</td>
      <td>
        <div class="line-name">${esc(item.product_name)}${
          item.combo_id ? ` <span class="line-combo-tag">${esc(s.menuDuJour.toUpperCase())}</span>` : ''
        }${item.variant_name ? ` <span class="line-variant">· ${esc(item.variant_name)}</span>` : ''}</div>
        ${comboItems}
        ${extras}
        ${note}
      </td>
      <td class="price">${formatCents(item.line_total_cents, order.currency)}</td>
    </tr>
  `;
}

function renderTotalsBlock(order: Order, s: PrintStrings): string {
  const hasDiscount = (order.discount_cents ?? 0) > 0;
  const isDelivery = order.type === 'delivery';
  if (!hasDiscount && !isDelivery) return '';
  const parts: string[] = [];
  parts.push(
    `<div class="row"><div class="muted">${esc(s.subtotal)}</div><div>${esc(formatCents(order.subtotal_cents, order.currency))}</div></div>`,
  );
  if (hasDiscount) {
    parts.push(
      `<div class="row" style="margin-bottom:4px;"><div class="muted">${esc(s.discount)}${
        order.promo_code ? ` <span>· ${esc(order.promo_code)}</span>` : ''
      }</div><div>−${esc(formatCents(order.discount_cents ?? 0, order.currency))}</div></div>`,
    );
  }
  if (isDelivery) {
    parts.push(
      `<div class="row" style="margin-bottom:4px;"><div class="muted">${esc(s.deliveryFee)}${
        order.delivery_distance_km != null
          ? ` <span>· ${esc(Number(order.delivery_distance_km).toFixed(1))} km</span>`
          : ''
      }</div><div>${esc(formatCents(order.delivery_fee_cents ?? 0, order.currency))}</div></div>`,
    );
  }
  return parts.join('');
}

function kitchenTicketHtml(order: Order, s: PrintStrings): string {
  const items = (order.items ?? [])
    .map((item, idx) => {
      const extras =
        item.extras && item.extras.length > 0
          ? `<ul class="k-extras">${item.extras
              .map((e) =>
                `<li>${
                  e.group_name
                    ? `<strong>${esc(e.group_name)}:</strong> ${esc(e.name)}`
                    : `+ ${esc(e.name)}`
                }</li>`,
              )
              .join('')}</ul>`
          : '';
      const comboItems =
        item.combo_id && item.combo_items && item.combo_items.length > 0
          ? `<ul class="k-combo">${item.combo_items.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`
          : '';
      const note = item.note ? `<div class="k-note">⚠ ${esc(item.note)}</div>` : '';
      const sep = idx < (order.items ?? []).length - 1 ? '<div class="k-item-sep"></div>' : '';
      return `
        <div class="k-item">
          <div class="k-qty-box">${item.quantity}</div>
          <div class="k-body">
            <div class="k-name">
              ${esc(item.product_name)}${
                item.combo_id ? ` <span class="k-combo-tag">${esc(s.menuDuJour.toUpperCase())}</span>` : ''
              }
            </div>
            ${item.variant_name ? `<div class="k-variant">${esc(item.variant_name)}</div>` : ''}
            ${comboItems}
            ${extras}
            ${note}
          </div>
          <div class="k-check" aria-hidden="true"></div>
        </div>
        ${sep}
      `;
    })
    .join('');

  const typeSuffix =
    order.type === 'dine_in' && order.table_number
      ? `${esc(s.table)} ${esc(order.table_number)}`
      : '';

  const timeStr = new Date(order.created_at).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return `
    <div class="k-heading">${esc(s.kitchenTitle)}</div>
    <div class="k-code">#${esc(order.short_code)}</div>
    <div class="k-meta">
      <span class="k-type-badge">${esc(orderTypeLabel(order, s)).toUpperCase()}</span>
      ${typeSuffix ? `<span class="k-table">${typeSuffix}</span>` : ''}
      <span class="k-time">${esc(timeStr)}</span>
    </div>
    <div class="k-thick-divider"></div>
    <div class="k-items">${items}</div>
    ${
      order.notes
        ? `<div class="k-thick-divider"></div>
           <div class="k-order-note-label">${esc(s.customer)}</div>
           <div class="k-order-note-box">⚠ ${esc(order.notes)}</div>`
        : ''
    }
  `;
}

// Same CSS as the PWA — proven receipt layout, 80mm-friendly, degrades to
// A4-centered when printed to a laser printer.
const PRINT_STYLES = `
  html, body { background: #fff; color: #000; margin: 0; padding: 0; }
  #swiftqr-receipt {
    width: 80mm;
    max-width: 100%;
    background: #fff;
    color: #000;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.35;
    padding: 8px;
    box-sizing: border-box;
    margin: 0 auto;
  }
  #swiftqr-receipt .ticket { padding: 4px 0; }
  #swiftqr-receipt .center { text-align: center; }
  #swiftqr-receipt .right { text-align: right; }
  #swiftqr-receipt .muted { color: #333; font-size: 12px; }
  #swiftqr-receipt .h1 { font-size: 20px; font-weight: 900; margin: 0; }
  #swiftqr-receipt .h2 { font-size: 18px; font-weight: 900; margin: 0; }
  #swiftqr-receipt .divider { border-top: 2px dashed #000; margin: 8px 0; }
  #swiftqr-receipt .row { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
  #swiftqr-receipt table { width: 100%; border-collapse: collapse; font-size: 14px; }
  #swiftqr-receipt td { padding: 4px 0; vertical-align: top; }
  #swiftqr-receipt td.qty { width: 34px; font-weight: 800; font-size: 15px; }
  #swiftqr-receipt td.price { width: 78px; text-align: right; font-weight: 800; white-space: nowrap; }
  #swiftqr-receipt .line-name { font-weight: 700; }
  #swiftqr-receipt .line-variant { font-weight: 400; color: #333; }
  #swiftqr-receipt .line-extras { color: #333; font-size: 12px; margin-top: 2px; }
  #swiftqr-receipt .line-combo { color: #333; font-size: 12px; margin-top: 2px; padding-left: 6px; }
  #swiftqr-receipt .line-combo-tag {
    display: inline-block; margin-left: 4px; padding: 1px 6px;
    border: 1px solid #000; border-radius: 4px;
    font-size: 10px; font-weight: 800; letter-spacing: 0.5px;
  }
  #swiftqr-receipt .line-note {
    color: #000; font-size: 12px; font-style: italic; margin-top: 2px;
    background: #f2f2f2; padding: 2px 4px; border-left: 3px solid #000;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  #swiftqr-receipt .total-row { display: flex; justify-content: space-between; align-items: baseline; margin-top: 6px; }
  #swiftqr-receipt .total-row > div:first-child { font-weight: 800; font-size: 15px; }
  #swiftqr-receipt .total-row .val { font-size: 20px; font-weight: 900; }
  #swiftqr-receipt .order-type { display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: wrap; margin: 8px 0 4px; }
  #swiftqr-receipt .order-type-badge {
    display: inline-block; padding: 4px 12px;
    border: 2.5px solid #000; border-radius: 6px;
    font-size: 15px; font-weight: 900; letter-spacing: 1.5px;
    text-transform: uppercase;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  #swiftqr-receipt .order-type-extra { font-size: 15px; font-weight: 800; }
  #swiftqr-receipt .powered-by {
    margin-top: 10px; padding-top: 6px;
    border-top: 1px dashed #999;
    font-size: 10px; font-weight: 600; letter-spacing: 1px; color: #666;
    text-transform: uppercase;
  }
  #swiftqr-receipt .status-badge {
    display: inline-block; padding: 2px 8px;
    border: 1px solid #000; border-radius: 999px;
    font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;
  }
  #swiftqr-receipt .k-heading {
    text-align: center; font-size: 15px; font-weight: 900; letter-spacing: 6px;
    border: 2px solid #000; padding: 4px 0; margin-bottom: 8px;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  #swiftqr-receipt .k-code { text-align: center; font-size: 40px; font-weight: 900; letter-spacing: 3px; line-height: 1; margin: 4px 0 6px; }
  #swiftqr-receipt .k-meta { display: flex; justify-content: center; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 4px; }
  #swiftqr-receipt .k-type-badge { padding: 3px 10px; border: 2px solid #000; border-radius: 4px; font-size: 15px; font-weight: 900; letter-spacing: 1.2px; }
  #swiftqr-receipt .k-table { font-size: 17px; font-weight: 900; }
  #swiftqr-receipt .k-time { font-size: 15px; font-weight: 700; color: #333; }
  #swiftqr-receipt .k-thick-divider { border-top: 3px solid #000; margin: 10px 0; }
  #swiftqr-receipt .k-item-sep { border-top: 1px dashed #666; margin: 8px 0; }
  #swiftqr-receipt .k-items { display: block; }
  #swiftqr-receipt .k-item { display: flex; align-items: flex-start; gap: 10px; }
  #swiftqr-receipt .k-qty-box {
    flex: 0 0 auto; min-width: 46px; height: 46px;
    border: 2.5px solid #000; border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    font-size: 26px; font-weight: 900;
  }
  #swiftqr-receipt .k-body { flex: 1 1 auto; min-width: 0; }
  #swiftqr-receipt .k-check { flex: 0 0 auto; width: 22px; height: 22px; border: 2px solid #000; border-radius: 4px; margin-top: 4px; }
  #swiftqr-receipt .k-name { font-size: 18px; font-weight: 900; line-height: 1.2; word-break: break-word; }
  #swiftqr-receipt .k-combo-tag {
    display: inline-block; margin-left: 4px; padding: 2px 6px;
    border: 1.5px solid #000; border-radius: 4px;
    font-size: 10px; font-weight: 900; letter-spacing: 0.5px; vertical-align: middle;
  }
  #swiftqr-receipt .k-variant { font-size: 14px; font-weight: 600; color: #333; margin-top: 2px; }
  #swiftqr-receipt ul.k-extras, #swiftqr-receipt ul.k-combo {
    list-style: disc; margin: 4px 0 0; padding-left: 18px;
    font-size: 13.5px; color: #000; line-height: 1.35;
  }
  #swiftqr-receipt ul.k-combo { font-weight: 600; }
  #swiftqr-receipt ul.k-extras li, #swiftqr-receipt ul.k-combo li { margin: 1px 0; }
  #swiftqr-receipt .k-note {
    font-size: 14px; font-weight: 700; margin-top: 5px;
    padding: 4px 6px; background: #ffefad;
    border: 1.5px solid #000; border-left-width: 5px;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  #swiftqr-receipt .k-order-note-label { font-size: 12px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 4px; }
  #swiftqr-receipt .k-order-note-box {
    font-size: 15px; font-weight: 700;
    border: 2px solid #000; border-left-width: 6px;
    padding: 6px 8px; background: #ffefad;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  #swiftqr-receipt .ticket.page-break { page-break-before: always; break-before: page; }
  @page { margin: 4mm; }
`;

function esc(v: unknown): string {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
