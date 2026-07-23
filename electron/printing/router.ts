import { sendToNetworkPrinter } from './network';
import { buildCustomerReceipt, buildKitchenTicket, type EscposOrder } from './receipt-escpos';

export type PrinterMode = 'kitchen' | 'customer';

export type PrinterConfig =
  | { type: 'os'; deviceName?: string | null }
  | { type: 'network'; host: string; port?: number }
  | { type: 'usb'; vendorId: number; productId: number; label?: string };

export interface Printer {
  id: string;
  name: string;
  role: PrinterMode;
  config: PrinterConfig;
  categoryIds?: number[];
}

export interface PrintOrderArgs {
  order: EscposOrder;
  mode: PrinterMode | 'both';
  printers: Printer[];
  /** productId → categoryId lookup for category filtering. */
  productCategoryIds?: Record<string, number>;
  /** Pre-rendered HTML doc for OS-transport prints. */
  html?: { kitchen?: string; customer?: string };
}

export interface PrintResult {
  ok: boolean;
  errors: string[];
  /** Count of printers this fan-out actually dispatched to. */
  dispatched: number;
  /** USB targets returned to the renderer for WebUSB dispatch. */
  usbDelegated: Array<{
    printer: { id: string; name: string; role: PrinterMode };
    vendorId: number;
    productId: number;
    bytes: number[];
  }>;
}

function itemMatchesPrinter(
  productId: number | null | undefined,
  categoryIds: number[] | undefined,
  productCategoryMap: Record<string, number> | undefined,
): boolean {
  // No filter → include everything.
  if (!categoryIds || categoryIds.length === 0) return true;
  if (productId == null) return false; // freeform items have no product_id — can't route
  const cat = productCategoryMap?.[String(productId)];
  return cat != null && categoryIds.includes(cat);
}

export async function printOrderToConfigured(
  args: PrintOrderArgs,
  runOsPrint: (html: string, deviceName?: string | null) => Promise<{ ok: boolean; error?: string }>,
): Promise<PrintResult> {
  const wantKitchen = args.mode === 'kitchen' || args.mode === 'both';
  const wantCustomer = args.mode === 'customer' || args.mode === 'both';

  const targets = args.printers.filter(
    (p) => (p.role === 'kitchen' && wantKitchen) || (p.role === 'customer' && wantCustomer),
  );

  if (targets.length === 0) {
    return { ok: true, errors: [], dispatched: 0, usbDelegated: [] };
  }

  const errors: string[] = [];
  let dispatched = 0;
  const usbDelegated: PrintResult['usbDelegated'] = [];

  for (const printer of targets) {
    // Customer receipt is always the full order — no filter for that role.
    let scopedOrder: EscposOrder = args.order;
    if (printer.role === 'kitchen' && printer.categoryIds && printer.categoryIds.length > 0) {
      const filteredItems = args.order.items.filter((it) =>
        itemMatchesPrinter(it.product_id, printer.categoryIds, args.productCategoryIds),
      );
      if (filteredItems.length === 0) continue; // nothing for this station — skip silently
      scopedOrder = { ...args.order, items: filteredItems };
    }

    const bytes =
      printer.role === 'kitchen'
        ? buildKitchenTicket(scopedOrder, printer.name)
        : buildCustomerReceipt(scopedOrder);

    if (printer.config.type === 'usb') {
      // Renderer handles USB via WebUSB — main just hands over the bytes.
      usbDelegated.push({
        printer: { id: printer.id, name: printer.name, role: printer.role },
        vendorId: printer.config.vendorId,
        productId: printer.config.productId,
        bytes: Array.from(bytes),
      });
      continue;
    }

    let res: { ok: boolean; error?: string };
    if (printer.config.type === 'network') {
      res = await sendToNetworkPrinter(bytes, {
        host: printer.config.host,
        port: printer.config.port,
      });
    } else {
      const html = printer.role === 'kitchen' ? args.html?.kitchen : args.html?.customer;
      if (!html) {
        errors.push(`${printer.name}: OS printer selected but no HTML provided`);
        continue;
      }
      res = await runOsPrint(html, printer.config.deviceName);
    }

    dispatched++;
    if (!res.ok) errors.push(`${printer.name}: ${res.error ?? 'unknown error'}`);
  }

  return { ok: errors.length === 0, errors, dispatched, usbDelegated };
}
