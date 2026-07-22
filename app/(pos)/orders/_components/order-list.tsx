'use client';

import { useTranslation } from 'react-i18next';
import type { Order, OrderType } from '../../../lib/orders/types';
import { formatCents, formatRelativeTime } from '../../../lib/orders/format';
import { StatusPill } from './status-pill';

const TYPE_KEY: Record<OrderType, 'dineIn' | 'takeaway' | 'delivery'> = {
  dine_in: 'dineIn',
  takeaway: 'takeaway',
  delivery: 'delivery',
};

export function OrderList({
  orders,
  selectedId,
  onSelect,
  loading,
  emptyText,
}: {
  orders: Order[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  loading: boolean;
  emptyText: string;
}) {
  const { t } = useTranslation();
  if (loading && orders.length === 0) {
    return <div style={styles.empty}>{t('common.loading')}</div>;
  }
  if (orders.length === 0) {
    return <div style={styles.empty}>{emptyText}</div>;
  }
  return (
    <ul style={styles.list}>
      {orders.map((o) => {
        const isSelected = o.id === selectedId;
        const itemCount = (o.items ?? []).reduce((s, i) => s + i.quantity, 0);
        const secondary =
          o.type === 'dine_in' && o.table_number
            ? `${t('orders.table')} ${o.table_number}`
            : t(`orders.type.${TYPE_KEY[o.type]}`);
        return (
          <li
            key={o.id}
            onClick={() => onSelect(o.id)}
            style={{
              ...styles.row,
              background: isSelected ? '#1a1f2e' : 'transparent',
              borderLeft: `3px solid ${isSelected ? '#f56c12' : 'transparent'}`,
            }}
          >
            <div style={styles.rowTop}>
              <span style={styles.code}>#{o.short_code}</span>
              <StatusPill status={o.status} />
            </div>
            <div style={styles.rowMiddle}>
              <span style={styles.name}>{o.customer_name || t('common.guest')}</span>
              <span style={styles.total}>{formatCents(o.total_cents, o.currency)}</span>
            </div>
            <div style={styles.rowBottom}>
              <span>{secondary}</span>
              <span>·</span>
              <span>{t('orders.itemCount', { count: itemCount })}</span>
              <span style={{ marginInlineStart: 'auto' }}>
                {formatRelativeTime(o.created_at, t)}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const styles: Record<string, React.CSSProperties> = {
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    overflowY: 'auto',
    flex: 1,
  },
  row: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: '12px 14px',
    borderBottom: '1px solid #1a1d24',
    cursor: 'pointer',
  },
  rowTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  rowMiddle: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  rowBottom: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    opacity: 0.55,
  },
  code: { fontFamily: 'monospace', fontSize: 12, opacity: 0.75 },
  name: { fontSize: 14, fontWeight: 500 },
  total: { fontSize: 14, fontWeight: 700 },
  empty: {
    padding: 40,
    textAlign: 'center',
    opacity: 0.5,
    fontSize: 13,
  },
};
