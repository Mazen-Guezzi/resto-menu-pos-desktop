'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import type { MenuCategory } from './types';

/**
 * Fetches categories with nested products / variants / addon_groups / options.
 * Filters to active categories and active products only, ordered by their
 * `order` columns. Same query shape as the customer PWA's getCategoriesWithProducts.
 */
export function useMenu(businessId: number | null | undefined): {
  categories: MenuCategory[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const [categories, setCategories] = useState<MenuCategory[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    if (!businessId) {
      setCategories([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('categories')
      .select(
        `id, business_id, name, "order",
         products!inner(
           id, category_id, business_id, name, description, images, is_active, "order",
           variants:product_variants(id, product_id, name, price, discount_price, is_available, "order"),
           addon_groups:product_addon_groups(
             id, product_id, name, is_required, min_select, max_select, "order",
             options:product_addon_options(id, group_id, name, price_delta, is_default, is_available, "order")
           )
         )`,
      )
      .eq('business_id', businessId)
      .eq('is_active', true)
      .eq('products.is_active', true)
      .order('order', { ascending: true });

    if (err) {
      console.error('fetch menu failed', err);
      setError(err.message);
      setCategories([]);
    } else {
      setCategories((data as unknown as MenuCategory[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  return { categories, loading, error, refresh };
}
