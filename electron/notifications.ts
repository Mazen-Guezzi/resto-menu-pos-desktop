import { Notification, BrowserWindow, app, nativeImage } from 'electron';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { CH } from './channels';

export interface NewOrderNotifPayload {
  orderId: number;
  title: string;
  body: string;
}

const focusWindow = (win: BrowserWindow | null) => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.focus();
};

const NOTIF_ICON_PATH = join(__dirname, 'icon.png');

export function showOrderNotification(
  win: BrowserWindow | null,
  payload: NewOrderNotifPayload,
): void {
  if (!Notification.isSupported()) return;
  const n = new Notification({
    title: payload.title,
    body: payload.body,
    silent: false,
    urgency: 'normal',
    icon: existsSync(NOTIF_ICON_PATH) ? NOTIF_ICON_PATH : undefined,
  });
  n.on('click', () => {
    focusWindow(win);
    win?.webContents.send(CH.notificationClick, { orderId: payload.orderId });
  });
  n.show();
}

const ICON_PIXEL = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0,
  0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 248, 15, 0, 1, 1, 1, 0, 24, 221,
  138, 60, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
]);

export function updateBadge(win: BrowserWindow | null, pending: number): void {
  // macOS + Linux (Unity): dock badge count.
  if (typeof app.setBadgeCount === 'function') {
    try {
      app.setBadgeCount(pending);
    } catch {
      /* platform doesn't support it — no-op */
    }
  }
  // Windows: taskbar overlay icon. We use a 1x1 transparent icon just to make
  // the overlay-slot known; a real numbered icon lands in M6 with real assets.
  if (process.platform === 'win32' && win && !win.isDestroyed()) {
    if (pending > 0) {
      const img = nativeImage.createFromBuffer(Buffer.from(ICON_PIXEL));
      win.setOverlayIcon(img, `${pending} new order${pending === 1 ? '' : 's'}`);
    } else {
      win.setOverlayIcon(null, '');
    }
  }
}
