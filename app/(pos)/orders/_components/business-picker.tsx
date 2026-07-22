'use client';

import type { Business } from '../../../lib/orders/types';

export function BusinessPicker({
  businesses,
  activeId,
  onChange,
}: {
  businesses: Business[];
  activeId: number | null;
  onChange: (id: number) => void;
}) {
  if (businesses.length === 0) return null;
  if (businesses.length === 1) {
    return <span style={{ fontSize: 13, opacity: 0.75 }}>{businesses[0].name}</span>;
  }
  return (
    <select
      value={activeId ?? ''}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{
        background: '#0f1115',
        color: '#e6e8ec',
        border: '1px solid #2a2f3d',
        borderRadius: 6,
        padding: '4px 8px',
        fontSize: 13,
      }}
    >
      {businesses.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  );
}
