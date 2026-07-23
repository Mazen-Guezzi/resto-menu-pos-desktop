'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import type { Order, OrderStatus, OrderType } from './types';

// -------------------------------------------------------------------------
// Time range presets
// -------------------------------------------------------------------------
export type RangeKey = 'today' | 'yesterday' | 'last7' | 'last30';

export function rangeFor(key: RangeKey): { from: Date; to: Date } {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  if (key === 'today') return { from: startOfToday, to: startOfTomorrow };
  if (key === 'yesterday') {
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    return { from: startOfYesterday, to: startOfToday };
  }
  const days = key === 'last7' ? 7 : 30;
  const from = new Date(startOfToday);
  from.setDate(from.getDate() - (days - 1));
  return { from, to: startOfTomorrow };
}

// -------------------------------------------------------------------------
// Aggregations
// -------------------------------------------------------------------------
export interface StatsResult {
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  revenueCents: number;
  avgOrderCents: number;
  cancellationRate: number; // 0..1
  currency: string;
  byStatus: Record<OrderStatus, number>;
  byType: Record<OrderType, number>;
  hourly: number[]; // 24 buckets, order count
  topProducts: Array<{ name: string; qty: number; revenueCents: number }>;
}

const EMPTY_STATS: StatsResult = {
  totalOrders: 0,
  completedOrders: 0,
  cancelledOrders: 0,
  revenueCents: 0,
  avgOrderCents: 0,
  cancellationRate: 0,
  currency: 'DT',
  byStatus: { pending: 0, accepted: 0, preparing: 0, ready: 0, completed: 0, cancelled: 0 },
  byType: { dine_in: 0, takeaway: 0, delivery: 0 },
  hourly: Array(24).fill(0),
  topProducts: [],
};

function aggregate(orders: Order[]): StatsResult {
  if (orders.length === 0) return EMPTY_STATS;
  const byStatus: Record<OrderStatus, number> = {
    pending: 0,
    accepted: 0,
    preparing: 0,
    ready: 0,
    completed: 0,
    cancelled: 0,
  };
  const byType: Record<OrderType, number> = { dine_in: 0, takeaway: 0, delivery: 0 };
  const hourly = Array(24).fill(0);
  const productAgg = new Map<string, { qty: number; revenueCents: number }>();

  let revenueCents = 0;
  let cancelledOrders = 0;
  let completedOrders = 0;
  let nonCancelledCount = 0;

  for (const o of orders) {
    byStatus[o.status] += 1;
    byType[o.type] += 1;
    const hour = new Date(o.created_at).getHours();
    if (hour >= 0 && hour < 24) hourly[hour] += 1;

    if (o.status === 'cancelled') {
      cancelledOrders += 1;
    } else {
      revenueCents += o.total_cents;
      nonCancelledCount += 1;
      if (o.status === 'completed') completedOrders += 1;
      for (const item of o.items ?? []) {
        const key = item.product_name;
        const prev = productAgg.get(key) ?? { qty: 0, revenueCents: 0 };
        prev.qty += item.quantity;
        prev.revenueCents += item.line_total_cents;
        productAgg.set(key, prev);
      }
    }
  }

  const topProducts = Array.from(productAgg.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10);

  return {
    totalOrders: orders.length,
    completedOrders,
    cancelledOrders,
    revenueCents,
    avgOrderCents: nonCancelledCount === 0 ? 0 : Math.round(revenueCents / nonCancelledCount),
    cancellationRate: orders.length === 0 ? 0 : cancelledOrders / orders.length,
    currency: orders[0].currency ?? 'DT',
    byStatus,
    byType,
    hourly,
    topProducts,
  };
}

// -------------------------------------------------------------------------
// Data hook
// -------------------------------------------------------------------------
export function useStats(businessId: number | null | undefined, range: RangeKey) {
  const [stats, setStats] = useState<StatsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!businessId) {
      setStats(EMPTY_STATS);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    const { from, to } = rangeFor(range);
    // Nested select fetches items in one round-trip. Kept lean — no extras
    // needed here because top-products only care about product_name / qty
    // / line_total_cents.
    supabase
      .from('orders')
      .select(
        'id, business_id, short_code, tracking_token, status, type, table_number, notes, ' +
          'customer_name, customer_phone, customer_email, subtotal_cents, total_cents, currency, ' +
          'cancel_reason, created_at, updated_at, accepted_at, completed_at, ' +
          'items:order_items(id, order_id, product_id, variant_id, product_name, variant_name, ' +
          'unit_price_cents, quantity, line_total_cents, note)',
      )
      .eq('business_id', businessId)
      .gte('created_at', from.toISOString())
      .lt('created_at', to.toISOString())
      .order('created_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          setError(err.message);
          setStats(EMPTY_STATS);
        } else {
          setStats(aggregate((data as unknown as Order[]) ?? []));
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [businessId, range]);

  return { stats: stats ?? EMPTY_STATS, loading, error };
}
