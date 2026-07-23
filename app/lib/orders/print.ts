'use client';

import { getPosApi } from '../pos-api';
import { buildReceiptDocument, type PrintBusinessInfo, type PrintMode } from './print-html';
import { sendBytesToUsbPrinter } from '../webusb';
import type { Order } from './types';

export interface PrintResult {
  ok: boolean;
  errors: string[];
}

/**
 * Route an order to the configured kitchen + customer printers. Main-process
 * router picks between OS silent print (needs the HTML), raw ESC/POS over
 * network, or raw ESC/POS over USB based on each side's saved PrinterConfig.
 * We always pre-render both HTML variants so the router can pick whichever
 * matches the pref without another round-trip.
 */
export async function printOrder(
  order: Order,
  business: PrintBusinessInfo | null,
  mode: PrintMode,
  productCategoryIds?: Record<string, number>,
): Promise<PrintResult> {
  const pos = getPosApi();
  if (!pos) return { ok: false, errors: ['Print unavailable — not running in Electron'] };

  const escpos = orderToEscposPayload(order, business);
  const html = {
    kitchen: mode === 'kitchen' || mode === 'both' ? buildReceiptDocument(order, business, 'kitchen') : undefined,
    customer: mode === 'customer' || mode === 'both' ? buildReceiptDocument(order, business, 'customer') : undefined,
  };

  const res = await pos.print.order({ order: escpos, mode, html, productCategoryIds });
  const errors = [...res.errors];

  // Dispatch any USB targets the main router handed back to us via WebUSB.
  for (const target of res.usbDelegated ?? []) {
    const usbRes = await sendBytesToUsbPrinter(
      target.vendorId,
      target.productId,
      Uint8Array.from(target.bytes),
    );
    if (!usbRes.ok) errors.push(`${target.printer.name}: ${usbRes.error ?? 'USB error'}`);
  }
  return { ok: errors.length === 0, errors };
}

export async function listPrinters() {
  const pos = getPosApi();
  if (!pos) return [];
  return pos.print.listPrinters();
}

// ---------------------------------------------------------------------------
// Shape the Order into the trimmed, serializable form the main-process
// ESC/POS builder expects. Keep this in sync with EscposOrder in
// electron/printing/receipt-escpos.ts.
// ---------------------------------------------------------------------------

function orderToEscposPayload(order: Order, business: PrintBusinessInfo | null) {
  return {
    short_code: order.short_code,
    type: order.type,
    table_number: order.table_number,
    customer_name: order.customer_name,
    customer_phone: order.customer_phone,
    notes: order.notes,
    subtotal_cents: order.subtotal_cents,
    total_cents: order.total_cents,
    currency: order.currency,
    created_at: order.created_at,
    items: (order.items ?? []).map((it) => ({
      quantity: it.quantity,
      product_name: it.product_name,
      variant_name: it.variant_name,
      line_total_cents: it.line_total_cents,
      note: it.note,
      product_id: it.product_id ?? null,
      extras: (it.extras ?? []).map((ex) => ({
        name: ex.name,
        group_name: ex.group_name ?? null,
        price_cents: ex.price_cents,
      })),
    })),
    business_name: business?.name ?? null,
    business_address: business?.address ?? null,
    business_phone: business?.phone_number ?? null,
  };
}
