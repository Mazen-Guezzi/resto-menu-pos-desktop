/*
 * USB ESC/POS printing is handled by the RENDERER via WebUSB (Chromium's
 * bundled libusb), not by main-process libusb. This avoids the toolchain
 * pain of building native modules across macOS / Windows / Linux CI.
 *
 * The router below returns a "delegate" result for USB targets so the
 * renderer-side print helper picks them up and dispatches via
 * navigator.usb.transferOut.
 */

export interface UsbDeviceInfo {
  vendorId: number;
  productId: number;
  manufacturer?: string;
  product?: string;
  serial?: string;
}

// listUsbPrinters returns [] from main; the renderer enumerates via
// navigator.usb.getDevices() instead.
export async function listUsbPrinters(): Promise<UsbDeviceInfo[]> {
  return [];
}

// sendToUsbPrinter is unreachable from main — the router filters USB targets
// out before it ever calls a transport function. Kept as a no-op stub so
// existing imports don't break.
export async function sendToUsbPrinter(): Promise<{ ok: boolean; error?: string }> {
  return { ok: false, error: 'USB print delegated to renderer (WebUSB)' };
}
