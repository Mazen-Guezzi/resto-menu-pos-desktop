'use client';

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import type { MenuAddonGroup, MenuProduct, MenuVariant } from '../../../../lib/menu/types';
import { priceToCents } from '../../../../lib/menu/types';
import { formatCents } from '../../../../lib/orders/format';

export interface PickerConfirm {
  variant: MenuVariant;
  addons: {
    group: MenuAddonGroup;
    optionIds: number[];
  }[];
  quantity: number;
  note: string;
}

export function ProductPicker({
  product,
  currency,
  onClose,
  onConfirm,
}: {
  product: MenuProduct;
  currency: string;
  onClose: () => void;
  onConfirm: (r: PickerConfirm) => void;
}) {
  const { t } = useTranslation();
  const availableVariants = product.variants.filter((v) => v.is_available);
  const [variantId, setVariantId] = useState<number>(availableVariants[0]?.id ?? 0);
  const [addonSel, setAddonSel] = useState<Record<number, number[]>>(() => {
    // Preselect defaults so required groups don't fail validation before the user touches them.
    const init: Record<number, number[]> = {};
    for (const g of product.addon_groups) {
      const defaults = g.options.filter((o) => o.is_default && o.is_available).map((o) => o.id);
      init[g.id] = defaults.slice(0, Math.max(1, g.max_select));
    }
    return init;
  });
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');

  const variant = availableVariants.find((v) => v.id === variantId) ?? availableVariants[0];
  const variantPriceCents = variant ? priceToCents(variant.discount_price ?? variant.price) : 0;

  const addonSumCents = useMemo(() => {
    let s = 0;
    for (const g of product.addon_groups) {
      const selected = addonSel[g.id] ?? [];
      for (const optId of selected) {
        const opt = g.options.find((o) => o.id === optId);
        if (opt) s += priceToCents(opt.price_delta);
      }
    }
    return s;
  }, [addonSel, product.addon_groups]);

  const lineTotal = (variantPriceCents + addonSumCents) * qty;

  const validation = useMemo(() => {
    for (const g of product.addon_groups) {
      const n = (addonSel[g.id] ?? []).length;
      if (g.is_required && n < g.min_select) {
        return t('menu.picker.needsMin', { group: g.name, min: g.min_select });
      }
      if (n > g.max_select) {
        return t('menu.picker.overMax', { group: g.name, max: g.max_select });
      }
    }
    if (!variant) return t('menu.picker.needsVariant');
    return null;
  }, [addonSel, product.addon_groups, variant, t]);

  const toggleAddon = (group: MenuAddonGroup, optionId: number) => {
    setAddonSel((prev) => {
      const current = prev[group.id] ?? [];
      const isSelected = current.includes(optionId);
      let next: number[];
      if (isSelected) {
        next = current.filter((id) => id !== optionId);
      } else if (group.max_select === 1) {
        // Radio behavior — single-select group.
        next = [optionId];
      } else {
        if (current.length >= group.max_select) return prev; // ignore if at max
        next = [...current, optionId];
      }
      return { ...prev, [group.id]: next };
    });
  };

  const confirm = () => {
    if (!variant || validation) return;
    onConfirm({
      variant,
      addons: product.addon_groups.map((g) => ({ group: g, optionIds: addonSel[g.id] ?? [] })),
      quantity: qty,
      note: note.trim(),
    });
  };

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <header style={styles.header}>
          <div>
            <div style={styles.title}>{product.name}</div>
            {product.description && <div style={styles.desc}>{product.description}</div>}
          </div>
          <button onClick={onClose} style={styles.closeBtn} aria-label={t('common.cancel')}>
            <X size={16} />
          </button>
        </header>

        <div style={styles.body}>
          {availableVariants.length > 1 && (
            <section style={styles.section}>
              <div style={styles.sectionTitle}>{t('menu.picker.variant')}</div>
              <div style={styles.chipGroup}>
                {availableVariants.map((v) => {
                  const cents = priceToCents(v.discount_price ?? v.price);
                  const active = variantId === v.id;
                  return (
                    <button
                      key={v.id}
                      onClick={() => setVariantId(v.id)}
                      style={{
                        ...styles.chip,
                        background: active ? '#f56c12' : 'transparent',
                        borderColor: active ? '#f56c12' : '#2a2f3d',
                        color: active ? 'white' : '#e6e8ec',
                      }}
                    >
                      <span>{v.name}</span>
                      <span style={{ opacity: 0.85, fontWeight: 600 }}>{formatCents(cents, currency)}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {product.addon_groups.map((g) => {
            const selected = addonSel[g.id] ?? [];
            return (
              <section key={g.id} style={styles.section}>
                <div style={styles.sectionRow}>
                  <div style={styles.sectionTitle}>
                    {g.name}
                    {g.is_required && <span style={styles.required}>{' *'}</span>}
                  </div>
                  <div style={styles.sectionMeta}>
                    {g.min_select === g.max_select
                      ? t('menu.picker.pickExact', { n: g.max_select })
                      : t('menu.picker.pickRange', { min: g.min_select, max: g.max_select })}
                  </div>
                </div>
                <div style={styles.chipGroup}>
                  {g.options
                    .filter((o) => o.is_available)
                    .map((o) => {
                      const active = selected.includes(o.id);
                      const delta = priceToCents(o.price_delta);
                      return (
                        <button
                          key={o.id}
                          onClick={() => toggleAddon(g, o.id)}
                          style={{
                            ...styles.chip,
                            background: active ? '#f56c12' : 'transparent',
                            borderColor: active ? '#f56c12' : '#2a2f3d',
                            color: active ? 'white' : '#e6e8ec',
                          }}
                        >
                          <span>{o.name}</span>
                          {delta > 0 && (
                            <span style={{ opacity: 0.85, fontWeight: 600 }}>
                              +{formatCents(delta, currency)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                </div>
              </section>
            );
          })}

          <section style={styles.section}>
            <div style={styles.sectionTitle}>{t('newOrder.notes')}</div>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('menu.picker.notePlaceholder')}
              style={styles.noteInput}
            />
          </section>
        </div>

        <footer style={styles.footer}>
          <div style={styles.qtyGroup}>
            <button onClick={() => setQty(Math.max(1, qty - 1))} style={styles.qtyBtn}>
              −
            </button>
            <div style={styles.qtyValue}>{qty}</div>
            <button onClick={() => setQty(qty + 1)} style={styles.qtyBtn}>
              +
            </button>
          </div>
          <div style={{ flex: 1 }}>
            {validation ? (
              <div style={styles.warn}>{validation}</div>
            ) : (
              <div style={styles.total}>
                <span style={{ opacity: 0.7 }}>{t('orders.total')}</span>
                <span style={styles.totalVal}>{formatCents(lineTotal, currency)}</span>
              </div>
            )}
          </div>
          <button
            onClick={confirm}
            disabled={!!validation}
            style={{ ...styles.confirmBtn, opacity: validation ? 0.5 : 1, cursor: validation ? 'not-allowed' : 'pointer' }}
          >
            {t('menu.picker.addToCart')}
          </button>
        </footer>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: 20,
  },
  modal: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '90vh',
    background: '#12151d',
    border: '1px solid #232733',
    borderRadius: 12,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '16px 18px',
    borderBottom: '1px solid #232733',
    gap: 12,
  },
  title: { fontSize: 18, fontWeight: 700 },
  desc: { fontSize: 12, opacity: 0.6, marginTop: 4 },
  closeBtn: {
    background: 'transparent',
    color: '#9ca3af',
    border: '1px solid #374151',
    borderRadius: 6,
    width: 30,
    height: 30,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { padding: '10px 18px', overflowY: 'auto', flex: 1, minHeight: 0 },
  section: { padding: '10px 0' },
  sectionRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.5,
    opacity: 0.75,
    textTransform: 'uppercase',
  },
  sectionMeta: { fontSize: 11, opacity: 0.5 },
  required: { color: '#f56c12', marginLeft: 2 },
  chipGroup: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 12px',
    borderRadius: 8,
    border: '1px solid',
    fontSize: 13,
    cursor: 'pointer',
  },
  noteInput: {
    width: '100%',
    background: '#0f1115',
    color: '#e6e8ec',
    border: '1px solid #2a2f3d',
    borderRadius: 6,
    padding: '8px 10px',
    fontSize: 13,
    outline: 'none',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderTop: '1px solid #232733',
  },
  qtyGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    border: '1px solid #2a2f3d',
    borderRadius: 6,
    padding: 3,
  },
  qtyBtn: {
    background: '#1f2937',
    color: 'white',
    border: 'none',
    borderRadius: 4,
    width: 28,
    height: 28,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
  },
  qtyValue: { minWidth: 28, textAlign: 'center', fontVariantNumeric: 'tabular-nums', fontWeight: 600 },
  total: { display: 'flex', flexDirection: 'column', gap: 2 },
  totalVal: { fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums' },
  warn: { color: '#fbbf24', fontSize: 12 },
  confirmBtn: {
    background: '#f56c12',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    padding: '10px 18px',
    fontSize: 14,
    fontWeight: 600,
  },
};
