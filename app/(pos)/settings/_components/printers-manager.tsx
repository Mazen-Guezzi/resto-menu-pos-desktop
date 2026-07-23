'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cable, Wifi, Bluetooth, Monitor, Plus, Pencil, Trash2, ChefHat, Receipt } from 'lucide-react';
import { getPosApi, type Printer, type PrinterConfig, type PrinterRole } from '../../../lib/pos-api';
import { useSession } from '../../../lib/session-context';
import { useMenu } from '../../../lib/menu/hooks';
import { pickUsbPrinter } from '../../../lib/webusb';
import { friendlyPrintErrorRaw } from '../../../lib/orders/errors';

type OsPrinter = { name: string; displayName: string; isDefault: boolean };

const hex = (n: number) => n.toString(16).padStart(4, '0');
const genId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

function normalizeArray(raw: unknown): Printer[] {
  if (Array.isArray(raw)) return raw as Printer[];
  return [];
}

// -----------------------------------------------------------------------
// Container
// -----------------------------------------------------------------------
export function PrintersManager() {
  const { t } = useTranslation();
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [editing, setEditing] = useState<Printer | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = () => {
    getPosApi()?.prefs.get('printers').then((v) => setPrinters(normalizeArray(v)));
  };

  useEffect(() => {
    refresh();
  }, []);

  const persist = async (next: Printer[]) => {
    setPrinters(next);
    await getPosApi()?.prefs.set('printers', next);
  };

  const upsert = async (p: Printer) => {
    const exists = printers.some((x) => x.id === p.id);
    await persist(exists ? printers.map((x) => (x.id === p.id ? p : x)) : [...printers, p]);
    setEditing(null);
    setCreating(false);
  };

  const remove = async (id: string) => {
    if (!confirm(t('settings.printer.confirmDelete'))) return;
    await persist(printers.filter((p) => p.id !== id));
  };

  return (
    <>
      <div style={styles.list}>
        {printers.length === 0 && <div style={styles.empty}>{t('settings.printer.none')}</div>}
        {printers.map((p) => (
          <PrinterRow
            key={p.id}
            printer={p}
            onEdit={() => setEditing(p)}
            onDelete={() => remove(p.id)}
          />
        ))}
        <button type="button" onClick={() => setCreating(true)} style={styles.addBtn}>
          <Plus size={14} />
          <span>{t('settings.printer.add')}</span>
        </button>
      </div>

      {(editing || creating) && (
        <PrinterFormModal
          initial={editing ?? undefined}
          onCancel={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSave={upsert}
        />
      )}
    </>
  );
}

// -----------------------------------------------------------------------
// Single row in the printers list
// -----------------------------------------------------------------------
function PrinterRow({
  printer,
  onEdit,
  onDelete,
}: {
  printer: Printer;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const test = async () => {
    setTesting(true);
    setMsg(null);
    const kind = printer.role === 'kitchen' ? 'kitchen' : 'customer';
    const res = await getPosApi()!.print.testConfig({ config: printer.config, kind });
    setTesting(false);
    setMsg({ ok: res.ok, text: res.ok ? t('settings.testOk') : friendlyPrintErrorRaw(res.error, t) });
  };

  const RoleIcon = printer.role === 'kitchen' ? ChefHat : Receipt;
  const roleLabel = t(`settings.printer.role.${printer.role}`);
  const configSummary = summarizeConfig(printer.config, t);
  const filterSummary =
    printer.role === 'kitchen' && printer.categoryIds && printer.categoryIds.length > 0
      ? t('settings.printer.filterCount', { count: printer.categoryIds.length })
      : t('settings.printer.filterAll');

  return (
    <div style={styles.row}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
        <div style={{ ...styles.rolePill, color: printer.role === 'kitchen' ? '#fbbf24' : '#60a5fa' }}>
          <RoleIcon size={14} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={styles.rowName}>{printer.name}</div>
          <div style={styles.rowMeta}>
            <span>{roleLabel}</span>
            <span>·</span>
            <span>{configSummary}</span>
            {printer.role === 'kitchen' && (
              <>
                <span>·</span>
                <span>{filterSummary}</span>
              </>
            )}
          </div>
          {msg && (
            <div style={{ ...styles.rowMsg, color: msg.ok ? '#4ade80' : '#fca5a5' }}>{msg.text}</div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button type="button" onClick={test} disabled={testing} style={styles.iconBtn} title={t('settings.testPrint')}>
          {testing ? '…' : t('settings.testPrint')}
        </button>
        <button type="button" onClick={onEdit} style={styles.iconBtn} title={t('settings.printer.edit')}>
          <Pencil size={13} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          style={{ ...styles.iconBtn, color: '#fca5a5' }}
          title={t('common.delete')}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

function summarizeConfig(c: PrinterConfig, t: (k: string) => string): string {
  if (c.type === 'os') return c.deviceName || t('settings.systemDefault');
  if (c.type === 'network') return `${c.host}:${c.port ?? 9100}`;
  if (c.type === 'usb') return c.label ?? `${hex(c.vendorId)}:${hex(c.productId)}`;
  return '';
}

// -----------------------------------------------------------------------
// Add / edit modal
// -----------------------------------------------------------------------
function PrinterFormModal({
  initial,
  onCancel,
  onSave,
}: {
  initial?: Printer;
  onCancel: () => void;
  onSave: (p: Printer) => void;
}) {
  const { t } = useTranslation();
  const { activeBusinessId } = useSession();
  const { categories } = useMenu(activeBusinessId ? Number(activeBusinessId) : null);

  const [name, setName] = useState(initial?.name ?? '');
  const [role, setRole] = useState<PrinterRole>(initial?.role ?? 'kitchen');
  const [transport, setTransport] = useState<'os' | 'network' | 'usb'>(
    initial?.config.type === 'network' ? 'network' : initial?.config.type === 'usb' ? 'usb' : 'os',
  );
  const [config, setConfig] = useState<PrinterConfig>(
    initial?.config ?? { type: 'os', deviceName: null },
  );
  const [categoryIds, setCategoryIds] = useState<number[]>(initial?.categoryIds ?? []);
  const [osPrinters, setOsPrinters] = useState<OsPrinter[]>([]);

  useEffect(() => {
    const pos = getPosApi();
    if (!pos) return;
    pos.print.listPrinters().then(setOsPrinters);
  }, []);

  const pickUsb = async () => {
    const dev = await pickUsbPrinter();
    if (!dev) return;
    setConfig({
      type: 'usb',
      vendorId: dev.vendorId,
      productId: dev.productId,
      label: dev.productName ?? dev.manufacturerName ?? `${hex(dev.vendorId)}:${hex(dev.productId)}`,
    });
  };

  const chooseTransport = (nextT: 'os' | 'network' | 'usb') => {
    setTransport(nextT);
    if (nextT === 'os' && config.type !== 'os') setConfig({ type: 'os', deviceName: null });
    if (nextT === 'network' && config.type !== 'network')
      setConfig({ type: 'network', host: '', port: 9100 });
    if (nextT === 'usb' && config.type !== 'usb')
      setConfig({ type: 'usb', vendorId: 0, productId: 0 });
  };

  const toggleCat = (id: number) => {
    setCategoryIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const canSave =
    name.trim().length > 0 &&
    ((config.type === 'os') ||
      (config.type === 'network' && config.host.length > 0) ||
      (config.type === 'usb' && config.vendorId > 0 && config.productId > 0));

  const save = () => {
    if (!canSave) return;
    const printer: Printer = {
      id: initial?.id ?? genId(),
      name: name.trim(),
      role,
      config,
      categoryIds: role === 'kitchen' && categoryIds.length > 0 ? categoryIds : undefined,
    };
    onSave(printer);
  };

  return (
    <div style={styles.backdrop} onClick={onCancel}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <header style={styles.modalHeader}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>
            {initial ? t('settings.printer.edit') : t('settings.printer.add')}
          </div>
        </header>

        <div style={styles.modalBody}>
          {/* Name */}
          <label style={styles.field}>
            <span style={styles.miniLabel}>{t('settings.printer.name')}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('settings.printer.namePlaceholder')}
              style={styles.input}
              autoFocus
            />
          </label>

          {/* Role */}
          <div style={styles.field}>
            <span style={styles.miniLabel}>{t('settings.printer.roleLabel')}</span>
            <div style={styles.chipRow}>
              <button
                type="button"
                onClick={() => setRole('kitchen')}
                style={chipStyle(role === 'kitchen')}
              >
                <ChefHat size={13} /> {t('settings.printer.role.kitchen')}
              </button>
              <button
                type="button"
                onClick={() => setRole('customer')}
                style={chipStyle(role === 'customer')}
              >
                <Receipt size={13} /> {t('settings.printer.role.customer')}
              </button>
            </div>
          </div>

          {/* Transport */}
          <div style={styles.field}>
            <span style={styles.miniLabel}>{t('settings.printer.transport')}</span>
            <div style={styles.chipRow}>
              <button type="button" onClick={() => chooseTransport('os')} style={chipStyle(transport === 'os')}>
                <Monitor size={13} /> {t('settings.transport.os')}
              </button>
              <button type="button" onClick={() => chooseTransport('network')} style={chipStyle(transport === 'network')}>
                <Wifi size={13} /> {t('settings.transport.network')}
              </button>
              <button type="button" onClick={() => chooseTransport('usb')} style={chipStyle(transport === 'usb')}>
                <Cable size={13} /> {t('settings.transport.usb')}
              </button>
              <button type="button" disabled style={{ ...chipStyle(false), opacity: 0.5, cursor: 'not-allowed' }}>
                <Bluetooth size={13} /> {t('settings.transport.bluetooth')}
              </button>
            </div>
          </div>

          {/* Transport-specific config */}
          {config.type === 'os' && (
            <label style={styles.field}>
              <span style={styles.miniLabel}>{t('settings.osPrinter')}</span>
              <select
                value={config.deviceName ?? ''}
                onChange={(e) => setConfig({ type: 'os', deviceName: e.target.value || null })}
                style={styles.select}
              >
                <option value="">{t('settings.systemDefault')}</option>
                {osPrinters.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.displayName}
                    {p.isDefault ? ` (${t('settings.default')})` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}

          {config.type === 'network' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 8 }}>
              <label style={styles.field}>
                <span style={styles.miniLabel}>{t('settings.network.host')}</span>
                <input
                  value={config.host}
                  onChange={(e) => setConfig({ type: 'network', host: e.target.value, port: config.port })}
                  placeholder="192.168.1.50"
                  style={styles.input}
                />
              </label>
              <label style={styles.field}>
                <span style={styles.miniLabel}>{t('settings.network.port')}</span>
                <input
                  value={String(config.port ?? 9100)}
                  onChange={(e) =>
                    setConfig({ type: 'network', host: config.host, port: Number(e.target.value) || 9100 })
                  }
                  inputMode="numeric"
                  style={styles.input}
                />
              </label>
            </div>
          )}

          {config.type === 'usb' && (
            <div style={styles.field}>
              <span style={styles.miniLabel}>{t('settings.usb.device')}</span>
              {config.vendorId > 0 ? (
                <div style={styles.usbSelected}>
                  <span>{config.label ?? `${hex(config.vendorId)}:${hex(config.productId)}`}</span>
                  <button type="button" onClick={pickUsb} style={styles.secondaryBtn}>
                    {t('settings.usb.change')}
                  </button>
                </div>
              ) : (
                <button type="button" onClick={pickUsb} style={styles.secondaryBtn}>
                  {t('settings.usb.pick')}
                </button>
              )}
              <div style={styles.hint}>{t('settings.usb.hint')}</div>
            </div>
          )}

          {/* Category filter (kitchen only) */}
          {role === 'kitchen' && (
            <div style={styles.field}>
              <span style={styles.miniLabel}>{t('settings.printer.filterHeader')}</span>
              {categories === null ? (
                <div style={styles.hint}>{t('common.loading')}</div>
              ) : categories.length === 0 ? (
                <div style={styles.hint}>{t('settings.printer.filterNoCategories')}</div>
              ) : (
                <>
                  <div style={{ ...styles.chipRow, marginBottom: 6 }}>
                    {categories.map((c) => {
                      const active = categoryIds.includes(c.id);
                      return (
                        <button
                          type="button"
                          key={c.id}
                          onClick={() => toggleCat(c.id)}
                          style={chipStyle(active)}
                        >
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                  <div style={styles.hint}>
                    {categoryIds.length === 0
                      ? t('settings.printer.filterAllHint')
                      : t('settings.printer.filterSomeHint', { count: categoryIds.length })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <footer style={styles.modalFooter}>
          <button type="button" onClick={onCancel} style={styles.secondaryBtn}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            style={{ ...styles.primaryBtn, opacity: canSave ? 1 : 0.5 }}
          >
            {t('common.save')}
          </button>
        </footer>
      </div>
    </div>
  );
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    borderRadius: 6,
    border: `1px solid ${active ? '#f56c12' : '#374151'}`,
    background: active ? '#f56c12' : 'transparent',
    color: active ? 'white' : '#e6e8ec',
    fontSize: 12,
    cursor: 'pointer',
  };
}

const styles: Record<string, React.CSSProperties> = {
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  empty: { padding: 20, textAlign: 'center', opacity: 0.55, fontSize: 13 },
  row: {
    display: 'flex',
    gap: 10,
    padding: '10px 12px',
    background: '#0f1115',
    border: '1px solid #232733',
    borderRadius: 8,
    alignItems: 'flex-start',
  },
  rolePill: {
    width: 30,
    height: 30,
    borderRadius: 6,
    background: '#1a1d24',
    border: '1px solid #2a2f3d',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowName: { fontSize: 13, fontWeight: 600 },
  rowMeta: {
    fontSize: 11,
    opacity: 0.6,
    marginTop: 2,
    display: 'flex',
    gap: 5,
    flexWrap: 'wrap' as const,
  },
  rowMsg: { fontSize: 11, marginTop: 4 },
  iconBtn: {
    background: 'transparent',
    color: '#9ca3af',
    border: '1px solid #374151',
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 12,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    height: 28,
  },
  addBtn: {
    alignSelf: 'flex-start',
    background: 'transparent',
    color: '#9ca3af',
    border: '1px dashed #374151',
    borderRadius: 6,
    padding: '8px 14px',
    fontSize: 13,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  },
  // --- Modal ---
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: 20,
  },
  modal: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '90vh',
    background: '#12151d',
    border: '1px solid #232733',
    borderRadius: 12,
    display: 'flex',
    flexDirection: 'column',
  },
  modalHeader: { padding: '14px 18px', borderBottom: '1px solid #232733' },
  modalBody: {
    padding: 18,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    flex: 1,
  },
  modalFooter: {
    padding: 14,
    borderTop: '1px solid #232733',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
  },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  miniLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.5,
    opacity: 0.65,
    textTransform: 'uppercase' as const,
  },
  input: {
    background: '#0a0c11',
    color: '#e6e8ec',
    border: '1px solid #2a2f3d',
    borderRadius: 6,
    padding: '8px 10px',
    fontSize: 13,
    outline: 'none',
  },
  select: {
    background: '#0a0c11',
    color: '#e6e8ec',
    border: '1px solid #2a2f3d',
    borderRadius: 6,
    padding: '8px 10px',
    fontSize: 13,
  },
  chipRow: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  hint: { fontSize: 12, opacity: 0.55, lineHeight: 1.4 },
  primaryBtn: {
    background: '#f56c12',
    color: 'white',
    border: 'none',
    borderRadius: 6,
    padding: '9px 16px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  secondaryBtn: {
    background: 'transparent',
    color: '#e6e8ec',
    border: '1px solid #374151',
    borderRadius: 6,
    padding: '9px 16px',
    fontSize: 13,
    cursor: 'pointer',
  },
  usbSelected: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: '8px 10px',
    background: '#0a0c11',
    border: '1px solid #2a2f3d',
    borderRadius: 6,
    fontSize: 13,
  },
};
