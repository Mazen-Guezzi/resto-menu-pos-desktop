'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { getPosApi, type OutboxEntry } from '../../lib/pos-api';
import { playNewOrderSound } from '../../lib/orders/sound';
import { SUPPORTED_LANGS, type Lang } from '../../lib/i18n';
import { setLang } from '../../lib/i18n/provider';

type Printer = { name: string; displayName: string; isDefault: boolean };

const TEST_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: -apple-system, sans-serif; margin: 0; padding: 8mm; }
  h1 { font-size: 18px; margin: 0 0 8px; }
  .divider { border-top: 2px dashed #000; margin: 10px 0; }
  .small { font-size: 12px; color: #333; }
</style></head><body>
  <h1>SwiftQR POS</h1>
  <div class="small">Test print</div>
  <div class="divider"></div>
  <div>If you can read this, silent printing is working on this printer.</div>
  <div class="divider"></div>
  <div class="small">${new Date().toLocaleString()}</div>
</body></html>`;

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const [printers, setPrinters] = useState<Printer[] | null>(null);
  const [kitchen, setKitchen] = useState<string | null>(null);
  const [customer, setCustomer] = useState<string | null>(null);
  const [autoPrint, setAutoPrint] = useState(true);
  const [soundOn, setSoundOn] = useState(true);
  const [testing, setTesting] = useState<'kitchen' | 'customer' | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [outbox, setOutbox] = useState<OutboxEntry[]>([]);
  const [floating, setFloating] = useState(false);
  const [hideDock, setHideDock] = useState(false);
  const [isMac, setIsMac] = useState(false);
  const currentLang = (i18n.language as Lang) ?? 'en';

  const refreshOutbox = () => {
    const pos = getPosApi();
    if (!pos) return;
    pos.outbox.list().then(setOutbox);
  };

  useEffect(() => {
    const pos = getPosApi();
    if (!pos) {
      setLoading(false);
      return;
    }
    Promise.all([
      pos.print.listPrinters(),
      pos.prefs.get<string | null>('printerKitchen'),
      pos.prefs.get<string | null>('printerCustomer'),
      pos.prefs.get<boolean>('autoPrintOnAccept'),
      pos.prefs.get<boolean>('soundEnabled'),
    ]).then(([list, k, c, ap, sound]) => {
      setPrinters(list);
      setKitchen(k ?? null);
      setCustomer(c ?? null);
      setAutoPrint(ap ?? true);
      setSoundOn(sound ?? true);
      setLoading(false);
    });
    pos.prefs.get<boolean>('floating').then((v) => setFloating(Boolean(v)));
    pos.prefs.get<boolean>('hideDockOnTray').then((v) => setHideDock(Boolean(v)));
    pos.version().then((v) => setIsMac(v.os.startsWith('darwin')));
    refreshOutbox();
    const unsub = pos.outbox.onSummaryChanged(refreshOutbox);
    return unsub;
  }, []);

  const retryEntry = async (localId: string) => {
    const pos = getPosApi();
    if (!pos) return;
    // Reset state so the sync worker will pick it up on next tick.
    await pos.outbox.update(localId, {
      state: 'pending',
      attempts: 0,
      lastError: null,
      nextAttemptAt: Date.now(),
    });
    refreshOutbox();
  };

  const deleteEntry = async (localId: string) => {
    const pos = getPosApi();
    if (!pos) return;
    if (!confirm(t('settings.confirmDelete'))) return;
    await pos.outbox.delete(localId);
    refreshOutbox();
  };

  const savePrinter = (mode: 'kitchen' | 'customer', name: string | null) => {
    const pos = getPosApi();
    if (!pos) return;
    if (mode === 'kitchen') setKitchen(name);
    else setCustomer(name);
    pos.prefs.set(mode === 'kitchen' ? 'printerKitchen' : 'printerCustomer', name);
  };

  const toggle = async (key: 'autoPrintOnAccept' | 'soundEnabled', v: boolean) => {
    const pos = getPosApi();
    if (!pos) return;
    if (key === 'autoPrintOnAccept') setAutoPrint(v);
    else setSoundOn(v);
    await pos.prefs.set(key, v);
  };

  const toggleFloating = async (v: boolean) => {
    const pos = getPosApi();
    if (!pos) return;
    setFloating(v);
    await pos.window.setFloating(v);
  };

  const toggleHideDock = async (v: boolean) => {
    const pos = getPosApi();
    if (!pos) return;
    setHideDock(v);
    await pos.prefs.set('hideDockOnTray', v);
  };

  const testPrint = async (mode: 'kitchen' | 'customer') => {
    const pos = getPosApi();
    if (!pos) return;
    setTesting(mode);
    setTestError(null);
    const deviceName = (mode === 'kitchen' ? kitchen : customer) ?? undefined;
    const res = await pos.print.ticket({ html: TEST_HTML, deviceName });
    setTesting(null);
    if (!res.ok) setTestError(`${mode}: ${res.error ?? 'failed'}`);
  };

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{t('settings.title')}</div>
          <div style={{ fontSize: 12, opacity: 0.55, marginTop: 4 }}>{t('settings.subtitle')}</div>
        </div>
        <Link href="/orders" style={styles.backLink}>
          {t('settings.back')}
        </Link>
      </div>

      {loading ? (
        <div style={{ opacity: 0.5 }}>{t('common.loading')}</div>
      ) : (
        <>
          <section style={styles.section}>
            <div style={styles.sectionTitle}>{t('settings.language')}</div>
            <div style={styles.langRow}>
              {SUPPORTED_LANGS.map((l) => (
                <button
                  key={l.code}
                  onClick={() => setLang(l.code)}
                  style={{
                    ...styles.langBtn,
                    background: currentLang === l.code ? '#f56c12' : 'transparent',
                    borderColor: currentLang === l.code ? '#f56c12' : '#374151',
                    color: currentLang === l.code ? 'white' : '#e6e8ec',
                  }}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <div style={styles.hint}>{t('settings.languageHint')}</div>
          </section>

          <section style={styles.section}>
            <div style={styles.sectionTitle}>{t('settings.printers')}</div>
            <div style={styles.field}>
              <label style={styles.label}>{t('settings.kitchen')}</label>
              <PrinterSelect
                printers={printers}
                value={kitchen}
                onChange={(v) => savePrinter('kitchen', v)}
                systemDefaultLabel={t('settings.systemDefault')}
                defaultLabel={t('settings.default')}
              />
              <button
                onClick={() => testPrint('kitchen')}
                disabled={testing !== null || !printers || printers.length === 0}
                style={styles.testButton}
              >
                {testing === 'kitchen' ? t('settings.printing') : t('settings.testPrint')}
              </button>
            </div>
            <div style={styles.field}>
              <label style={styles.label}>{t('settings.customer')}</label>
              <PrinterSelect
                printers={printers}
                value={customer}
                onChange={(v) => savePrinter('customer', v)}
                systemDefaultLabel={t('settings.systemDefault')}
                defaultLabel={t('settings.default')}
              />
              <button
                onClick={() => testPrint('customer')}
                disabled={testing !== null || !printers || printers.length === 0}
                style={styles.testButton}
              >
                {testing === 'customer' ? t('settings.printing') : t('settings.testPrint')}
              </button>
            </div>
            {testError && <div style={styles.error}>{testError}</div>}
            {printers && printers.length === 0 && (
              <div style={styles.hint}>{t('settings.noPrinters')}</div>
            )}
          </section>

          <section style={styles.section}>
            <div style={styles.sectionTitle}>{t('settings.window')}</div>
            <ToggleRow
              label={t('settings.floatingMode')}
              hint={t('settings.floatingHint')}
              checked={floating}
              onChange={toggleFloating}
            />
            {isMac && (
              <ToggleRow
                label={t('settings.hideDock')}
                hint={t('settings.hideDockHint')}
                checked={hideDock}
                onChange={toggleHideDock}
              />
            )}
          </section>

          <section style={styles.section}>
            <div style={styles.sectionTitle}>{t('settings.behavior')}</div>
            <ToggleRow
              label={t('settings.autoPrint')}
              hint={t('settings.autoPrintHint')}
              checked={autoPrint}
              onChange={(v) => toggle('autoPrintOnAccept', v)}
            />
            <ToggleRow
              label={t('settings.sound')}
              hint={t('settings.soundHint')}
              checked={soundOn}
              onChange={(v) => toggle('soundEnabled', v)}
            />
            <button
              onClick={() => playNewOrderSound()}
              style={{ ...styles.testButton, marginTop: 8 }}
            >
              {t('settings.playTest')}
            </button>
          </section>

          <section style={styles.section}>
            <div style={styles.sectionTitle}>
              {t('settings.offlineQueue')} {outbox.length > 0 ? `(${outbox.length})` : ''}
            </div>
            {outbox.length === 0 ? (
              <div style={styles.hint}>{t('settings.allSynced')}</div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {outbox.map((e) => {
                  const p = e.payload as { short_code?: string; customer_name?: string; total_cents?: number };
                  return (
                    <li key={e.localId} style={styles.queueItem}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>
                          #{p.short_code ?? '?'} · {p.customer_name ?? t('common.unknown')}
                        </div>
                        <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>
                          {e.state} · {t('settings.attempts', { count: e.attempts })} ·{' '}
                          {new Date(e.createdAt).toLocaleTimeString()}
                        </div>
                        {e.lastError && (
                          <div style={{ fontSize: 11, color: '#fca5a5', marginTop: 4 }}>
                            {e.lastError}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => retryEntry(e.localId)} style={styles.testButton}>
                          {t('common.retry')}
                        </button>
                        <button
                          onClick={() => deleteEntry(e.localId)}
                          style={{ ...styles.testButton, color: '#fca5a5', borderColor: '#7f1d1d' }}
                        >
                          {t('common.delete')}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function PrinterSelect({
  printers,
  value,
  onChange,
  systemDefaultLabel,
  defaultLabel,
}: {
  printers: Printer[] | null;
  value: string | null;
  onChange: (v: string | null) => void;
  systemDefaultLabel: string;
  defaultLabel: string;
}) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      style={styles.select}
    >
      <option value="">{systemDefaultLabel}</option>
      {(printers ?? []).map((p) => (
        <option key={p.name} value={p.name}>
          {p.displayName}
          {p.isDefault ? ` (${defaultLabel})` : ''}
        </option>
      ))}
    </select>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label style={styles.toggleRow}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 3 }}
      />
      <div>
        <div style={{ fontSize: 14 }}>{label}</div>
        <div style={{ fontSize: 12, opacity: 0.55, marginTop: 2 }}>{hint}</div>
      </div>
    </label>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { padding: 24, maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' },
  backLink: { fontSize: 13, color: '#9ca3af', textDecoration: 'none' },
  section: {
    background: '#151821',
    border: '1px solid #232733',
    borderRadius: 10,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.5,
    opacity: 0.5,
    textTransform: 'uppercase',
  },
  field: { display: 'flex', gap: 10, alignItems: 'center' },
  label: { fontSize: 13, minWidth: 130, opacity: 0.85 },
  select: {
    flex: 1,
    background: '#0f1115',
    color: '#e6e8ec',
    border: '1px solid #2a2f3d',
    borderRadius: 6,
    padding: '8px 10px',
    fontSize: 13,
  },
  testButton: {
    background: 'transparent',
    color: '#9ca3af',
    border: '1px solid #374151',
    borderRadius: 6,
    padding: '7px 12px',
    fontSize: 12,
    cursor: 'pointer',
  },
  toggleRow: {
    display: 'flex',
    gap: 12,
    alignItems: 'flex-start',
    cursor: 'pointer',
  },
  error: {
    background: '#3b1a1a',
    color: '#fca5a5',
    border: '1px solid #7f1d1d',
    borderRadius: 6,
    padding: 8,
    fontSize: 13,
  },
  hint: {
    fontSize: 12,
    opacity: 0.6,
    fontStyle: 'italic',
  },
  queueItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    padding: 10,
    background: '#0f1115',
    border: '1px solid #232733',
    borderRadius: 6,
  },
  langRow: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  langBtn: {
    padding: '8px 16px',
    borderRadius: 6,
    border: '1px solid',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  },
};
