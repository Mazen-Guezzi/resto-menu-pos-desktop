'use client';

import { useTranslation } from 'react-i18next';
import type { Tab } from '../../../lib/orders/status';

const TABS: Tab[] = ['new', 'in_progress', 'done', 'cancelled'];
const TAB_KEY: Record<Tab, 'new' | 'inProgress' | 'done' | 'cancelled'> = {
  new: 'new',
  in_progress: 'inProgress',
  done: 'done',
  cancelled: 'cancelled',
};

export function StatusTabs({
  active,
  counts,
  onChange,
}: {
  active: Tab;
  counts: Record<Tab, number>;
  onChange: (t: Tab) => void;
}) {
  const { t: tr } = useTranslation();
  return (
    <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #232733' }}>
      {TABS.map((t) => {
        const isActive = t === active;
        const isNew = t === 'new';
        return (
          <button
            key={t}
            onClick={() => onChange(t)}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: `2px solid ${isActive ? '#f56c12' : 'transparent'}`,
              color: isActive ? '#e6e8ec' : '#9ca3af',
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: isActive ? 600 : 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {tr(`orders.tabs.${TAB_KEY[t]}`)}
            {counts[t] > 0 && (
              <span
                style={{
                  background: isNew ? '#dc2626' : '#374151',
                  color: 'white',
                  padding: '1px 7px',
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 700,
                  minWidth: 18,
                  textAlign: 'center',
                }}
              >
                {counts[t]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
