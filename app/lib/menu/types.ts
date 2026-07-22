export interface MenuVariant {
  id: number;
  product_id: number;
  name: string;
  price: number | string; // numeric(10,2)
  discount_price?: number | string | null;
  is_available: boolean;
  order: number;
}

export interface MenuAddonOption {
  id: number;
  group_id: number;
  name: string;
  price_delta: number | string; // numeric(10,2)
  is_default: boolean;
  is_available: boolean;
  order: number;
}

export interface MenuAddonGroup {
  id: number;
  product_id: number;
  name: string;
  is_required: boolean;
  min_select: number;
  max_select: number;
  order: number;
  options: MenuAddonOption[];
}

export interface MenuProduct {
  id: number;
  category_id: number;
  business_id: number;
  name: string;
  description?: string | null;
  images?: string[] | null;
  is_active: boolean;
  order: number;
  variants: MenuVariant[];
  addon_groups: MenuAddonGroup[];
}

export interface MenuCategory {
  id: number;
  business_id: number;
  name: string;
  order: number;
  products: MenuProduct[];
}

/**
 * Convert a numeric(10,2) price (e.g. "12.50" or 12.5) into an integer number
 * of cents so it matches the order_items.unit_price_cents column type.
 */
export function priceToCents(price: number | string | null | undefined): number {
  if (price == null) return 0;
  const n = typeof price === 'string' ? parseFloat(price) : price;
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
