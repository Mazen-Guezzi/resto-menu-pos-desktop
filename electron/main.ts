import { app, BrowserWindow, globalShortcut } from 'electron';
import { createMainWindow } from './window';
import { createTray } from './tray';
import { registerIpc } from './ipc';
import { initAutoUpdater } from './updater';
import { prefs } from './prefs';

const TOGGLE_SHORTCUT = process.platform === 'darwin' ? 'Cmd+Shift+O' : 'Ctrl+Shift+O';

let mainWindow: BrowserWindow | null = null;

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  });

  const wireDockVisibility = (win: BrowserWindow) => {
    if (process.platform !== 'darwin') return;
    win.on('hide', () => {
      if (prefs.get('hideDockOnTray')) app.dock?.hide();
    });
    win.on('show', () => {
      app.dock?.show();
    });
  };

  const toggleWindow = () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible() && !mainWindow.isMinimized() && mainWindow.isFocused()) {
      mainWindow.hide();
    } else {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  };

  app.whenReady().then(() => {
    // Dev-mode dock icon (macOS). Packaged builds already ship a proper .icns
    // from build/icon.png, but in `npm run dev` we run bare electron which
    // otherwise shows the default Electron logo in the dock.
    if (process.platform === 'darwin' && app.dock && !app.isPackaged) {
      try {
        app.dock.setIcon(require('node:path').join(__dirname, 'icon.png'));
      } catch {
        /* ignore — icon.png may not exist during first-run before build */
      }
    }

    mainWindow = createMainWindow();
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
    wireDockVisibility(mainWindow);

    createTray(() => mainWindow);
    registerIpc(() => mainWindow);
    initAutoUpdater(() => mainWindow);

    const registered = globalShortcut.register(TOGGLE_SHORTCUT, toggleWindow);
    if (!registered) {
      console.warn(`[shortcut] failed to register ${TOGGLE_SHORTCUT}`);
    }

    app.on('activate', () => {
      if (!mainWindow) {
        mainWindow = createMainWindow();
        mainWindow.on('closed', () => {
          mainWindow = null;
        });
        wireDockVisibility(mainWindow);
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });

  app.on('window-all-closed', () => {
    // Keep app running in tray on all platforms — POS stays alive to receive orders.
  });
}
