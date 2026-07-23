import Store from 'electron-store';

export type PrinterConfig =
  | { type: 'os'; deviceName?: string | null }
  | { type: 'network'; host: string; port?: number }
  | { type: 'usb'; vendorId: number; productId: number; label?: string };

export interface Prefs {
  windowBounds: { x?: number; y?: number; width: number; height: number };
  preFloatingBounds: { x?: number; y?: number; width: number; height: number } | null;
  floating: boolean;
  soundEnabled: boolean;
  activeBusinessId: string | null;
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
  printerKitchen: null,
  printerCustomer: null,
  autoPrintOnAccept: true,
  hideDockOnTray: false,
  lang: 'fr',
};

export const FLOATING_SIZE = { width: 380, height: 640 } as const;

export const prefs = new Store<Prefs>({
  name: 'swiftqr-pos-prefs',
  defaults,
});
