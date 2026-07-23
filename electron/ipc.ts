import { app, ipcMain, BrowserWindow, screen } from 'electron';
import { prefs, migrateLegacyPrinters, type Prefs, FLOATING_SIZE } from './prefs';
import { saveSession, loadSession, clearSession } from './auth-store';
import { storageGet, storageSet, storageRemove } from './storage';
import { showOrderNotification, updateBadge, type NewOrderNotifPayload } from './notifications';
import { printTicket, listPrinters, type PrintTicketArgs } from './printing/os';
import { listUsbPrinters } from './printing/usb';
import { sendToNetworkPrinter } from './printing/network';
import {
  buildCustomerReceipt,
  buildKitchenTicket,
  type EscposOrder,
} from './printing/receipt-escpos';
import { printOrderToConfigured, type PrinterConfig, type Printer as RouterPrinter } from './printing/router';
import {
  enqueue as outboxEnqueue,
  listOutbox,
  updateEntry as outboxUpdate,
  deleteEntry as outboxDelete,
  currentSummary,
  subscribeSummary,
  type OutboxEntry,
} from './outbox-store';
import { CH, type StoredSession } from './channels';

export { CH } from './channels';

export function registerIpc(getWindow: () => BrowserWindow | null) {
  ipcMain.handle(CH.version, () => ({
    app: app.getVersion(),
    electron: process.versions.electron,
    os: `${process.platform} ${process.arch}`,
  }));

  ipcMain.handle(CH.prefsGet, (_e, key: keyof Prefs) => prefs.get(key));

  ipcMain.handle(CH.prefsSet, (_e, key: keyof Prefs, value: Prefs[keyof Prefs]) => {
    prefs.set(key, value);
    return true;
  });

  ipcMain.handle(CH.windowShow, () => {
    const w = getWindow();
    if (!w) return;
    if (w.isMinimized()) w.restore();
    w.show();
    w.focus();
  });

  ipcMain.handle(CH.windowMinimizeToTray, () => {
    getWindow()?.hide();
  });

  ipcMain.handle(CH.windowSetFloating, (_e, on: boolean) => {
    const w = getWindow();
    if (!w) return;
    const wasFloating = prefs.get('floating');
    prefs.set('floating', on);
    w.setAlwaysOnTop(on, 'floating');
    if (process.platform !== 'win32') {
      w.setVisibleOnAllWorkspaces(on, { visibleOnFullScreen: true });
    }
    // Resize between compact and normal layouts. Remember the pre-floating
    // bounds so we can snap back to whatever the user had.
    if (on && !wasFloating) {
      const current = w.getBounds();
      prefs.set('preFloatingBounds', current);
      // Anchor to top-right of the current display so the sticky window
      // doesn't cover the middle of the screen.
      const { workArea } = screen.getPrimaryDisplay();
      const x = Math.min(current.x, workArea.x + workArea.width - FLOATING_SIZE.width - 16);
      w.setBounds({
        x: Math.max(workArea.x + 16, x),
        y: Math.max(workArea.y + 16, current.y),
        width: FLOATING_SIZE.width,
        height: FLOATING_SIZE.height,
      });
    } else if (!on && wasFloating) {
      const saved = prefs.get('preFloatingBounds');
      if (saved) w.setBounds(saved);
    }
  });

  ipcMain.handle(CH.authSave, (_e, session: StoredSession) => {
    saveSession(session);
    return true;
  });

  ipcMain.handle(CH.authLoad, () => loadSession());

  ipcMain.handle(CH.authClear, () => {
    clearSession();
    prefs.set('activeBusinessId', null);
    return true;
  });

  // Generic encrypted key-value storage exposed to the renderer as
  // `pos.storage.*`. Supabase JS uses this as its auth storage adapter so
  // its refresh-token rotation runs against safeStorage-encrypted state
  // instead of localStorage.
  ipcMain.handle(CH.storageGet, (_e, key: string) => storageGet(key));
  ipcMain.handle(CH.storageSet, (_e, key: string, value: string) => {
    storageSet(key, value);
  });
  ipcMain.handle(CH.storageRemove, (_e, key: string) => {
    storageRemove(key);
  });

  ipcMain.handle(CH.notifyNewOrder, (_e, payload: NewOrderNotifPayload) => {
    showOrderNotification(getWindow(), payload);
  });

  ipcMain.handle(
    CH.badgeSet,
    (_e, args: number | { pending: number; iconDataUrl?: string }) => {
      // Backwards-compat: accept a bare number as before, or a bag with icon.
      const pending = typeof args === 'number' ? args : args.pending;
      const iconDataUrl = typeof args === 'number' ? undefined : args.iconDataUrl;
      updateBadge(getWindow(), pending, iconDataUrl);
    },
  );

  ipcMain.handle(CH.printTicket, (_e, args: PrintTicketArgs) => printTicket(args));

  ipcMain.handle(CH.printListPrinters, () => listPrinters());

  ipcMain.handle(CH.printListUsb, () => listUsbPrinters());

  ipcMain.handle(
    CH.printOrder,
    (
      _e,
      args: {
        order: EscposOrder;
        mode: 'kitchen' | 'customer' | 'both';
        html?: { kitchen?: string; customer?: string };
        productCategoryIds?: Record<string, number>;
      },
    ) => {
      // One-shot migration on first print call.
      migrateLegacyPrinters();
      const printers = (prefs.get('printers') as RouterPrinter[]) ?? [];
      return printOrderToConfigured(
        {
          order: args.order,
          mode: args.mode,
          printers,
          productCategoryIds: args.productCategoryIds,
          html: args.html,
        },
        (html, deviceName) => printTicket({ html, deviceName: deviceName || undefined }),
      );
    },
  );

  ipcMain.handle(
    CH.printTestConfig,
    async (_e, args: { config: PrinterConfig; kind: 'kitchen' | 'customer' }) => {
      // Build a tiny sample ticket so the operator can verify formatting.
      const now = new Date().toISOString();
      const sample: EscposOrder = {
        short_code: 'TEST01',
        type: 'takeaway',
        table_number: null,
        customer_name: 'Test',
        customer_phone: null,
        notes: null,
        subtotal_cents: 1500,
        total_cents: 1500,
        currency: 'DT',
        created_at: now,
        items: [
          { quantity: 1, product_name: 'Test print', variant_name: null, line_total_cents: 1500 },
        ],
        business_name: 'SwiftQR POS',
      };
      const bytes = args.kind === 'kitchen' ? buildKitchenTicket(sample) : buildCustomerReceipt(sample);
      if (args.config.type === 'network') {
        return sendToNetworkPrinter(bytes, { host: args.config.host, port: args.config.port });
      }
      if (args.config.type === 'usb') {
        // USB tests come back to the renderer to dispatch via WebUSB.
        return { ok: false, error: 'usb-delegated', bytes: Array.from(bytes) };
      }
      // OS path — use the existing HTML pipeline with the small test doc from before.
      const html =
        '<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:8mm"><h1>SwiftQR POS</h1><div>Test print</div><hr><div>' +
        new Date().toLocaleString() +
        '</div></body>';
      return printTicket({ html, deviceName: args.config.deviceName || undefined });
    },
  );

  ipcMain.handle(
    CH.outboxEnqueue,
    (_e, args: { op: OutboxEntry['op']; payload: unknown; localId?: string }) =>
      outboxEnqueue(args),
  );

  ipcMain.handle(CH.outboxList, () => listOutbox());

  ipcMain.handle(CH.outboxUpdate, (_e, localId: string, patch: Partial<OutboxEntry>) =>
    outboxUpdate(localId, patch),
  );

  ipcMain.handle(CH.outboxDelete, (_e, localId: string) => outboxDelete(localId));

  ipcMain.handle(CH.outboxSummary, () => currentSummary());

  // Broadcast summary changes so the renderer badge stays in sync without polling.
  subscribeSummary((summary) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(CH.outboxSummaryChanged, summary);
    }
  });
}
