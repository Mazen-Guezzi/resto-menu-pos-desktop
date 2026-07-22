export type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'completed'
  | 'cancelled';

export type OrderType = 'dine_in' | 'takeaway' | 'delivery';

export interface OrderItemExtra {
  id: number;
  order_item_id: number;
  extra_id: number | null;
  addon_option_id?: number | null;
  addon_group_id?: number | null;
  group_name?: string | null;
  name: string;
  price_cents: number;
}

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number | null;
  variant_id: number | null;
  combo_id?: string | null;
  combo_items?: string[] | null;
  product_name: string;
  variant_name: string | null;
  unit_price_cents: number;
  quantity: number;
  line_total_cents: number;
  note: string | null;
  extras?: OrderItemExtra[];
}

export interface Order {
  id: number;
  business_id: number;
  short_code: string;
  tracking_token: string;
  status: OrderStatus;
  type: OrderType;
  table_number: string | null;
  notes: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  subtotal_cents: number;
  total_cents: number;
  currency: string;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string | null;
  accepted_at: string | null;
  completed_at: string | null;
  delivery_lat?: number | null;
  delivery_lng?: number | null;
  delivery_address?: string | null;
  delivery_fee_cents?: number | null;
  delivery_distance_km?: number | string | null;
  promo_code_id?: number | null;
  promo_code?: string | null;
  discount_cents?: number | null;
  items?: OrderItem[];
}

export interface Business {
  id: number;
  name: string;
  user_id: string;
  address?: string | null;
  phone_number?: string | null;
}
