/*
 * Raw USB ESC/POS transport.
 *
 * The `usb` npm package is a thin libusb wrapper. It's a native module and
 * needs to be rebuilt for Electron — handled by electron-builder's
 * @electron/rebuild step at build time and by scripts/postinstall for local
 * dev. If the module fails to load (e.g. libusb missing on the host), we
 * degrade gracefully so the app still starts.
 */

let usbModule: typeof import('usb') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  usbModule = require('usb');
} catch (err) {
  console.warn('[usb] native module unavailable — raw USB printing disabled', err);
}

export interface UsbDeviceInfo {
  vendorId: number;
  productId: number;
  manufacturer?: string;
  product?: string;
  serial?: string;
}

// USB Printing Class (base class 0x07). Standard thermal printers advertise
// this — filtering by it means we don't list a user's keyboard/mouse.
const USB_PRINTER_CLASS = 0x07;

export async function listUsbPrinters(): Promise<UsbDeviceInfo[]> {
  if (!usbModule) return [];
  const out: UsbDeviceInfo[] = [];
  const devices = usbModule.getDeviceList();
  for (const dev of devices) {
    const desc = dev.deviceDescriptor;
    // Some printers expose the printer class only on their interface, not on
    // the device descriptor — so also probe interfaces.
    let isPrinter = desc.bDeviceClass === USB_PRINTER_CLASS;
    if (!isPrinter) {
      // Interface classes require opening the device briefly to enumerate.
      try {
        dev.open();
        const cfg = dev.configDescriptor;
        for (const iface of cfg?.interfaces ?? []) {
          for (const alt of iface) {
            if (alt.bInterfaceClass === USB_PRINTER_CLASS) {
              isPrinter = true;
              break;
            }
          }
          if (isPrinter) break;
        }
      } catch {
        /* device may not be openable without permissions */
      } finally {
        try {
          dev.close();
        } catch {
          /* ignore */
        }
      }
    }
    if (!isPrinter) continue;

    let manufacturer: string | undefined;
    let product: string | undefined;
    let serial: string | undefined;
    try {
      dev.open();
      const getStr = (idx: number) =>
        new Promise<string | undefined>((resolve) => {
          if (!idx) return resolve(undefined);
          dev.getStringDescriptor(idx, (err, s) => resolve(err ? undefined : s));
        });
      manufacturer = await getStr(desc.iManufacturer);
      product = await getStr(desc.iProduct);
      serial = await getStr(desc.iSerialNumber);
    } catch {
      /* ignore */
    } finally {
      try {
        dev.close();
      } catch {
        /* ignore */
      }
    }

    out.push({
      vendorId: desc.idVendor,
      productId: desc.idProduct,
      manufacturer,
      product,
      serial,
    });
  }
  return out;
}

export interface UsbPrintOptions {
  vendorId: number;
  productId: number;
  timeoutMs?: number;
}

export async function sendToUsbPrinter(
  data: Buffer,
  { vendorId, productId, timeoutMs = 6000 }: UsbPrintOptions,
): Promise<{ ok: boolean; error?: string }> {
  if (!usbModule) return { ok: false, error: 'USB module not loaded' };
  const dev = usbModule.findByIds(vendorId, productId);
  if (!dev) return { ok: false, error: `USB printer ${hex(vendorId)}:${hex(productId)} not found` };

  try {
    dev.open();
    // Detach kernel driver on Linux so we can grab the interface.
    // On macOS/Windows this call is a no-op or throws — swallow it.
    const iface = dev.interfaces?.[0];
    if (!iface) return { ok: false, error: 'No USB interface exposed by printer' };
    try {
      if (iface.isKernelDriverActive()) iface.detachKernelDriver();
    } catch {
      /* not applicable on this OS */
    }
    iface.claim();

    // Find the bulk OUT endpoint — where the printer accepts data.
    const outEndpoint = iface.endpoints.find((e) => e.direction === 'out');
    if (!outEndpoint) {
      try { iface.release(true, () => {}); } catch { /* ignore */ }
      return { ok: false, error: 'No bulk-out endpoint' };
    }

    outEndpoint.timeout = timeoutMs;
    await new Promise<void>((resolve, reject) => {
      (outEndpoint as unknown as { transfer: (b: Buffer, cb: (err?: Error) => void) => void })
        .transfer(data, (err) => (err ? reject(err) : resolve()));
    });

    await new Promise<void>((resolve) => iface.release(true, () => resolve()));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    try {
      dev.close();
    } catch {
      /* ignore */
    }
  }
}

function hex(n: number): string {
  return '0x' + n.toString(16).padStart(4, '0');
}
