'use client';

import { useTranslation } from 'react-i18next';
import { STATUS_COLOR } from '../../../lib/orders/status';
import type { OrderStatus } from '../../../lib/orders/types';

export function StatusPill({ status }: { status: OrderStatus }) {
  const { t } = useTranslation();
  const c = STATUS_COLOR[status];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.3,
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.border}`,
      }}
    >
      {t(`orders.status.${status}`).toUpperCase()}
    </span>
  );
}
