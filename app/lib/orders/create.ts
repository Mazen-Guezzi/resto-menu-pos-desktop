'use client';

import { supabase } from '../supabase';
import { getPosApi } from '../pos-api';
import type { OrderType } from './types';

export interface NewOrderLineExtra {
  group_id: number | null;
  group_name: string | null;
  option_id: number | null;
  name: string;
  price_cents: number;
}

export interface NewOrderLine {
  product_id?: number | null;
  variant_id?: number | null;
  product_name: string;
  variant_name?: string | null;
  unit_price_cents: number;
  quantity: number;
  note?: string | null;
  extras?: NewOrderLineExtra[];
}

export interface NewOrderPayload {
  business_id: number;
  type: OrderType;
  table_number?: string | null;
  delivery_address?: string | null;
  delivery_lat?: number | null;
  delivery_lng?: number | null;
  customer_name: string;
  customer_phone: string;
  customer_email?: string | null;
  notes?: string | null;
  currency: string;
  lines: NewOrderLine[];
  // Client-generated so the same payload replays identically after an
  // offline enqueue (avoids duplicate short codes if a retry succeeds twice).
  short_code: string;
  tracking_token: string;
}

export interface CreateOrderResult {
  ok: boolean;
  orderId?: number;
  enqueuedLocalId?: string;
  error?: string;
  offline?: boolean;
}

/**
 * Attempts to create an order online. On network failure (or if navigator.onLine
 * is false) the payload is enqueued to the local outbox for later sync.
 * Non-network errors (401/403/500) surface directly — retrying blindly won't help.
 */
export async function createOrder(payload: NewOrderPayload): Promise<CreateOrderResult> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return enqueueOffline(payload);
  }
  try {
    const orderId = await insertOrderPayload(payload);
    return { ok: true, orderId };
  } catch (err) {
    if (isNetworkError(err)) {
      return enqueueOffline(payload);
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Direct-insert path used both by the online flow above and by the sync worker
 * when replaying a queued payload. Throws on failure so callers can distinguish
 * network from validation errors.
 */
function lineTotalCents(l: NewOrderLine): number {
  const extraSum = (l.extras ?? []).reduce((s, e) => s + e.price_cents, 0);
  return (l.unit_price_cents + extraSum) * l.quantity;
}

export async function insertOrderPayload(payload: NewOrderPayload): Promise<number> {
  const subtotal = payload.lines.reduce((s, l) => s + lineTotalCents(l), 0);
  const orderInsert = {
    business_id: payload.business_id,
    short_code: payload.short_code,
    tracking_token: payload.tracking_token,
    status: 'pending',
    type: payload.type,
    table_number: payload.type === 'dine_in' ? payload.table_number ?? null : null,
    delivery_address:
      payload.type === 'delivery' ? payload.delivery_address ?? null : null,
    delivery_lat: payload.type === 'delivery' ? payload.delivery_lat ?? null : null,
    delivery_lng: payload.type === 'delivery' ? payload.delivery_lng ?? null : null,
    customer_name: payload.customer_name,
    customer_phone: payload.customer_phone,
    customer_email: payload.customer_email ?? null,
    notes: payload.notes ?? null,
    subtotal_cents: subtotal,
    total_cents: subtotal,
    currency: payload.currency,
  };

  const { data: orderRow, error: orderErr } = await supabase
    .from('orders')
    .insert(orderInsert)
    .select('id')
    .single();

  if (orderErr) throw wrapError(orderErr);
  const orderId = (orderRow as { id: number }).id;

  // Insert items one-by-one so we can grab each new item_id and attach its
  // addon extras to the right row. For POS baskets (typically < 20 items)
  // the extra round-trips are negligible.
  try {
    for (const l of payload.lines) {
      const { data: itemRow, error: itemErr } = await supabase
        .from('order_items')
        .insert({
          order_id: orderId,
          product_id: l.product_id ?? null,
          variant_id: l.variant_id ?? null,
          product_name: l.product_name,
          variant_name: l.variant_name ?? null,
          unit_price_cents: l.unit_price_cents,
          quantity: l.quantity,
          line_total_cents: lineTotalCents(l),
          note: l.note ?? null,
        })
        .select('id')
        .single();
      if (itemErr) throw wrapError(itemErr);
      const itemId = (itemRow as { id: number }).id;

      const extras = l.extras ?? [];
      if (extras.length > 0) {
        const extraRows = extras.map((e) => ({
          order_item_id: itemId,
          extra_id: null,
          addon_option_id: e.option_id,
          addon_group_id: e.group_id,
          group_name: e.group_name,
          name: e.name,
          price_cents: e.price_cents,
        }));
        const { error: exErr } = await supabase.from('order_item_extras').insert(extraRows);
        if (exErr) throw wrapError(exErr);
      }
    }
  } catch (err) {
    // Best-effort rollback so the board doesn't show a header-only row.
    await supabase.from('orders').delete().eq('id', orderId);
    throw err;
  }

  return orderId;
}

async function enqueueOffline(payload: NewOrderPayload): Promise<CreateOrderResult> {
  const pos = getPosApi();
  if (!pos) return { ok: false, error: 'Offline queue unavailable — not running in Electron' };
  const entry = await pos.outbox.enqueue({ op: 'orders.insert', payload });
  return { ok: true, enqueuedLocalId: entry.localId, offline: true };
}

function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  const msg = (err as { message?: string })?.message?.toLowerCase() ?? '';
  return (
    msg.includes('fetch') ||
    msg.includes('network') ||
    msg.includes('failed to send') ||
    msg.includes('load failed')
  );
}

function wrapError(err: { message?: string; details?: string; hint?: string }): Error {
  const msg = err.message || err.details || err.hint || 'Unknown Supabase error';
  return new Error(msg);
}

// Client-side generators. UUIDs come from the Web Crypto API which is
// available in both Electron renderer and modern browsers. short_code is a
// 6-char base-36 slug — some collision risk in high volume, but the DB has a
// unique constraint that would surface a conflict if it ever hit.
export function generateShortCode(): string {
  const s = Math.random().toString(36).slice(2, 8).toUpperCase();
  return s.padEnd(6, 'X');
}

export function generateTrackingToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `tok_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
