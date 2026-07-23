'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cable, Wifi, Bluetooth, Monitor } from 'lucide-react';
import { getPosApi, type PrinterConfig } from '../../../lib/pos-api';

type OsPrinter = { name: string; displayName: string; isDefault: boolean };
type UsbPrinter = {
  vendorId: number;
  productId: number;
  manufacturer?: string;
  product?: string;
  serial?: string;
};

type PrinterType = 'os' | 'network' | 'usb' | 'bluetooth';

const hex = (n: number) => n.toString(16).padStart(4, '0');

// Migrate legacy string prefs → new PrinterConfig shape on read.
function normalize(raw: unknown): PrinterConfig | null {
  if (!raw) return null;
  if (typeof raw === 'string') return { type: 'os', deviceName: raw };
  if (typeof raw === 'object' && raw !== null && 'type' in raw) return raw as PrinterConfig;
  return null;
}

export function PrinterCard({
  prefKey,
  title,
}: {
  prefKey: 'printerKitchen' | 'printerCustomer';
  title: string;
}) {
  const { t } = useTranslation();
  const [config, setConfig] = useState<PrinterConfig | null>(null);
  const [type, setType] = useState<PrinterType>('os');
  const [osPrinters, setOsPrinters] = useState<OsPrinter[]>([]);
  const [usbPrinters, setUsbPrinters] = useState<UsbPrinter[]>([]);
  const [host, setHost] = useState('');
  const [port, setPort] = useState('9100');
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const pos = getPosApi();
    if (!pos) return;
    pos.prefs.get(prefKey).then((v) => {
      const c = normalize(v);
      setConfig(c);
      if (c?.type === 'network') {
        setType('network');
        setHost(c.host);
        setPort(String(c.port ?? 9100));
      } else if (c?.type === 'usb') {
        setType('usb');
      } else {
        setType('os');
      }
    });
    pos.print.listPrinters().then(setOsPrinters);
    pos.print.listUsb().then(setUsbPrinters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = async (next: PrinterConfig | null) => {
    setConfig(next);
    await getPosApi()?.prefs.set(prefKey, next);
  };

  const chooseType = (nextType: PrinterType) => {
    setType(nextType);
    if (nextType === 'os') {
      // Preserve prior device name if we had one.
      const deviceName =
        config?.type === 'os' ? config.deviceName ?? null : null;
      persist({ type: 'os', deviceName });
    } else if (nextType === 'network') {
      persist({
        type: 'network',
        host: host || (config?.type === 'network' ? config.host : ''),
        port: Number(port) || 9100,
      });
    } else if (nextType === 'usb') {
      // Keep last USB if we had one; otherwise clear until user picks.
      persist(config?.type === 'usb' ? config : null);
    }
  };

  const setOsPrinter = (deviceName: string | null) => {
    persist({ type: 'os', deviceName });
  };

  const setNetwork = (h: string, p: string) => {
    setHost(h);
    setPort(p);
    persist({ type: 'network', host: h, port: Number(p) || 9100 });
  };

  const setUsbPrinter = (u: UsbPrinter) => {
    persist({
      type: 'usb',
      vendorId: u.vendorId,
      productId: u.productId,
      label: u.product ?? u.manufacturer ?? `${hex(u.vendorId)}:${hex(u.productId)}`,
    });
  };

  const test = async () => {
    if (!config) return;
    setTesting(true);
    setTestMsg(null);
    const kind = prefKey === 'printerKitchen' ? 'kitchen' : 'customer';
    const res = await getPosApi()!.print.testConfig({ config, kind });
    setTesting(false);
    setTestMsg({ ok: res.ok, text: res.ok ? t('settings.testOk') : res.error || 'error' });
  };

  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>{title}</div>
      <div style={styles.typeRow}>
        <TypeBtn active={type === 'os'} onClick={() => chooseType('os')} icon={<Monitor size={14} />} label={t('settings.transport.os')} />
        <TypeBtn active={type === 'network'} onClick={() => chooseType('network')} icon={<Wifi size={14} />} label={t('settings.transport.network')} />
        <TypeBtn active={type === 'usb'} onClick={() => chooseType('usb')} icon={<Cable size={14} />} label={t('settings.transport.usb')} />
        <TypeBtn active={false} onClick={() => setType('bluetooth')} icon={<Bluetooth size={14} />} label={t('settings.transport.bluetooth')} />
      </div>

      {type === 'os' && (
        <div style={styles.body}>
          <label style={styles.label}>{t('settings.osPrinter')}</label>
          <select
            value={config?.type === 'os' ? (config.deviceName ?? '') : ''}
            onChange={(e) => setOsPrinter(e.target.value || null)}
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
        </div>
      )}

      {type === 'network' && (
        <div style={styles.body}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 8 }}>
            <label style={styles.label}>
              {t('settings.network.host')}
              <input
                value={host}
                onChange={(e) => setNetwork(e.target.value, port)}
                placeholder="192.168.1.50"
                style={styles.input}
              />
            </label>
            <label style={styles.label}>
              {t('settings.network.port')}
              <input
                value={port}
                onChange={(e) => setNetwork(host, e.target.value)}
                placeholder="9100"
                inputMode="numeric"
                style={styles.input}
              />
            </label>
          </div>
          <div style={styles.hint}>{t('settings.network.hint')}</div>
        </div>
      )}

      {type === 'usb' && (
        <div style={styles.body}>
          <label style={styles.label}>{t('settings.usb.device')}</label>
          {usbPrinters.length === 0 ? (
            <div style={styles.hint}>{t('settings.usb.none')}</div>
          ) : (
            <select
              value={config?.type === 'usb' ? `${config.vendorId}:${config.productId}` : ''}
              onChange={(e) => {
                const [v, p] = e.target.value.split(':').map(Number);
                const dev = usbPrinters.find((u) => u.vendorId === v && u.productId === p);
                if (dev) setUsbPrinter(dev);
              }}
              style={styles.select}
            >
              <option value="">{t('settings.usb.pick')}</option>
              {usbPrinters.map((u) => (
                <option key={`${u.vendorId}:${u.productId}`} value={`${u.vendorId}:${u.productId}`}>
                  {u.product ?? u.manufacturer ?? 'USB Printer'} ({hex(u.vendorId)}:{hex(u.productId)})
                </option>
              ))}
            </select>
          )}
          <div style={styles.hint}>{t('settings.usb.hint')}</div>
        </div>
      )}

      {type === 'bluetooth' && (
        <div style={styles.body}>
          <div style={styles.warnBox}>{t('settings.bluetooth.notice')}</div>
        </div>
      )}

      {type !== 'bluetooth' && (
        <div style={styles.testRow}>
          <button
            type="button"
            onClick={test}
            disabled={testing || !config}
            style={{ ...styles.testBtn, opacity: testing || !config ? 0.5 : 1 }}
          >
            {testing ? t('settings.printing') : t('settings.testPrint')}
          </button>
          {testMsg && (
            <span style={{ ...styles.testMsg, color: testMsg.ok ? '#4ade80' : '#fca5a5' }}>
              {testMsg.text}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function TypeBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...styles.typeBtn,
        background: active ? '#f56c12' : 'transparent',
        borderColor: active ? '#f56c12' : '#374151',
        color: active ? 'white' : '#e6e8ec',
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: '#0f1115',
    border: '1px solid #232733',
    borderRadius: 8,
    padding: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: 700,
    opacity: 0.9,
  },
  typeRow: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  typeBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    borderRadius: 6,
    border: '1px solid',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
  },
  body: { display: 'flex', flexDirection: 'column', gap: 8 },
  label: { fontSize: 12, opacity: 0.7, display: 'flex', flexDirection: 'column', gap: 4 },
  input: {
    background: '#0a0c11',
    color: '#e6e8ec',
    border: '1px solid #2a2f3d',
    borderRadius: 6,
    padding: '7px 10px',
    fontSize: 13,
    outline: 'none',
  },
  select: {
    background: '#0a0c11',
    color: '#e6e8ec',
    border: '1px solid #2a2f3d',
    borderRadius: 6,
    padding: '7px 10px',
    fontSize: 13,
  },
  hint: { fontSize: 11, opacity: 0.55, lineHeight: 1.4 },
  warnBox: {
    fontSize: 12,
    padding: 10,
    background: '#2a2410',
    color: '#fbbf24',
    border: '1px solid #78350f',
    borderRadius: 6,
    lineHeight: 1.5,
  },
  testRow: { display: 'flex', alignItems: 'center', gap: 10 },
  testBtn: {
    background: 'transparent',
    color: '#9ca3af',
    border: '1px solid #374151',
    borderRadius: 6,
    padding: '6px 12px',
    fontSize: 12,
    cursor: 'pointer',
  },
  testMsg: { fontSize: 12 },
};
