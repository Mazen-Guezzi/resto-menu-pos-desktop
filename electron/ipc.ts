import { app, ipcMain, BrowserWindow, screen } from 'electron';
import { prefs, type Prefs, FLOATING_SIZE } from './prefs';
import { saveSession, loadSession, clearSession } from './auth-store';
import { showOrderNotification, updateBadge, type NewOrderNotifPayload } from './notifications';
import { printTicket, listPrinters, type PrintTicketArgs } from './printing';
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

  ipcMain.handle(CH.notifyNewOrder, (_e, payload: NewOrderNotifPayload) => {
    showOrderNotification(getWindow(), payload);
  });

  ipcMain.handle(CH.badgeSet, (_e, pending: number) => {
    updateBadge(getWindow(), Math.max(0, Math.floor(pending)));
  });

  ipcMain.handle(CH.printTicket, (_e, args: PrintTicketArgs) => printTicket(args));

  ipcMain.handle(CH.printListPrinters, () => listPrinters());

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
