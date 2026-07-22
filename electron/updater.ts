import { app, dialog, BrowserWindow } from 'electron';
import { autoUpdater, type UpdateInfo } from 'electron-updater';

/**
 * Auto-update wiring. Only runs in packaged builds — dev environments
 * skip entirely so we don't spam GitHub Releases with checks during
 * development.
 *
 * The user only sees a prompt when an update has been *downloaded* and is
 * ready to install. In-flight failures are logged and forgotten so a bad
 * network doesn't nag the operator during a busy shift.
 */
export function initAutoUpdater(getWindow: () => BrowserWindow | null): void {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = {
    info: (...args: unknown[]) => console.log('[updater]', ...args),
    warn: (...args: unknown[]) => console.warn('[updater]', ...args),
    error: (...args: unknown[]) => console.error('[updater]', ...args),
    debug: (...args: unknown[]) => console.log('[updater:debug]', ...args),
  };

  autoUpdater.on('error', (err) => {
    console.error('[updater] error', err);
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    console.log(`[updater] update available: ${info.version}`);
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[updater] up to date');
  });

  autoUpdater.on('update-downloaded', async (info: UpdateInfo) => {
    const win = getWindow();
    const parent = win && !win.isDestroyed() ? win : undefined;
    const { response } = await dialog.showMessageBox(parent as BrowserWindow, {
      type: 'info',
      buttons: ['Restart & install', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update ready',
      message: `SwiftQR POS ${info.version} is ready to install.`,
      detail: 'The app will restart and update. Your window and open orders are safe.',
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });

  // Fire-and-forget — a check-failure shouldn't block startup.
  autoUpdater.checkForUpdates().catch((err) => {
    console.error('[updater] initial check failed', err);
  });
}
