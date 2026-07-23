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

/**
 * Cross-platform badge update.
 *
 *   macOS: `app.setBadgeCount(n)` puts the number in the red bubble on the
 *          Dock icon — no custom drawing needed.
 *   Linux (Unity / KDE 5.16+): `app.setBadgeCount(n)` shows a numbered
 *          launcher badge via libunity-integration.
 *   Windows: no built-in dock-badge concept, so we draw a small numbered
 *            icon in the renderer (canvas → data URL) and hand it to
 *            `mainWindow.setOverlayIcon`, which shows it in the corner of
 *            the taskbar icon.
 */
export function updateBadge(
  win: BrowserWindow | null,
  pending: number,
  iconDataUrl?: string,
): void {
  const n = Math.max(0, Math.floor(pending));

  if (typeof app.setBadgeCount === 'function') {
    try {
      app.setBadgeCount(n);
    } catch {
      /* platform doesn't support it — no-op */
    }
  }

  if (process.platform === 'win32' && win && !win.isDestroyed()) {
    if (n > 0 && iconDataUrl) {
      try {
        const img = nativeImage.createFromDataURL(iconDataUrl);
        win.setOverlayIcon(img, `${n} new order${n === 1 ? '' : 's'}`);
      } catch (err) {
        console.warn('[badge] failed to set overlay icon', err);
      }
    } else {
      win.setOverlayIcon(null, '');
    }
  }
}
