import { BrowserWindow, webContents } from 'electron';

export interface PrintTicketArgs {
  html: string;
  deviceName?: string;
}

export interface PrintResult {
  ok: boolean;
  error?: string;
}

export interface PrinterInfo {
  name: string;
  displayName: string;
  description: string;
  isDefault: boolean;
  status: number;
}

/**
 * Silent print. Loads the ticket HTML into an offscreen BrowserWindow,
 * waits for layout, then calls webContents.print with silent:true so no
 * dialog appears. Window is torn down as soon as print resolves.
 */
export async function printTicket(args: PrintTicketArgs): Promise<PrintResult> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      offscreen: false,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  try {
    const url = 'data:text/html;charset=utf-8,' + encodeURIComponent(args.html);
    await win.loadURL(url);
    // Give layout one tick to settle — some drivers otherwise print a partial page.
    await new Promise((r) => setTimeout(r, 80));

    const result = await new Promise<PrintResult>((resolve) => {
      win.webContents.print(
        {
          silent: true,
          deviceName: args.deviceName || undefined,
          printBackground: true,
          margins: { marginType: 'none' },
          color: true,
        },
        (success, failureReason) => {
          if (success) resolve({ ok: true });
          else resolve({ ok: false, error: failureReason || 'print failed' });
        },
      );
    });
    return result;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

/**
 * Enumerates printers via any live webContents. Falls back to an empty list
 * if the app has no windows yet (shouldn't happen — settings page is behind
 * the main window).
 */
export async function listPrinters(): Promise<PrinterInfo[]> {
  const contents = webContents.getAllWebContents()[0];
  if (!contents) return [];
  try {
    const printers = await contents.getPrintersAsync();
    return printers.map((p) => ({
      name: p.name,
      displayName: p.displayName || p.name,
      description: p.description || '',
      isDefault: p.isDefault,
      status: p.status,
    }));
  } catch (err) {
    console.error('[print] listPrinters failed', err);
    return [];
  }
}
