import { Tray, Menu, nativeImage, app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { prefs } from './prefs';

let tray: Tray | null = null;

export function createTray(getWindow: () => BrowserWindow | null) {
  // build-electron.mjs copies tray-icon.png next to main.js, so it's at a
  // stable __dirname-relative path in both dev and packaged builds.
  const iconPath = join(__dirname, 'tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  // Full-colour icon looks right in the tray/menu bar on all platforms.
  // (We don't setTemplateImage on macOS because the SwiftQR logo relies on
  // its actual colours to be recognisable in a busy menu bar.)

  tray = new Tray(icon);
  tray.setToolTip('SwiftQR POS');

  const rebuildMenu = () => {
    const w = getWindow();
    const isVisible = !!w && w.isVisible() && !w.isMinimized();
    const menu = Menu.buildFromTemplate([
      {
        label: isVisible ? 'Hide window' : 'Show window',
        click: () => {
          if (!w) return;
          if (isVisible) w.hide();
          else {
            if (w.isMinimized()) w.restore();
            w.show();
            w.focus();
          }
        },
      },
      {
        label: 'Floating mode',
        type: 'checkbox',
        checked: prefs.get('floating'),
        click: (item) => {
          const on = item.checked;
          prefs.set('floating', on);
          const win = getWindow();
          if (win) {
            win.setAlwaysOnTop(on, 'floating');
            if (process.platform !== 'win32') {
              win.setVisibleOnAllWorkspaces(on, { visibleOnFullScreen: true });
            }
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Quit SwiftQR POS',
        click: () => {
          app.quit();
        },
      },
    ]);
    tray!.setContextMenu(menu);
  };

  rebuildMenu();
  tray.on('click', () => {
    const w = getWindow();
    if (!w) return;
    if (w.isVisible() && !w.isMinimized()) w.hide();
    else {
      if (w.isMinimized()) w.restore();
      w.show();
      w.focus();
    }
    rebuildMenu();
  });

  return { tray, rebuildMenu };
}
