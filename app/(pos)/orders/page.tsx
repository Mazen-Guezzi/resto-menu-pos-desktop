'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../lib/session-context';
import {
  useBusinesses,
  useOrdersList,
  usePendingOrdersCount,
} from '../../lib/orders/hooks';
import { playNewOrderSound } from '../../lib/orders/sound';
import { getPosApi } from '../../lib/pos-api';
import { TAB_STATUSES, type Tab } from '../../lib/orders/status';
import type { Order } from '../../lib/orders/types';
import { useIsCompact } from '../../lib/orders/use-is-compact';
import { StatusTabs } from './_components/tabs';
import { BusinessPicker } from './_components/business-picker';
import { OrderList } from './_components/order-list';
import { OrderDetail } from './_components/order-detail';
import { CompactBoard } from './_components/compact-board';

const NOTIFIED_KEY = 'swiftqr:orders:notified';

function markNotified(id: number): boolean {
  try {
    const raw = sessionStorage.getItem(NOTIFIED_KEY);
    const set = new Set(raw ? (JSON.parse(raw) as number[]) : []);
    if (set.has(id)) return false;
    set.add(id);
    // Cap the set at 500 IDs to keep sessionStorage small.
    const trimmed = Array.from(set).slice(-500);
    sessionStorage.setItem(NOTIFIED_KEY, JSON.stringify(trimmed));
    return true;
  } catch {
    return true;
  }
}

export default function OrdersPage() {
  const { t } = useTranslation();
  const { activeBusinessId } = useSession();
  const { businesses, active, setActive } = useBusinesses();
  const businessId = active?.id ?? (activeBusinessId ? Number(activeBusinessId) : null);

  const { orders, loading, setNewOrderHandler } = useOrdersList(businessId);
  const pending = usePendingOrdersCount(businessId);
  const isCompact = useIsCompact();

  const [tab, setTab] = useState<Tab>('new');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Sound + native notification on new orders.
  useEffect(() => {
    setNewOrderHandler((o: Order) => {
      if (!markNotified(o.id)) return;
      playNewOrderSound();
      const pos = getPosApi();
      const items = (o.items ?? []).reduce((s, i) => s + i.quantity, 0);
      pos?.notify.newOrder({
        orderId: o.id,
        title: `${t('orders.status.pending')} · #${o.short_code}`,
        body: `${o.customer_name || t('common.guest')} — ${t('orders.itemCount', { count: items })}`,
      });
    });
  }, [setNewOrderHandler, t]);

  // Native-notification click → jump to that order.
  useEffect(() => {
    const pos = getPosApi();
    if (!pos) return;
    return pos.notify.onClick(({ orderId }) => {
      setSelectedId(orderId);
      const found = orders.find((o) => o.id === orderId);
      if (found) {
        for (const t of Object.keys(TAB_STATUSES) as Tab[]) {
          if (TAB_STATUSES[t].includes(found.status)) {
            setTab(t);
            break;
          }
        }
      }
    });
  }, [orders]);

  // Tray / dock badge tracks pending count.
  useEffect(() => {
    getPosApi()?.badge.set(pending);
  }, [pending]);

  // Counts per tab.
  const counts = useMemo<Record<Tab, number>>(() => {
    const c: Record<Tab, number> = { new: 0, in_progress: 0, done: 0, cancelled: 0 };
    for (const o of orders) {
      for (const t of Object.keys(TAB_STATUSES) as Tab[]) {
        if (TAB_STATUSES[t].includes(o.status)) {
          c[t] += 1;
          break;
        }
      }
    }
    return c;
  }, [orders]);

  const visible = useMemo(
    () => orders.filter((o) => TAB_STATUSES[tab].includes(o.status)),
    [orders, tab],
  );

  // Auto-select first visible if nothing selected or the selected one is no longer visible.
  const prevTab = useRef(tab);
  useEffect(() => {
    if (visible.length === 0) return;
    const selectedStillVisible = selectedId != null && visible.some((o) => o.id === selectedId);
    if (!selectedStillVisible || prevTab.current !== tab) {
      setSelectedId(visible[0].id);
      prevTab.current = tab;
    }
  }, [visible, selectedId, tab]);

  const selected = orders.find((o) => o.id === selectedId) ?? null;

  if (isCompact) {
    return <CompactBoard orders={orders} business={active} pending={pending} />;
  }

  return (
    <div style={styles.root}>
      <div style={styles.topBar}>
        {businesses === null ? (
          <span style={{ fontSize: 12, opacity: 0.5 }}>{t('orders.loadingBusinesses')}</span>
        ) : businesses.length === 0 ? (
          <span style={{ fontSize: 12, color: '#fbbf24' }}>{t('orders.noBusinesses')}</span>
        ) : (
          <BusinessPicker
            businesses={businesses}
            activeId={businessId}
            onChange={setActive}
          />
        )}
        <div style={{ marginInlineStart: 'auto', fontSize: 12, opacity: 0.6 }}>
          {pending > 0 ? (
            <span style={{ color: '#fbbf24' }}>{t('orders.pendingCount', { count: pending })}</span>
          ) : (
            <span>{t('orders.allCaughtUp')}</span>
          )}
        </div>
      </div>

      <StatusTabs active={tab} counts={counts} onChange={setTab} />

      <div style={styles.split}>
        <div style={styles.leftCol}>
          <OrderList
            orders={visible}
            selectedId={selectedId}
            onSelect={setSelectedId}
            loading={loading}
            emptyText={
              tab === 'new'
                ? t('orders.waitingNext')
                : t('orders.noOrdersIn', { tab: t(`orders.tabs.${tabKey(tab)}`) })
            }
          />
        </div>
        <div style={styles.rightCol}>
          <OrderDetail order={selected} business={active} />
        </div>
      </div>
    </div>
  );
}

function tabKey(tab: Tab): 'new' | 'inProgress' | 'done' | 'cancelled' {
  return tab === 'in_progress' ? 'inProgress' : tab;
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 16px',
    borderBottom: '1px solid #232733',
    background: '#0e1017',
  },
  split: {
    flex: 1,
    display: 'flex',
    minHeight: 0,
  },
  leftCol: {
    width: 360,
    borderRight: '1px solid #232733',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    background: '#0d0f14',
  },
  rightCol: { flex: 1, minWidth: 0, background: '#0f1115' },
};
