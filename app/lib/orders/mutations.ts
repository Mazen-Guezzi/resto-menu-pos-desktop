import { supabase } from '../supabase';
import type { OrderStatus } from './types';

export async function updateOrderStatus(
  orderId: number,
  status: OrderStatus,
  reason?: string | null,
): Promise<{ error: string | null }> {
  const args: Record<string, unknown> = { p_order_id: orderId, p_status: status };
  if (reason !== undefined) args.p_reason = reason;
  const { error } = await supabase.rpc('update_order_status', args);
  return { error: error?.message ?? null };
}
