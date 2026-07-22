'use client';

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import type { MenuCategory, MenuProduct } from '../../../../lib/menu/types';
import { priceToCents } from '../../../../lib/menu/types';
import { formatCents } from '../../../../lib/orders/format';

export function MenuGrid({
  categories,
  loading,
  currency,
  onSelect,
}: {
  categories: MenuCategory[] | null;
  loading: boolean;
  currency: string;
  onSelect: (p: MenuProduct) => void;
}) {
  const { t } = useTranslation();
  const [activeCat, setActiveCat] = useState<number | 'all'>('all');
  const [q, setQ] = useState('');

  const allProducts = useMemo(() => {
    if (!categories) return [];
    return categories.flatMap((c) => c.products);
  }, [categories]);

  const visible = useMemo(() => {
    let src: MenuProduct[] = allProducts;
    if (activeCat !== 'all') {
      src = src.filter((p) => p.category_id === activeCat);
    }
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      src = src.filter((p) => p.name.toLowerCase().includes(needle));
    }
    return src;
  }, [allProducts, activeCat, q]);

  if (loading) {
    return (
      <div style={styles.center}>
        <div style={{ opacity: 0.5, fontSize: 13 }}>{t('common.loading')}</div>
      </div>
    );
  }

  if (!categories || categories.length === 0) {
    return (
      <div style={styles.center}>
        <div style={{ opacity: 0.6, fontSize: 13 }}>{t('menu.empty')}</div>
      </div>
    );
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.searchRow}>
        <div style={styles.searchWrap}>
          <Search size={14} style={{ opacity: 0.5, flexShrink: 0 }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('menu.searchPlaceholder')}
            style={styles.searchInput}
          />
        </div>
      </div>

      <div style={styles.tabs}>
        <CatTab
          label={t('menu.allCategories')}
          active={activeCat === 'all'}
          onClick={() => setActiveCat('all')}
        />
        {categories.map((c) => (
          <CatTab
            key={c.id}
            label={c.name}
            active={activeCat === c.id}
            onClick={() => setActiveCat(c.id)}
          />
        ))}
      </div>

      <div style={styles.grid}>
        {visible.length === 0 ? (
          <div style={{ ...styles.center, gridColumn: '1 / -1' }}>
            <div style={{ opacity: 0.5, fontSize: 13 }}>{t('menu.noProducts')}</div>
          </div>
        ) : (
          visible.map((p) => <ProductTile key={p.id} product={p} currency={currency} onClick={() => onSelect(p)} />)
        )}
      </div>
    </div>
  );
}

function ProductTile({
  product,
  currency,
  onClick,
}: {
  product: MenuProduct;
  currency: string;
  onClick: () => void;
}) {
  const cheapest = [...product.variants]
    .filter((v) => v.is_available)
    .map((v) => priceToCents(v.discount_price ?? v.price))
    .sort((a, b) => a - b)[0];
  const hasVariants = product.variants.length > 1;
  const hasAddons = product.addon_groups.length > 0;

  return (
    <button onClick={onClick} style={styles.tile} title={product.description ?? ''}>
      <div style={styles.tileName}>{product.name}</div>
      <div style={styles.tilePrice}>
        {hasVariants && <span style={styles.fromLabel}>{'~ '}</span>}
        {cheapest != null ? formatCents(cheapest, currency) : '—'}
      </div>
      {(hasVariants || hasAddons) && (
        <div style={styles.tileHint}>
          {hasVariants && <span>{product.variants.length} opts</span>}
          {hasAddons && <span>+ addons</span>}
        </div>
      )}
    </button>
  );
}

function CatTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...styles.catTab,
        background: active ? '#f56c12' : 'transparent',
        borderColor: active ? '#f56c12' : '#2a2f3d',
        color: active ? 'white' : '#e6e8ec',
      }}
    >
      {label}
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 },
  center: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    flex: 1,
  },
  searchRow: { padding: '10px 12px 6px' },
  searchWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: '#0f1115',
    border: '1px solid #2a2f3d',
    borderRadius: 8,
    padding: '8px 10px',
  },
  searchInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    color: '#e6e8ec',
    fontSize: 13,
    outline: 'none',
  },
  tabs: {
    display: 'flex',
    gap: 6,
    padding: '4px 12px 10px',
    overflowX: 'auto',
    flexShrink: 0,
  },
  catTab: {
    padding: '5px 12px',
    borderRadius: 999,
    border: '1px solid',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  grid: {
    padding: '0 12px 12px',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: 8,
    overflowY: 'auto',
    flex: 1,
    alignContent: 'start',
  },
  tile: {
    background: '#151821',
    border: '1px solid #232733',
    borderRadius: 10,
    padding: 12,
    textAlign: 'left',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    color: 'inherit',
    minHeight: 80,
  },
  tileName: { fontSize: 13, fontWeight: 600, lineHeight: 1.25, marginBottom: 'auto' },
  tilePrice: { fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
  tileHint: { fontSize: 10, opacity: 0.55, display: 'flex', gap: 6 },
  fromLabel: { opacity: 0.6, fontWeight: 400 },
};
