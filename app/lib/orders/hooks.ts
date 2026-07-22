'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { useSession } from '../session-context';
import type { Business, Order } from './types';

type RealtimeHandlers = {
  onInsert?: (row: Order) => void;
  onUpdate?: (row: Order) => void;
};

export function useOrdersRealtime(businessId: number | null | undefined, handlers: RealtimeHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!businessId) return;
    const channelId = `orders_business_${businessId}_${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes' as never,
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `business_id=eq.${businessId}`,
        },
        (payload: { new: Order }) => handlersRef.current.onInsert?.(payload.new),
      )
      .on(
        'postgres_changes' as never,
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `business_id=eq.${businessId}`,
        },
        (payload: { new: Order }) => handlersRef.current.onUpdate?.(payload.new),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [businessId]);
}

/**
 * Live pending-orders count for tray/dock badge + top-bar chip.
 * Matches the PWA's 4-layer sync: realtime + visibilitychange + polling + initial.
 */
export function usePendingOrdersCount(businessId: number | null | undefined) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!businessId) {
      setCount(0);
      return;
    }
    const { count: c, error } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('status', 'pending');
    if (error) {
      console.warn('pending orders count failed', error);
      return;
    }
    setCount(c ?? 0);
  }, [businessId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!businessId) return;
    const channel = supabase
      .channel(`orders_badge_${businessId}`)
      .on(
        'postgres_changes' as never,
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `business_id=eq.${businessId}`,
        },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [businessId, refresh]);

  useEffect(() => {
    if (!businessId) return;
    const id = setInterval(refresh, 10_000);
    return () => clearInterval(id);
  }, [businessId, refresh]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  return count;
}

/**
 * Fetches the user's businesses and syncs the active choice with electron-store.
 * Returns null businesses while loading; empty array if the user has none.
 */
export function useBusinesses(): {
  businesses: Business[] | null;
  active: Business | null;
  setActive: (id: number) => void;
  loading: boolean;
} {
  const { user, activeBusinessId, setActiveBusinessId } = useSession();
  const [businesses, setBusinesses] = useState<Business[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from('businesses')
      .select('id, name, user_id, address, phone_number')
      .eq('user_id', user.id)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('fetch businesses failed', error);
          setBusinesses([]);
        } else {
          setBusinesses((data as Business[]) ?? []);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!businesses || businesses.length === 0) return;
    const stored = activeBusinessId ? Number(activeBusinessId) : null;
    const found = stored ? businesses.find((b) => b.id === stored) : null;
    if (!found) {
      void setActiveBusinessId(String(businesses[0].id));
    }
  }, [businesses, activeBusinessId, setActiveBusinessId]);

  const active = businesses?.find((b) => b.id === Number(activeBusinessId)) ?? null;

  return {
    businesses,
    active,
    setActive: (id: number) => void setActiveBusinessId(String(id)),
    loading,
  };
}

/**
 * Full order list for the given business, keyed by id. Reacts to realtime
 * INSERT/UPDATE and appends/patches in place. Also refreshes on foreground.
 */
export function useOrdersList(businessId: number | null | undefined) {
  const [ordersById, setOrdersById] = useState<Record<number, Order>>({});
  const [loading, setLoading] = useState(true);
  const newOrderCallback = useRef<((o: Order) => void) | null>(null);

  const setNewOrderHandler = useCallback((cb: (o: Order) => void) => {
    newOrderCallback.current = cb;
  }, []);

  const fetchAll = useCallback(async () => {
    if (!businessId) {
      setOrdersById({});
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('orders')
      .select('*, items:order_items(*, extras:order_item_extras(*))')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      console.error('fetch orders failed', error);
      setOrdersById({});
    } else {
      const map: Record<number, Order> = {};
      (data as Order[])?.forEach((o) => {
        map[o.id] = o;
      });
      setOrdersById(map);
    }
    setLoading(false);
  }, [businessId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const fetchOne = useCallback(async (id: number): Promise<Order | null> => {
    const { data, error } = await supabase
      .from('orders')
      .select('*, items:order_items(*, extras:order_item_extras(*))')
      .eq('id', id)
      .single();
    if (error) {
      console.warn('fetch one order failed', error);
      return null;
    }
    return data as Order;
  }, []);

  useOrdersRealtime(businessId, {
    onInsert: async (row) => {
      // Realtime payload lacks nested items — fetch the full row so the
      // detail panel has everything without a click.
      const full = (await fetchOne(row.id)) ?? row;
      setOrdersById((prev) => ({ ...prev, [full.id]: full }));
      newOrderCallback.current?.(full);
    },
    onUpdate: async (row) => {
      const full = (await fetchOne(row.id)) ?? row;
      setOrdersById((prev) => ({ ...prev, [full.id]: full }));
    },
  });

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchAll();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [fetchAll]);

  const orders = Object.values(ordersById).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return { orders, loading, refresh: fetchAll, setNewOrderHandler };
}
