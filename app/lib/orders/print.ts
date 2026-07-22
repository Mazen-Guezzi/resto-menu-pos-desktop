'use client';

import { getPosApi } from '../pos-api';
import { buildReceiptDocument, type PrintBusinessInfo, type PrintMode } from './print-html';
import type { Order } from './types';

export interface PrintResult {
  ok: boolean;
  errors: string[];
}

/**
 * High-level print flow. Reads per-mode printer preferences from electron-store
 * and routes each ticket (kitchen / customer) to its configured printer via a
 * hidden BrowserWindow silent print. If a printer isn't configured, the OS
 * default is used.
 */
export async function printOrder(
  order: Order,
  business: PrintBusinessInfo | null,
  mode: PrintMode,
): Promise<PrintResult> {
  const pos = getPosApi();
  if (!pos) return { ok: false, errors: ['Print unavailable — not running in Electron'] };

  const kitchenDevice = (await pos.prefs.get<string | null>('printerKitchen')) || undefined;
  const customerDevice = (await pos.prefs.get<string | null>('printerCustomer')) || undefined;

  const tickets: Array<{ html: string; deviceName?: string; label: string }> = [];
  if (mode === 'kitchen' || mode === 'both') {
    tickets.push({
      html: buildReceiptDocument(order, business, 'kitchen'),
      deviceName: kitchenDevice,
      label: 'kitchen',
    });
  }
  if (mode === 'customer' || mode === 'both') {
    tickets.push({
      html: buildReceiptDocument(order, business, 'customer'),
      deviceName: customerDevice,
      label: 'customer',
    });
  }

  const errors: string[] = [];
  for (const t of tickets) {
    const res = await pos.print.ticket({ html: t.html, deviceName: t.deviceName });
    if (!res.ok) errors.push(`${t.label}: ${res.error ?? 'unknown error'}`);
  }
  return { ok: errors.length === 0, errors };
}

export async function listPrinters() {
  const pos = getPosApi();
  if (!pos) return [];
  return pos.print.listPrinters();
}
