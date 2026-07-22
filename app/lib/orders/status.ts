import type { OrderStatus } from './types';

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'New',
  accepted: 'Accepted',
  preparing: 'Preparing',
  ready: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const STATUS_COLOR: Record<OrderStatus, { bg: string; fg: string; border: string }> = {
  pending: { bg: '#3b2a10', fg: '#fbbf24', border: '#78350f' },
  accepted: { bg: '#0f2a3b', fg: '#60a5fa', border: '#1e3a5f' },
  preparing: { bg: '#2a103b', fg: '#c084fc', border: '#4b1e78' },
  ready: { bg: '#0f3b2a', fg: '#4ade80', border: '#14532d' },
  completed: { bg: '#1f2937', fg: '#9ca3af', border: '#374151' },
  cancelled: { bg: '#3b1a1a', fg: '#fca5a5', border: '#7f1d1d' },
};

// Which status a "primary advance" button moves the order to, or null if terminal.
export const NEXT_STATUS: Record<OrderStatus, OrderStatus | null> = {
  pending: 'accepted',
  accepted: 'preparing',
  preparing: 'ready',
  ready: 'completed',
  completed: null,
  cancelled: null,
};

export const NEXT_LABEL: Record<OrderStatus, string | null> = {
  pending: 'Accept',
  accepted: 'Start preparing',
  preparing: 'Mark ready',
  ready: 'Complete',
  completed: null,
  cancelled: null,
};

export function canCancel(status: OrderStatus): boolean {
  return status !== 'completed' && status !== 'cancelled';
}

// Tabs shown in the POS board — grouped rather than one-per-status for
// operator ergonomics.
export type Tab = 'new' | 'in_progress' | 'done' | 'cancelled';

export const TAB_STATUSES: Record<Tab, OrderStatus[]> = {
  new: ['pending'],
  in_progress: ['accepted', 'preparing', 'ready'],
  done: ['completed'],
  cancelled: ['cancelled'],
};

export const TAB_LABEL: Record<Tab, string> = {
  new: 'New',
  in_progress: 'In progress',
  done: 'Done',
  cancelled: 'Cancelled',
};
