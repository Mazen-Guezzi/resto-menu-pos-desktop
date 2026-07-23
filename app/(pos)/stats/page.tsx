'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingUp, ShoppingCart, Wallet, XCircle } from 'lucide-react';
import { useBusinesses } from '../../lib/orders/hooks';
import { useStats, type RangeKey } from '../../lib/orders/stats';
import { formatCents } from '../../lib/orders/format';
import type { OrderStatus, OrderType } from '../../lib/orders/types';

const RANGE_KEYS: RangeKey[] = ['today', 'yesterday', 'last7', 'last30'];

const STATUSES: OrderStatus[] = ['pending', 'accepted', 'preparing', 'ready', 'completed', 'cancelled'];
const TYPES: OrderType[] = ['dine_in', 'takeaway', 'delivery'];
const TYPE_KEY = { dine_in: 'dineIn', takeaway: 'takeaway', delivery: 'delivery' } as const;

export default function StatsPage() {
  const { t } = useTranslation();
  const { active } = useBusinesses();
  const [range, setRange] = useState<RangeKey>('today');
  const { stats, loading } = useStats(active?.id ?? null, range);

  const cancelledPct = Math.round(stats.cancellationRate * 100);

  return (
    <div style={styles.page}>
      {/* --- Header + range picker ------------------------------------ */}
      <header style={styles.header}>
        <div>
          <div style={styles.title}>{t('stats.title')}</div>
          <div style={styles.subtitle}>{active?.name ?? '—'}</div>
        </div>
        <div style={styles.rangeRow}>
          {RANGE_KEYS.map((k) => (
            <button
              key={k}
              onClick={() => setRange(k)}
              style={{
                ...styles.rangeBtn,
                background: range === k ? '#f56c12' : 'transparent',
                borderColor: range === k ? '#f56c12' : '#2a2f3d',
                color: range === k ? 'white' : '#e6e8ec',
              }}
            >
              {t(`stats.range.${k}`)}
            </button>
          ))}
        </div>
      </header>

      {loading && (
        <div style={{ padding: 24, opacity: 0.5, fontSize: 13 }}>{t('common.loading')}</div>
      )}

      {!loading && (
        <>
          {/* --- KPI row ------------------------------------------- */}
          <section style={styles.kpiRow}>
            <KpiCard
              icon={<Wallet size={18} />}
              label={t('stats.kpi.revenue')}
              value={formatCents(stats.revenueCents, stats.currency)}
              tone="orange"
            />
            <KpiCard
              icon={<ShoppingCart size={18} />}
              label={t('stats.kpi.orders')}
              value={String(stats.totalOrders)}
              hint={t('stats.kpi.completed', { count: stats.completedOrders })}
              tone="blue"
            />
            <KpiCard
              icon={<TrendingUp size={18} />}
              label={t('stats.kpi.avgOrder')}
              value={formatCents(stats.avgOrderCents, stats.currency)}
              tone="green"
            />
            <KpiCard
              icon={<XCircle size={18} />}
              label={t('stats.kpi.cancelled')}
              value={`${cancelledPct}%`}
              hint={t('stats.kpi.cancelledCount', { count: stats.cancelledOrders })}
              tone="red"
            />
          </section>

          {/* --- Order type + status breakdowns ------------------- */}
          <section style={styles.chartsRow}>
            <ChartCard title={t('stats.byType')}>
              <BarList
                rows={TYPES.map((tp) => ({
                  label: t(`orders.type.${TYPE_KEY[tp]}`),
                  value: stats.byType[tp],
                }))}
                total={stats.totalOrders}
              />
            </ChartCard>
            <ChartCard title={t('stats.byStatus')}>
              <BarList
                rows={STATUSES.map((s) => ({
                  label: t(`orders.status.${s}`),
                  value: stats.byStatus[s],
                }))}
                total={stats.totalOrders}
              />
            </ChartCard>
          </section>

          {/* --- Hourly load -------------------------------------- */}
          <section>
            <ChartCard title={t('stats.hourly')}>
              <HourlyChart hourly={stats.hourly} />
            </ChartCard>
          </section>

          {/* --- Top products ------------------------------------- */}
          <section>
            <ChartCard title={t('stats.topProducts')}>
              {stats.topProducts.length === 0 ? (
                <div style={styles.empty}>{t('stats.empty')}</div>
              ) : (
                <ol style={styles.productList}>
                  {stats.topProducts.map((p, i) => (
                    <li key={p.name + i} style={styles.productRow}>
                      <span style={styles.rank}>{i + 1}</span>
                      <span style={styles.productName}>{p.name}</span>
                      <span style={styles.productQty}>{t('stats.qty', { count: p.qty })}</span>
                      <span style={styles.productRevenue}>
                        {formatCents(p.revenueCents, stats.currency)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </ChartCard>
          </section>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small cards + chart primitives
// ---------------------------------------------------------------------------
function KpiCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone: 'orange' | 'blue' | 'green' | 'red';
}) {
  const toneColor = {
    orange: '#f56c12',
    blue: '#60a5fa',
    green: '#4ade80',
    red: '#fca5a5',
  }[tone];
  return (
    <div style={styles.kpiCard}>
      <div style={{ ...styles.kpiIcon, color: toneColor, borderColor: `${toneColor}33` }}>{icon}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={styles.kpiLabel}>{label}</div>
        <div style={styles.kpiValue}>{value}</div>
        {hint && <div style={styles.kpiHint}>{hint}</div>}
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={styles.chartCard}>
      <div style={styles.chartTitle}>{title}</div>
      {children}
    </div>
  );
}

function BarList({ rows, total }: { rows: Array<{ label: string; value: number }>; total: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((r) => {
        const pct = total === 0 ? 0 : Math.round((r.value / total) * 100);
        return (
          <div key={r.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
              <span>{r.label}</span>
              <span style={{ opacity: 0.7 }}>
                {r.value} <span style={{ opacity: 0.5 }}>({pct}%)</span>
              </span>
            </div>
            <div style={styles.barTrack}>
              <div style={{ ...styles.barFill, width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HourlyChart({ hourly }: { hourly: number[] }) {
  const max = Math.max(1, ...hourly);
  const width = 42 * hourly.length;
  const barW = 32;
  const gap = 10;
  const height = 140;
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={width} height={height + 30} style={{ display: 'block' }}>
        {hourly.map((n, i) => {
          const h = Math.round((n / max) * height);
          const x = i * (barW + gap) + 4;
          const y = height - h;
          const label = String(i).padStart(2, '0');
          return (
            <g key={i}>
              {n > 0 && (
                <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize="10" fill="#e6e8ec">
                  {n}
                </text>
              )}
              <rect x={x} y={y} width={barW} height={h} rx="3" fill="#f56c12" opacity={n > 0 ? 0.85 : 0.15} />
              <text
                x={x + barW / 2}
                y={height + 15}
                textAnchor="middle"
                fontSize="10"
                fill="#9ca3af"
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    maxWidth: 1200,
    margin: '0 auto',
    width: '100%',
    height: '100%',
    overflowY: 'auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 16,
    flexWrap: 'wrap',
  },
  title: { fontSize: 22, fontWeight: 700 },
  subtitle: { fontSize: 12, opacity: 0.55, marginTop: 4 },
  rangeRow: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  rangeBtn: {
    padding: '6px 12px',
    borderRadius: 999,
    border: '1px solid',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
  },

  kpiRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
    gap: 12,
  },
  kpiCard: {
    display: 'flex',
    gap: 12,
    padding: 16,
    background: '#151821',
    border: '1px solid #232733',
    borderRadius: 12,
    alignItems: 'center',
  },
  kpiIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    background: '#0a0c11',
    border: '1px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    opacity: 0.6,
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
    marginTop: 2,
  },
  kpiHint: { fontSize: 11, opacity: 0.55, marginTop: 3 },

  chartsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 12,
  },
  chartCard: {
    padding: 16,
    background: '#151821',
    border: '1px solid #232733',
    borderRadius: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  chartTitle: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.5,
    opacity: 0.7,
    textTransform: 'uppercase' as const,
  },
  barTrack: { height: 6, background: '#0f1115', borderRadius: 999, overflow: 'hidden' },
  barFill: { height: '100%', background: '#f56c12', borderRadius: 999, transition: 'width 0.2s' },

  productList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 },
  productRow: {
    display: 'grid',
    gridTemplateColumns: '28px 1fr auto auto',
    gap: 12,
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid #1a1d24',
    fontSize: 13,
  },
  rank: {
    width: 26,
    height: 26,
    borderRadius: 6,
    background: '#0a0c11',
    border: '1px solid #232733',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 700,
    opacity: 0.75,
  },
  productName: { fontWeight: 500, minWidth: 0, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' as const },
  productQty: { fontSize: 12, opacity: 0.7, fontVariantNumeric: 'tabular-nums' },
  productRevenue: { fontWeight: 700, fontVariantNumeric: 'tabular-nums' },

  empty: { padding: 20, textAlign: 'center' as const, opacity: 0.55, fontSize: 13 },
};
