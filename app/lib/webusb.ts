'use client';

// WebUSB is a Chromium API; it's available in Electron renderer without any
// native module. This module isolates browser-only calls so the rest of the
// app can stay platform-neutral.

export interface WebUsbDeviceInfo {
  vendorId: number;
  productId: number;
  productName?: string | null;
  manufacturerName?: string | null;
  serialNumber?: string | null;
}

function usbApi(): USB | null {
  if (typeof navigator === 'undefined') return null;
  const u = (navigator as unknown as { usb?: USB }).usb;
  return u ?? null;
}

/**
 * Prompts the user to pick a USB printer. Chromium filters by USB printing
 * class (0x07) so we don't list keyboards etc. The returned device is
 * persistently authorized until the user revokes — subsequent calls to
 * `getAuthorizedPrinters()` return it without another prompt.
 */
export async function pickUsbPrinter(): Promise<WebUsbDeviceInfo | null> {
  const usb = usbApi();
  if (!usb) return null;
  try {
    const dev = await usb.requestDevice({ filters: [{ classCode: 0x07 }] });
    return dev
      ? {
          vendorId: dev.vendorId,
          productId: dev.productId,
          productName: dev.productName,
          manufacturerName: dev.manufacturerName,
          serialNumber: dev.serialNumber,
        }
      : null;
  } catch {
    return null; // user cancelled
  }
}

export async function getAuthorizedPrinters(): Promise<WebUsbDeviceInfo[]> {
  const usb = usbApi();
  if (!usb) return [];
  const devs = await usb.getDevices();
  return devs.map((d) => ({
    vendorId: d.vendorId,
    productId: d.productId,
    productName: d.productName,
    manufacturerName: d.manufacturerName,
    serialNumber: d.serialNumber,
  }));
}

/**
 * Sends raw bytes to the printer at vendorId/productId. Assumes the device
 * has already been authorized (via pickUsbPrinter). Finds the interface
 * that exposes the printer class, claims it, writes to the first bulk-out
 * endpoint, then releases + closes.
 */
export async function sendBytesToUsbPrinter(
  vendorId: number,
  productId: number,
  bytes: Uint8Array,
): Promise<{ ok: boolean; error?: string }> {
  const usb = usbApi();
  if (!usb) return { ok: false, error: 'WebUSB not available' };
  const devs = await usb.getDevices();
  const dev = devs.find((d) => d.vendorId === vendorId && d.productId === productId);
  if (!dev) {
    return {
      ok: false,
      error: `USB device ${hex(vendorId)}:${hex(productId)} not authorized — open Settings and pick it again`,
    };
  }
  try {
    if (!dev.opened) await dev.open();
    if (dev.configuration == null) await dev.selectConfiguration(1);

    const iface = dev.configuration?.interfaces.find((i) =>
      i.alternate.interfaceClass === 0x07,
    );
    if (!iface) return { ok: false, error: 'No printer-class interface on this device' };
    await dev.claimInterface(iface.interfaceNumber);

    const endpoint = iface.alternate.endpoints.find((e) => e.direction === 'out');
    if (!endpoint) return { ok: false, error: 'No bulk-out endpoint' };

    await dev.transferOut(endpoint.endpointNumber, new Uint8Array(bytes).buffer);
    await dev.releaseInterface(iface.interfaceNumber).catch(() => {});
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    try {
      await dev.close();
    } catch {
      /* ignore */
    }
  }
}

function hex(n: number): string {
  return '0x' + n.toString(16).padStart(4, '0');
}
