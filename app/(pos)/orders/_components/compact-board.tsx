'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Printer, Check, ChevronRight, Minimize2 } from 'lucide-react';
import type { Business, Order, OrderStatus, OrderType } from '../../../lib/orders/types';
import { formatCents, formatRelativeTime } from '../../../lib/orders/format';
import { NEXT_STATUS } from '../../../lib/orders/status';
import { updateOrderStatus } from '../../../lib/orders/mutations';
import { printOrder } from '../../../lib/orders/print';
import { getPosApi } from '../../../lib/pos-api';
import { StatusPill } from './status-pill';

const TYPE_KEY: Record<OrderType, 'dineIn' | 'takeaway' | 'delivery'> = {
  dine_in: 'dineIn',
  takeaway: 'takeaway',
  delivery: 'delivery',
};

const NEXT_LABEL_KEY: Record<OrderStatus, string | null> = {
  pending: 'orders.action.accept',
  accepted: 'orders.action.startPreparing',
  preparing: 'orders.action.markReady',
  ready: 'orders.action.complete',
  completed: null,
  cancelled: null,
};

/**
 * Compact orders view for the floating window. Vertical list of pending
 * orders, tap a row to expand items inline and get Accept/Print buttons.
 * No detail pane, no tabs — one job: see and accept new orders fast.
 */
export function CompactBoard({
  orders,
  business,
  pending,
}: {
  orders: Order[];
  business: Business | null;
  pending: number;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const visible = orders
    .filter((o) => o.status === 'pending' || o.status === 'accepted' || o.status === 'preparing' || o.status === 'ready')
    .slice(0, 30);

  const exitFloating = () => getPosApi()?.window.setFloating(false);

  const accept = async (o: Order) => {
    const next = NEXT_STATUS[o.status];
    if (!next) return;
    setBusy(o.id);
    await updateOrderStatus(o.id, next);
    const pos = getPosApi();
    const autoPrint = pos ? await pos.prefs.get<boolean>('autoPrintOnAccept') : true;
    if (o.status === 'pending' && autoPrint) {
      printOrder(o, business, 'both').catch(() => {});
    }
    setBusy(null);
  };

  const printBoth = async (o: Order) => {
    setBusy(o.id);
    await printOrder(o, business, 'both');
    setBusy(null);
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>{t('compact.title')}</div>
          <div style={styles.subtitle}>
            {pending > 0 ? (
              <span style={{ color: '#fbbf24' }}>{t('compact.new', { count: pending })}</span>
            ) : (
              <span>{t('compact.allCaughtUp')}</span>
            )}
          </div>
        </div>
        <button onClick={exitFloating} style={styles.exitBtn} title={t('compact.exit')}>
          <Minimize2 size={14} />
        </button>
      </div>

      <ul style={styles.list}>
        {visible.length === 0 && <li style={styles.empty}>{t('compact.noActive')}</li>}
        {visible.map((o) => {
          const isOpen = expanded === o.id;
          const nextLabelKey = NEXT_LABEL_KEY[o.status];
          const secondary =
            o.type === 'dine_in' && o.table_number
              ? `${t('orders.table')} ${o.table_number}`
              : t(`orders.type.${TYPE_KEY[o.type]}`);
          return (
            <li key={o.id} style={styles.row}>
              <button
                onClick={() => setExpanded(isOpen ? null : o.id)}
                style={styles.rowButton}
              >
                <div style={styles.rowMain}>
                  <div style={styles.rowTop}>
                    <span style={styles.code}>#{o.short_code}</span>
                    <StatusPill status={o.status} />
                  </div>
                  <div style={styles.rowBody}>
                    <span style={styles.name}>{o.customer_name || t('common.guest')}</span>
                    <span style={styles.total}>
                      {formatCents(o.total_cents, o.currency)}
                    </span>
                  </div>
                  <div style={styles.rowBottom}>
                    <span>{secondary}</span>
                    <span>·</span>
                    <span>{formatRelativeTime(o.created_at, t)}</span>
                  </div>
                </div>
                <span style={{ ...styles.chev, transform: isOpen ? 'rotate(90deg)' : 'none' }}>
                  <ChevronRight size={16} />
                </span>
              </button>
              {isOpen && (
                <div style={styles.expanded}>
                  <ul style={styles.items}>
                    {(o.items ?? []).map((it) => (
                      <li key={it.id} style={styles.item}>
                        <span style={{ fontFamily: 'monospace', opacity: 0.7 }}>
                          {it.quantity}×
                        </span>
                        <span style={{ flex: 1 }}>
                          {it.product_name}
                          {it.variant_name ? ` — ${it.variant_name}` : ''}
                        </span>
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatCents(it.line_total_cents, o.currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {o.notes && <div style={styles.notes}>“{o.notes}”</div>}
                  <div style={styles.actions}>
                    {nextLabelKey && (
                      <button
                        onClick={() => accept(o)}
                        disabled={busy === o.id}
                        style={{ ...styles.primary, opacity: busy === o.id ? 0.5 : 1 }}
                      >
                        {busy === o.id ? (
                          '…'
                        ) : (
                          <>
                            {o.status === 'pending' ? <Check size={14} /> : <ChevronRight size={14} />}
                            <span>{t(nextLabelKey)}</span>
                          </>
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => printBoth(o)}
                      disabled={busy === o.id}
                      style={{ ...styles.secondary, opacity: busy === o.id ? 0.5 : 1 }}
                      title={t('orders.action.print')}
                    >
                      <Printer size={13} />
                      <span>{t('orders.action.print')}</span>
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', height: '100%', background: '#0d0f14' },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    borderBottom: '1px solid #232733',
    background: '#12141a',
  },
  title: { fontSize: 14, fontWeight: 700 },
  subtitle: { fontSize: 11, opacity: 0.6, marginTop: 2 },
  exitBtn: {
    background: 'transparent',
    color: '#9ca3af',
    border: '1px solid #374151',
    borderRadius: 6,
    width: 28,
    height: 28,
    fontSize: 14,
    cursor: 'pointer',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    overflowY: 'auto',
    flex: 1,
  },
  empty: {
    padding: 40,
    textAlign: 'center' as const,
    opacity: 0.4,
    fontSize: 12,
  },
  row: { borderBottom: '1px solid #1a1d24' },
  rowButton: {
    display: 'flex',
    alignItems: 'stretch',
    gap: 8,
    width: '100%',
    background: 'transparent',
    border: 'none',
    padding: '10px 12px',
    color: 'inherit',
    fontFamily: 'inherit',
    textAlign: 'left' as const,
    cursor: 'pointer',
  },
  rowMain: { flex: 1, display: 'flex', flexDirection: 'column', gap: 4 },
  rowTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  rowBody: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 8,
  },
  rowBottom: {
    display: 'flex',
    gap: 6,
    fontSize: 10.5,
    opacity: 0.55,
    marginTop: 2,
  },
  code: { fontFamily: 'monospace', fontSize: 11, opacity: 0.7 },
  name: { fontSize: 13, fontWeight: 500 },
  total: { fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
  chev: {
    fontSize: 18,
    opacity: 0.5,
    alignSelf: 'center',
    transition: 'transform 0.15s',
  },
  expanded: {
    padding: '0 12px 12px',
    background: '#0b0d12',
    borderTop: '1px solid #1a1d24',
  },
  items: {
    listStyle: 'none',
    margin: '10px 0 8px',
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  item: {
    display: 'flex',
    gap: 8,
    fontSize: 12,
    alignItems: 'baseline',
  },
  notes: {
    fontSize: 11,
    fontStyle: 'italic',
    opacity: 0.7,
    padding: '4px 0',
  },
  actions: { display: 'flex', gap: 6, marginTop: 8 },
  primary: {
    flex: 1,
    background: '#f56c12',
    color: 'white',
    border: 'none',
    borderRadius: 6,
    padding: '8px 12px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  secondary: {
    background: '#1f2937',
    color: '#e6e8ec',
    border: '1px solid #374151',
    borderRadius: 6,
    padding: '8px 10px',
    fontSize: 12,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
  },
};
