import Store from 'electron-store';

export type PrinterConfig =
  | { type: 'os'; deviceName?: string | null }
  | { type: 'network'; host: string; port?: number }
  | { type: 'usb'; vendorId: number; productId: number; label?: string };

export type PrinterRole = 'kitchen' | 'customer';

export interface Printer {
  id: string;
  name: string;
  role: PrinterRole;
  config: PrinterConfig;
  // Only meaningful for kitchen printers. If undefined/empty the printer
  // sees every item on the order. If populated, only items whose product's
  // category is in the list get printed here — that's how "Dessert" and
  // "Bar" stations end up with only their own tickets.
  categoryIds?: number[];
}

export interface Prefs {
  windowBounds: { x?: number; y?: number; width: number; height: number };
  preFloatingBounds: { x?: number; y?: number; width: number; height: number } | null;
  floating: boolean;
  soundEnabled: boolean;
  activeBusinessId: string | null;
  printers: Printer[];
  // Legacy single-printer prefs. Kept for the one-time migration read in
  // ipc.ts; never written again. Remove in a later cleanup.
  printerKitchen: PrinterConfig | null;
  printerCustomer: PrinterConfig | null;
  autoPrintOnAccept: boolean;
  hideDockOnTray: boolean;
  lang: 'en' | 'fr' | 'ar';
}

const defaults: Prefs = {
  windowBounds: { width: 1280, height: 800 },
  preFloatingBounds: null,
  floating: false,
  soundEnabled: true,
  activeBusinessId: null,
  printers: [],
  printerKitchen: null,
  printerCustomer: null,
  autoPrintOnAccept: true,
  hideDockOnTray: false,
  lang: 'fr',
};

/**
 * Migrate any legacy `printerKitchen` / `printerCustomer` singletons into the
 * new `printers` array. Runs once per install — after migration, both legacy
 * fields are cleared and the new array is authoritative.
 */
export function migrateLegacyPrinters(): Printer[] {
  const existing = prefs.get('printers') as Printer[] | undefined;
  if (existing && existing.length > 0) return existing;

  const migrated: Printer[] = [];
  const rawKitchen = prefs.get('printerKitchen') as PrinterConfig | string | null;
  const rawCustomer = prefs.get('printerCustomer') as PrinterConfig | string | null;

  const wrap = (raw: PrinterConfig | string | null): PrinterConfig | null => {
    if (!raw) return null;
    if (typeof raw === 'string') return { type: 'os', deviceName: raw };
    return raw;
  };

  const kConfig = wrap(rawKitchen);
  const cConfig = wrap(rawCustomer);
  if (kConfig) migrated.push({ id: 'legacy-kitchen', name: 'Kitchen', role: 'kitchen', config: kConfig });
  if (cConfig) migrated.push({ id: 'legacy-customer', name: 'Customer', role: 'customer', config: cConfig });

  if (migrated.length > 0) {
    prefs.set('printers', migrated);
    prefs.set('printerKitchen', null);
    prefs.set('printerCustomer', null);
  }
  return migrated;
}

export const FLOATING_SIZE = { width: 380, height: 640 } as const;

export const prefs = new Store<Prefs>({
  name: 'swiftqr-pos-prefs',
  defaults,
});
