import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';
import { prefs } from './prefs';

const DEV_URL = 'http://127.0.0.1:8095';
const isDev = process.env.NODE_ENV === 'development';

export function createMainWindow(): BrowserWindow {
  const bounds = prefs.get('floating') ? prefs.get('preFloatingBounds') ?? prefs.get('windowBounds') : prefs.get('windowBounds');
  const { workArea } = screen.getPrimaryDisplay();

  const width = Math.min(bounds.width, workArea.width);
  const height = Math.min(bounds.height, workArea.height);
  const x = bounds.x !== undefined ? bounds.x : Math.round(workArea.x + (workArea.width - width) / 2);
  const y = bounds.y !== undefined ? bounds.y : Math.round(workArea.y + (workArea.height - height) / 2);

  const win = new BrowserWindow({
    x,
    y,
    width,
    height,
    minWidth: 340,
    minHeight: 500,
    show: false,
    backgroundColor: '#0a0c11',
    autoHideMenuBar: true,
    // Windows/Linux use this for the window's title-bar and Alt+Tab icon.
    // macOS ignores it (uses the .icns from the .app bundle).
    icon: join(__dirname, 'icon.png'),
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Bounds persistence only applies when we're NOT in floating mode — the
  // compact floating size shouldn't overwrite the user's normal layout.
  const persistBounds = () => {
    if (win.isDestroyed()) return;
    if (win.isMinimized() || win.isMaximized() || win.isFullScreen()) return;
    if (prefs.get('floating')) return;
    const b = win.getBounds();
    prefs.set('windowBounds', b);
  };

  win.on('resize', persistBounds);
  win.on('move', persistBounds);
  win.on('close', persistBounds);

  win.once('ready-to-show', () => {
    win.show();
    if (prefs.get('floating')) {
      win.setAlwaysOnTop(true, 'floating');
    }
  });

  if (isDev) {
    win.loadURL(DEV_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(join(__dirname, '../../out/index.html'));
  }

  return win;
}
