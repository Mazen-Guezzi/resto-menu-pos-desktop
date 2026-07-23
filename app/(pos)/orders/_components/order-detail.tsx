'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Printer, X, ChevronRight, Utensils, ShoppingBag, Bike, ChefHat, Receipt } from 'lucide-react';
import type { Business, Order, OrderStatus, OrderType } from '../../../lib/orders/types';
import { formatCents, formatClock, formatRelativeTime } from '../../../lib/orders/format';
import { canCancel, NEXT_STATUS } from '../../../lib/orders/status';
import { updateOrderStatus } from '../../../lib/orders/mutations';
import { friendlyErrorMessage, friendlyPrintErrors } from '../../../lib/orders/errors';
import { printOrder } from '../../../lib/orders/print';
import { getPosApi } from '../../../lib/pos-api';
import { StatusPill } from './status-pill';

const TYPE_ICON: Record<OrderType, typeof Check> = {
  dine_in: Utensils,
  takeaway: ShoppingBag,
  delivery: Bike,
};

const NEXT_LABEL_KEY: Record<OrderStatus, string | null> = {
  pending: 'orders.action.accept',
  accepted: 'orders.action.startPreparing',
  preparing: 'orders.action.markReady',
  ready: 'orders.action.complete',
  completed: null,
  cancelled: null,
};

const TYPE_KEY = {
  dine_in: 'dineIn',
  takeaway: 'takeaway',
  delivery: 'delivery',
} as const;

export function OrderDetail({ order, business }: { order: Order | null; business: Business | null }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<'advance' | 'cancel' | 'print' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [askCancel, setAskCancel] = useState(false);

  if (!order) {
    return (
      <div style={{ ...styles.empty }}>
        <div>{t('orders.selectOrder')}</div>
      </div>
    );
  }

  const nextStatus = NEXT_STATUS[order.status];
  const nextLabelKey = NEXT_LABEL_KEY[order.status];
  const cancellable = canCancel(order.status);
  const items = order.items ?? [];

  const doAdvance = async () => {
    if (!nextStatus || busy) return;
    setBusy('advance');
    setError(null);
    const { error: err } = await updateOrderStatus(order.id, nextStatus);
    if (err) {
      setBusy(null);
      setError(friendlyErrorMessage(err, t));
      return;
    }
    // Auto-print both tickets on acceptance if the pref is on. Runs in the
    // background — advance UI unblocks immediately, print errors surface
    // via the error banner but don't undo the status change.
    if (nextStatus === 'accepted') {
      const pos = getPosApi();
      const autoPrint = pos ? await pos.prefs.get<boolean>('autoPrintOnAccept') : true;
      if (autoPrint) {
        printOrder(order, business, 'both').then((r) => {
          if (!r.ok) setError(friendlyPrintErrors(r.errors, t, 'auto'));
        });
      }
    }
    setBusy(null);
  };

  const doPrint = async (mode: 'customer' | 'kitchen' | 'both') => {
    if (busy) return;
    setBusy('print');
    setError(null);
    const r = await printOrder(order, business, mode);
    setBusy(null);
    if (!r.ok) setError(friendlyPrintErrors(r.errors, t, 'manual'));
  };

  const doCancel = async () => {
    if (busy) return;
    setBusy('cancel');
    setError(null);
    const { error: err } = await updateOrderStatus(order.id, 'cancelled', cancelReason || null);
    setBusy(null);
    if (err) setError(friendlyErrorMessage(err, t));
    else {
      setAskCancel(false);
      setCancelReason('');
    }
  };

  return (
    <div style={styles.wrap}>
      {(() => {
        const TypeIcon = TYPE_ICON[order.type];
        return (
          <header style={styles.header}>
            <div>
              <div style={styles.code}>#{order.short_code}</div>
              <div style={styles.title}>{order.customer_name || t('common.guest')}</div>
              <div style={styles.meta}>
                <TypeIcon size={12} style={{ opacity: 0.6, verticalAlign: 'middle', marginInlineEnd: 4 }} />
                {order.type === 'dine_in' && order.table_number
                  ? `${t('orders.table')} ${order.table_number}`
                  : t(`orders.type.${TYPE_KEY[order.type]}`)}
                {' · '}
                <span>{formatClock(order.created_at)}</span>
                {' · '}
                <span>{formatRelativeTime(order.created_at, t)}</span>
              </div>
            </div>
            <StatusPill status={order.status} />
          </header>
        );
      })()}

      <section style={styles.section}>
        <div style={styles.sectionTitle}>{t('orders.items')}</div>
        <ul style={styles.items}>
          {items.map((it) => (
            <li key={it.id} style={styles.item}>
              <div style={styles.itemRow}>
                <span style={styles.qty}>{it.quantity}×</span>
                <span style={{ flex: 1 }}>
                  {it.product_name}
                  {it.variant_name ? ` — ${it.variant_name}` : ''}
                </span>
                <span style={styles.price}>{formatCents(it.line_total_cents, order.currency)}</span>
              </div>
              {(it.extras ?? []).length > 0 && (
                <ul style={styles.extras}>
                  {(it.extras ?? []).map((ex) => (
                    <li key={ex.id} style={styles.extra}>
                      <span>+ {ex.name}</span>
                      {ex.price_cents > 0 && (
                        <span style={{ opacity: 0.7 }}>
                          +{formatCents(ex.price_cents, order.currency)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {it.note && <div style={styles.note}>“{it.note}”</div>}
            </li>
          ))}
          {items.length === 0 && (
            <li style={{ padding: 12, opacity: 0.5, fontSize: 13 }}>{t('orders.noItems')}</li>
          )}
        </ul>
      </section>

      <section style={styles.section}>
        <div style={styles.totalRow}>
          <span style={{ opacity: 0.7 }}>{t('orders.subtotal')}</span>
          <span>{formatCents(order.subtotal_cents, order.currency)}</span>
        </div>
        {order.discount_cents != null && order.discount_cents > 0 && (
          <div style={styles.totalRow}>
            <span style={{ opacity: 0.7 }}>{t('orders.discount')}</span>
            <span style={{ color: '#4ade80' }}>
              −{formatCents(order.discount_cents, order.currency)}
            </span>
          </div>
        )}
        {order.delivery_fee_cents != null && order.delivery_fee_cents > 0 && (
          <div style={styles.totalRow}>
            <span style={{ opacity: 0.7 }}>{t('orders.deliveryFee')}</span>
            <span>{formatCents(order.delivery_fee_cents, order.currency)}</span>
          </div>
        )}
        <div style={{ ...styles.totalRow, fontWeight: 700, fontSize: 16, marginTop: 6 }}>
          <span>{t('orders.total')}</span>
          <span>{formatCents(order.total_cents, order.currency)}</span>
        </div>
      </section>

      {order.notes && (
        <section style={styles.section}>
          <div style={styles.sectionTitle}>{t('orders.customerNote')}</div>
          <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{order.notes}</div>
        </section>
      )}

      {order.status === 'cancelled' && order.cancel_reason && (
        <section style={styles.section}>
          <div style={styles.sectionTitle}>{t('orders.cancelReason')}</div>
          <div style={{ fontSize: 13 }}>{order.cancel_reason}</div>
        </section>
      )}

      {error && <div style={styles.error}>{error}</div>}

      <footer style={styles.actions}>
        {nextStatus && nextLabelKey && (
          <button
            onClick={doAdvance}
            disabled={busy !== null}
            style={{ ...styles.primary, opacity: busy ? 0.5 : 1 }}
          >
            {busy === 'advance' ? '…' : (
              <>
                {order.status === 'pending' ? <Check size={16} /> : <ChevronRight size={16} />}
                <span>{t(nextLabelKey)}</span>
              </>
            )}
          </button>
        )}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <button
            onClick={() => doPrint('both')}
            disabled={busy !== null}
            style={{ ...styles.secondary, opacity: busy ? 0.5 : 1 }}
            title={t('orders.action.print')}
          >
            <Printer size={14} />
            <span>{busy === 'print' ? '…' : t('orders.action.print')}</span>
          </button>
          <button
            onClick={() => doPrint('kitchen')}
            disabled={busy !== null}
            style={{ ...styles.secondary, opacity: busy ? 0.5 : 1 }}
            title={t('orders.action.printKitchen')}
          >
            <ChefHat size={14} />
            <span>{t('orders.action.kitchen')}</span>
          </button>
          <button
            onClick={() => doPrint('customer')}
            disabled={busy !== null}
            style={{ ...styles.secondary, opacity: busy ? 0.5 : 1 }}
            title={t('orders.action.printCustomer')}
          >
            <Receipt size={14} />
            <span>{t('orders.action.customer')}</span>
          </button>
        </div>
        {cancellable &&
          (askCancel ? (
            <div style={{ display: 'flex', gap: 6, flex: 1 }}>
              <input
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder={t('common.reason')}
                style={{
                  flex: 1,
                  background: '#0f1115',
                  color: '#e6e8ec',
                  border: '1px solid #2a2f3d',
                  borderRadius: 6,
                  padding: '8px 10px',
                  fontSize: 13,
                }}
              />
              <button
                onClick={doCancel}
                disabled={busy !== null}
                style={{ ...styles.danger, opacity: busy ? 0.5 : 1 }}
              >
                {busy === 'cancel' ? '…' : t('common.confirm')}
              </button>
              <button onClick={() => setAskCancel(false)} style={styles.ghost}>
                {t('common.back')}
              </button>
            </div>
          ) : (
            <button onClick={() => setAskCancel(true)} style={styles.dangerGhost}>
              <X size={14} />
              <span>{t('orders.action.cancel')}</span>
            </button>
          ))}
      </footer>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflowY: 'auto',
  },
  empty: {
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.4,
    fontSize: 13,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '18px 20px',
    borderBottom: '1px solid #1a1d24',
  },
  code: { fontFamily: 'monospace', fontSize: 12, opacity: 0.55, marginBottom: 4 },
  title: { fontSize: 20, fontWeight: 700 },
  meta: { fontSize: 12, opacity: 0.6, marginTop: 4 },
  section: { padding: '16px 20px', borderBottom: '1px solid #1a1d24' },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.5,
    opacity: 0.5,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  items: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 },
  item: { fontSize: 14 },
  itemRow: { display: 'flex', alignItems: 'baseline', gap: 8 },
  qty: { fontFamily: 'monospace', color: '#9ca3af', minWidth: 24 },
  price: { fontWeight: 500, fontVariantNumeric: 'tabular-nums' },
  extras: {
    listStyle: 'none',
    margin: '4px 0 0 32px',
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  extra: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 12,
    opacity: 0.8,
  },
  note: {
    marginLeft: 32,
    marginTop: 4,
    fontSize: 12,
    fontStyle: 'italic',
    opacity: 0.65,
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '3px 0',
    fontSize: 14,
    fontVariantNumeric: 'tabular-nums',
  },
  actions: {
    display: 'flex',
    gap: 8,
    padding: 16,
    borderTop: '1px solid #1a1d24',
    marginTop: 'auto',
    flexWrap: 'wrap',
  },
  primary: {
    background: '#f56c12',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    padding: '10px 18px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    flex: 1,
    minWidth: 140,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  secondary: {
    background: '#1f2937',
    color: '#e6e8ec',
    border: '1px solid #374151',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  },
  danger: {
    background: '#dc2626',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    padding: '8px 14px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  dangerGhost: {
    background: 'transparent',
    color: '#fca5a5',
    border: '1px solid #7f1d1d',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 13,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  },
  ghost: {
    background: 'transparent',
    color: '#9ca3af',
    border: '1px solid #374151',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 13,
    cursor: 'pointer',
  },
  error: {
    margin: '0 20px 12px',
    padding: 10,
    background: '#3b1a1a',
    color: '#fca5a5',
    border: '1px solid #7f1d1d',
    borderRadius: 6,
    fontSize: 13,
  },
};
