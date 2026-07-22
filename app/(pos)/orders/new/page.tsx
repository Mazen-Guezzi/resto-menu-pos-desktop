'use client';

import { useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Trash2, Utensils, ShoppingBag, Bike, ArrowLeft, Plus, Minus, PenLine } from 'lucide-react';
import { useBusinesses } from '../../../lib/orders/hooks';
import { useMenu } from '../../../lib/menu/hooks';
import { formatCents } from '../../../lib/orders/format';
import { priceToCents } from '../../../lib/menu/types';
import type { MenuProduct } from '../../../lib/menu/types';
import {
  createOrder,
  generateShortCode,
  generateTrackingToken,
  type NewOrderLine,
  type NewOrderLineExtra,
  type NewOrderPayload,
} from '../../../lib/orders/create';
import { printOrder } from '../../../lib/orders/print';
import { getPosApi } from '../../../lib/pos-api';
import type { OrderType } from '../../../lib/orders/types';
import { MenuGrid } from './_components/menu-grid';
import { ProductPicker, type PickerConfirm } from './_components/product-picker';

type CartLine = {
  key: string;
  product_id: number | null;
  variant_id: number | null;
  product_name: string;
  variant_name: string | null;
  unit_price_cents: number;
  quantity: number;
  note: string;
  extras: NewOrderLineExtra[];
};

const newFreeformLine = (): CartLine => ({
  key: Math.random().toString(36).slice(2, 10),
  product_id: null,
  variant_id: null,
  product_name: '',
  variant_name: null,
  unit_price_cents: 0,
  quantity: 1,
  note: '',
  extras: [],
});

const lineTotal = (l: CartLine): number => {
  const extras = l.extras.reduce((s, e) => s + e.price_cents, 0);
  return (l.unit_price_cents + extras) * l.quantity;
};

export default function NewOrderPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { active, businesses, loading: bizLoading } = useBusinesses();
  const currency = 'DT';

  const { categories, loading: menuLoading } = useMenu(active?.id ?? null);

  const [customerName, setCustomerName] = useState('Walk-in');
  const [customerPhone, setCustomerPhone] = useState('');
  const [type, setType] = useState<OrderType>('dine_in');
  const [tableNumber, setTableNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<CartLine[]>([]);
  const [pickerProduct, setPickerProduct] = useState<MenuProduct | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [freeformInputs, setFreeformInputs] = useState<Record<string, { priceStr: string }>>({});

  const subtotalCents = useMemo(() => lines.reduce((s, l) => s + lineTotal(l), 0), [lines]);
  const itemCount = useMemo(() => lines.reduce((s, l) => s + l.quantity, 0), [lines]);

  const addFromPicker = (product: MenuProduct, r: PickerConfirm) => {
    const extras: NewOrderLineExtra[] = r.addons.flatMap((a) =>
      a.optionIds.map((oid) => {
        const opt = a.group.options.find((o) => o.id === oid)!;
        return {
          group_id: a.group.id,
          group_name: a.group.name,
          option_id: oid,
          name: opt.name,
          price_cents: priceToCents(opt.price_delta),
        };
      }),
    );
    const line: CartLine = {
      key: `${product.id}-${r.variant.id}-${Date.now().toString(36)}`,
      product_id: product.id,
      variant_id: r.variant.id,
      product_name: product.name,
      variant_name: r.variant.name,
      unit_price_cents: priceToCents(r.variant.discount_price ?? r.variant.price),
      quantity: r.quantity,
      note: r.note,
      extras,
    };
    setLines((prev) => [...prev, line]);
  };

  const onProductSelect = (product: MenuProduct) => {
    const availableVariants = product.variants.filter((v) => v.is_available);
    const hasAddons = product.addon_groups.length > 0;
    // Fast path: single variant, no addons → add straight to cart.
    if (availableVariants.length === 1 && !hasAddons) {
      const v = availableVariants[0];
      const line: CartLine = {
        key: `${product.id}-${v.id}-${Date.now().toString(36)}`,
        product_id: product.id,
        variant_id: v.id,
        product_name: product.name,
        variant_name: v.name,
        unit_price_cents: priceToCents(v.discount_price ?? v.price),
        quantity: 1,
        note: '',
        extras: [],
      };
      setLines((prev) => [...prev, line]);
      return;
    }
    setPickerProduct(product);
  };

  const updateQty = (key: string, delta: number) => {
    setLines((prev) =>
      prev
        .map((l) => (l.key === key ? { ...l, quantity: Math.max(0, l.quantity + delta) } : l))
        .filter((l) => l.quantity > 0),
    );
  };

  const removeLine = (key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
  };

  const addFreeform = () => {
    setLines((prev) => [...prev, newFreeformLine()]);
  };

  const updateFreeform = (key: string, patch: Partial<Pick<CartLine, 'product_name' | 'unit_price_cents'>>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const canSubmit =
    !!active &&
    customerName.trim().length > 0 &&
    subtotalCents > 0 &&
    lines.every((l) => l.product_name.trim().length > 0);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!active || !canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const payloadLines: NewOrderLine[] = lines.map((l) => ({
      product_id: l.product_id,
      variant_id: l.variant_id,
      product_name: l.product_name.trim(),
      variant_name: l.variant_name,
      unit_price_cents: l.unit_price_cents,
      quantity: l.quantity,
      note: l.note.trim() || null,
      extras: l.extras.length > 0 ? l.extras : undefined,
    }));

    const payload: NewOrderPayload = {
      business_id: active.id,
      type,
      table_number: type === 'dine_in' ? tableNumber.trim() || null : null,
      customer_name: customerName.trim(),
      customer_phone: customerPhone.trim() || '-',
      notes: notes.trim() || null,
      currency,
      lines: payloadLines,
      short_code: generateShortCode(),
      tracking_token: generateTrackingToken(),
    };

    const result = await createOrder(payload);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error ?? t('newOrder.failed'));
      return;
    }

    const pos = getPosApi();
    const autoPrint = pos ? await pos.prefs.get<boolean>('autoPrintOnAccept') : true;
    if (autoPrint && !result.offline && result.orderId) {
      const orderForPrint = {
        id: result.orderId,
        business_id: payload.business_id,
        short_code: payload.short_code,
        tracking_token: payload.tracking_token,
        status: 'pending' as const,
        type: payload.type,
        table_number: payload.table_number ?? null,
        customer_name: payload.customer_name,
        customer_phone: payload.customer_phone,
        customer_email: null,
        notes: payload.notes ?? null,
        subtotal_cents: subtotalCents,
        total_cents: subtotalCents,
        currency: payload.currency,
        cancel_reason: null,
        created_at: new Date().toISOString(),
        updated_at: null,
        accepted_at: null,
        completed_at: null,
        items: lines.map((l, i) => ({
          id: -1 - i,
          order_id: result.orderId!,
          product_id: l.product_id,
          variant_id: l.variant_id,
          product_name: l.product_name,
          variant_name: l.variant_name,
          unit_price_cents: l.unit_price_cents,
          quantity: l.quantity,
          line_total_cents: lineTotal(l),
          note: l.note || null,
          extras: l.extras.map((e, j) => ({
            id: -1 - j,
            order_item_id: -1 - i,
            extra_id: null,
            addon_option_id: e.option_id,
            addon_group_id: e.group_id,
            group_name: e.group_name,
            name: e.name,
            price_cents: e.price_cents,
          })),
        })),
      };
      printOrder(orderForPrint, active, 'kitchen');
    }

    setSuccess(
      result.offline
        ? t('newOrder.queuedOffline', { code: payload.short_code })
        : t('newOrder.createdOnline', { code: payload.short_code }),
    );

    setLines([]);
    setCustomerPhone('');
    setNotes('');
    setTableNumber('');
    setTimeout(() => router.push('/orders'), 800);
  };

  if (bizLoading || !businesses) {
    return <div style={{ padding: 24, opacity: 0.5 }}>{t('common.loading')}</div>;
  }
  if (!active) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ opacity: 0.6 }}>{t('newOrder.noBusiness')}</div>
        <Link href="/orders">{t('common.back')}</Link>
      </div>
    );
  }

  const typeIcons = { dine_in: Utensils, takeaway: ShoppingBag, delivery: Bike } as const;
  const typeLabelKey = { dine_in: 'dineIn', takeaway: 'takeaway', delivery: 'delivery' } as const;

  return (
    <>
      <div style={styles.root}>
        {/* --- Left: Menu ------------------------------------------------- */}
        <div style={styles.left}>
          <div style={styles.leftHeader}>
            <Link href="/orders" style={styles.backLink}>
              <ArrowLeft size={14} />
              <span>{t('common.back')}</span>
            </Link>
            <div style={styles.leftTitle}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{t('newOrder.title')}</div>
              <div style={{ fontSize: 12, opacity: 0.55 }}>{active.name}</div>
            </div>
          </div>
          <MenuGrid
            categories={categories}
            loading={menuLoading}
            currency={currency}
            onSelect={onProductSelect}
          />
        </div>

        {/* --- Right: Cart ------------------------------------------------ */}
        <form onSubmit={onSubmit} style={styles.right}>
          <div style={styles.cartHeader}>
            <div style={styles.cartTitle}>{t('newOrder.customer').toUpperCase()}</div>
            <div style={styles.cartCount}>
              {itemCount > 0 && t('newOrder.cartItems', { count: itemCount })}
            </div>
          </div>

          <div style={styles.cartBody}>
            {/* Cart lines */}
            {lines.length === 0 && (
              <div style={styles.cartEmpty}>{t('newOrder.cartEmpty')}</div>
            )}
            {lines.map((l) => (
              <CartLineRow
                key={l.key}
                line={l}
                currency={currency}
                onInc={() => updateQty(l.key, 1)}
                onDec={() => updateQty(l.key, -1)}
                onRemove={() => removeLine(l.key)}
                onFreeformChange={(patch) => updateFreeform(l.key, patch)}
                freeformState={freeformInputs[l.key]}
                setFreeformState={(s) => setFreeformInputs((p) => ({ ...p, [l.key]: s }))}
                t={t}
              />
            ))}

            <button type="button" onClick={addFreeform} style={styles.addFreeform}>
              <PenLine size={13} /> {t('newOrder.addLine')}
            </button>

            {/* Customer / type / table / notes */}
            <div style={styles.divider} />

            <Field label={t('newOrder.name')}>
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                required
                style={styles.input}
              />
            </Field>
            <Field label={t('newOrder.phone')}>
              <input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                style={styles.input}
              />
            </Field>

            <div style={{ marginTop: 4 }}>
              <div style={styles.miniLabel}>{t('newOrder.type')}</div>
              <div style={styles.typeRow}>
                {(['dine_in', 'takeaway', 'delivery'] as OrderType[]).map((ot) => {
                  const Icon = typeIcons[ot];
                  const active = type === ot;
                  return (
                    <button
                      type="button"
                      key={ot}
                      onClick={() => setType(ot)}
                      style={{
                        ...styles.typeBtn,
                        background: active ? '#f56c12' : 'transparent',
                        borderColor: active ? '#f56c12' : '#374151',
                        color: active ? 'white' : '#e6e8ec',
                      }}
                    >
                      <Icon size={14} />
                      <span>{t(`orders.type.${typeLabelKey[ot]}`)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {type === 'dine_in' && (
              <Field label={t('orders.table')}>
                <input
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  placeholder={t('newOrder.tablePlaceholder')}
                  style={styles.input}
                />
              </Field>
            )}

            <Field label={t('newOrder.notes')}>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                style={{ ...styles.input, resize: 'vertical' as const }}
              />
            </Field>
          </div>

          <footer style={styles.cartFooter}>
            <div style={styles.totalRow}>
              <span style={{ opacity: 0.65, fontSize: 13 }}>{t('orders.total')}</span>
              <span style={styles.totalValue}>{formatCents(subtotalCents, currency)}</span>
            </div>
            {error && <div style={styles.errorText}>{error}</div>}
            {success && <div style={styles.successText}>{success}</div>}
            <button
              type="submit"
              disabled={!canSubmit || submitting}
              style={{
                ...styles.submit,
                opacity: !canSubmit || submitting ? 0.5 : 1,
                cursor: !canSubmit || submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? t('newOrder.creating') : t('newOrder.create')}
            </button>
          </footer>
        </form>
      </div>

      {pickerProduct && (
        <ProductPicker
          product={pickerProduct}
          currency={currency}
          onClose={() => setPickerProduct(null)}
          onConfirm={(r) => {
            addFromPicker(pickerProduct, r);
            setPickerProduct(null);
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Cart line row (co-located because it's tightly coupled to the page state)
// ---------------------------------------------------------------------------

function CartLineRow({
  line,
  currency,
  onInc,
  onDec,
  onRemove,
  onFreeformChange,
  freeformState,
  setFreeformState,
  t,
}: {
  line: CartLine;
  currency: string;
  onInc: () => void;
  onDec: () => void;
  onRemove: () => void;
  onFreeformChange: (patch: Partial<Pick<CartLine, 'product_name' | 'unit_price_cents'>>) => void;
  freeformState: { priceStr: string } | undefined;
  setFreeformState: (s: { priceStr: string }) => void;
  t: (k: string, o?: Record<string, unknown>) => string;
}) {
  const isFreeform = line.product_id == null;
  const displayTotal = lineTotal(line);

  if (isFreeform) {
    const priceStr = freeformState?.priceStr ?? (line.unit_price_cents / 100).toString();
    return (
      <div style={styles.cartRow}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input
            value={line.product_name}
            onChange={(e) => onFreeformChange({ product_name: e.target.value })}
            placeholder={t('newOrder.productPlaceholder')}
            style={styles.input}
          />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              value={priceStr}
              onChange={(e) => {
                const s = e.target.value;
                setFreeformState({ priceStr: s });
                const cents = Math.round(parseFloat(s.replace(',', '.')) * 100);
                onFreeformChange({ unit_price_cents: Number.isFinite(cents) ? cents : 0 });
              }}
              placeholder="0.00"
              inputMode="decimal"
              style={{ ...styles.input, width: 84 }}
            />
            <QtyGroup qty={line.quantity} onInc={onInc} onDec={onDec} />
            <span style={styles.linePrice}>{formatCents(displayTotal, currency)}</span>
            <button type="button" onClick={onRemove} style={styles.removeBtn} aria-label={t('newOrder.removeLine')}>
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.cartRow}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={styles.cartRowName}>{line.product_name}</div>
        {line.variant_name && <div style={styles.cartRowSub}>{line.variant_name}</div>}
        {line.extras.length > 0 && (
          <div style={styles.cartRowExtras}>
            {line.extras.map((e, i) => (
              <span key={i}>{e.name}{e.price_cents > 0 ? ` +${formatCents(e.price_cents, currency)}` : ''}</span>
            ))}
          </div>
        )}
        {line.note && <div style={styles.cartRowNote}>“{line.note}”</div>}
      </div>
      <div style={styles.cartRowRight}>
        <QtyGroup qty={line.quantity} onInc={onInc} onDec={onDec} />
        <span style={styles.linePrice}>{formatCents(displayTotal, currency)}</span>
        <button type="button" onClick={onRemove} style={styles.removeBtn} aria-label={t('newOrder.removeLine')}>
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function QtyGroup({ qty, onInc, onDec }: { qty: number; onInc: () => void; onDec: () => void }) {
  return (
    <div style={styles.qtyGroup}>
      <button type="button" onClick={onDec} style={styles.qtyBtn} aria-label="decrease">
        <Minus size={12} />
      </button>
      <div style={styles.qtyValue}>{qty}</div>
      <button type="button" onClick={onInc} style={styles.qtyBtn} aria-label="increase">
        <Plus size={12} />
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={styles.field}>
      <span style={styles.miniLabel}>{label}</span>
      {children}
    </label>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 380px',
    height: '100%',
    minHeight: 0,
  },
  left: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    borderRight: '1px solid #232733',
  },
  leftHeader: {
    padding: '12px 14px 4px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    color: '#9ca3af',
    textDecoration: 'none',
    alignSelf: 'flex-start',
  },
  leftTitle: { display: 'flex', flexDirection: 'column', gap: 2 },

  right: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    background: '#0d0f14',
  },
  cartHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 14px 8px',
    borderBottom: '1px solid #1a1d24',
  },
  cartTitle: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.5,
    opacity: 0.75,
  },
  cartCount: { fontSize: 11, opacity: 0.5 },
  cartBody: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    minHeight: 0,
  },
  cartEmpty: {
    padding: '32px 12px',
    textAlign: 'center' as const,
    opacity: 0.5,
    fontSize: 12,
    lineHeight: 1.5,
  },
  cartRow: {
    display: 'flex',
    gap: 10,
    padding: '10px 4px',
    borderBottom: '1px solid #1a1d24',
  },
  cartRowName: { fontSize: 13, fontWeight: 600, lineHeight: 1.3 },
  cartRowSub: { fontSize: 11, opacity: 0.7, marginTop: 2 },
  cartRowExtras: {
    fontSize: 11,
    opacity: 0.65,
    marginTop: 4,
    display: 'flex',
    flexWrap: 'wrap',
    gap: '2px 8px',
  },
  cartRowNote: { fontSize: 11, fontStyle: 'italic' as const, opacity: 0.65, marginTop: 3 },
  cartRowRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  qtyGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    border: '1px solid #2a2f3d',
    borderRadius: 6,
    padding: 2,
  },
  qtyBtn: {
    background: '#1f2937',
    color: 'white',
    border: 'none',
    borderRadius: 4,
    width: 22,
    height: 22,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyValue: { minWidth: 22, textAlign: 'center' as const, fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: 12 },
  linePrice: { fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', minWidth: 56, textAlign: 'right' as const },
  removeBtn: {
    background: 'transparent',
    color: '#9ca3af',
    border: '1px solid #374151',
    borderRadius: 4,
    width: 26,
    height: 26,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addFreeform: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: 'transparent',
    color: '#9ca3af',
    border: '1px dashed #374151',
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 12,
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
  divider: { borderTop: '1px solid #1a1d24', margin: '8px 0' },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  miniLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.5,
    opacity: 0.65,
    textTransform: 'uppercase' as const,
    marginBottom: 4,
  },
  input: {
    background: '#0f1115',
    color: '#e6e8ec',
    border: '1px solid #2a2f3d',
    borderRadius: 6,
    padding: '8px 10px',
    fontSize: 13,
    outline: 'none',
    fontFamily: 'inherit',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  typeRow: { display: 'flex', gap: 6 },
  typeBtn: {
    padding: '7px 10px',
    borderRadius: 6,
    border: '1px solid',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    justifyContent: 'center',
  },
  cartFooter: {
    borderTop: '1px solid #1a1d24',
    padding: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    background: '#0b0d12',
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  totalValue: { fontSize: 22, fontWeight: 800, fontVariantNumeric: 'tabular-nums' },
  submit: {
    background: '#f56c12',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    padding: '12px 16px',
    fontSize: 14,
    fontWeight: 600,
  },
  errorText: { color: '#fca5a5', fontSize: 12 },
  successText: { color: '#4ade80', fontSize: 12 },
};
