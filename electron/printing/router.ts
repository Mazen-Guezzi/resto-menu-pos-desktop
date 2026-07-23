import { sendToNetworkPrinter } from './network';
import { sendToUsbPrinter } from './usb';
import { buildCustomerReceipt, buildKitchenTicket, type EscposOrder } from './receipt-escpos';

export type PrinterMode = 'kitchen' | 'customer';

export type PrinterConfig =
  | { type: 'os'; deviceName?: string | null }
  | { type: 'network'; host: string; port?: number }
  | { type: 'usb'; vendorId: number; productId: number };

export interface PrintOrderArgs {
  order: EscposOrder;
  mode: PrinterMode | 'both';
  config: {
    kitchen: PrinterConfig | null;
    customer: PrinterConfig | null;
  };
  // For OS-mode fallback — the pre-built HTML doc.
  html?: { kitchen?: string; customer?: string };
}

export interface PrintResult {
  ok: boolean;
  errors: string[];
}

export async function printOrderToConfigured(
  args: PrintOrderArgs,
  runOsPrint: (html: string, deviceName?: string | null) => Promise<{ ok: boolean; error?: string }>,
): Promise<PrintResult> {
  const targets: Array<{ mode: PrinterMode; config: PrinterConfig | null }> = [];
  if (args.mode === 'kitchen' || args.mode === 'both') {
    targets.push({ mode: 'kitchen', config: args.config.kitchen });
  }
  if (args.mode === 'customer' || args.mode === 'both') {
    targets.push({ mode: 'customer', config: args.config.customer });
  }

  const errors: string[] = [];
  for (const t of targets) {
    if (!t.config) {
      errors.push(`${t.mode}: no printer configured`);
      continue;
    }
    const bytes =
      t.mode === 'kitchen' ? buildKitchenTicket(args.order) : buildCustomerReceipt(args.order);

    let res: { ok: boolean; error?: string };
    if (t.config.type === 'network') {
      res = await sendToNetworkPrinter(bytes, { host: t.config.host, port: t.config.port });
    } else if (t.config.type === 'usb') {
      res = await sendToUsbPrinter(bytes, {
        vendorId: t.config.vendorId,
        productId: t.config.productId,
      });
    } else {
      // OS path — needs pre-rendered HTML.
      const html = t.mode === 'kitchen' ? args.html?.kitchen : args.html?.customer;
      if (!html) {
        errors.push(`${t.mode}: OS printer selected but no HTML provided`);
        continue;
      }
      res = await runOsPrint(html, t.config.deviceName);
    }

    if (!res.ok) errors.push(`${t.mode}: ${res.error ?? 'unknown error'}`);
  }

  return { ok: errors.length === 0, errors };
}
