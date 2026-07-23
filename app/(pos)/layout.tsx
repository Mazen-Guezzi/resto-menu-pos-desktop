'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { ListOrdered, Plus, Settings2, LogOut, CloudUpload, CloudAlert, BarChart3 } from 'lucide-react';
import { useSession } from '../lib/session-context';
import { useSyncWorker } from '../lib/orders/use-sync-worker';
import { useIsCompact } from '../lib/orders/use-is-compact';
import { useBusinesses, usePendingOrdersCount } from '../lib/orders/hooks';
import { generateBadgeIcon } from '../lib/badge-icon';
import { getPosApi } from '../lib/pos-api';

export default function PosLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { t } = useTranslation();
  const { session, loading, signOut, user } = useSession();
  const sync = useSyncWorker();
  const isCompact = useIsCompact();
  const { active } = useBusinesses();
  const pending = usePendingOrdersCount(active?.id ?? null);

  // Dock (macOS) / launcher (Linux) / taskbar overlay (Windows) badge stays
  // in sync with pending-order count regardless of which POS route the user
  // is currently on.
  useEffect(() => {
    getPosApi()?.badge.set({ pending, iconDataUrl: generateBadgeIcon(pending) });
  }, [pending]);

  useEffect(() => {
    if (!loading && !session) router.replace('/login');
  }, [loading, session, router]);

  if (loading || !session) {
    return (
      <div style={styles.centered}>
        <div style={{ opacity: 0.5, fontSize: 13 }}>{t('common.loading')}</div>
      </div>
    );
  }

  const syncBadge = () => {
    if (sync.errors > 0) {
      return (
        <SyncChip
          color="#fca5a5"
          bg="#3b1a1a"
          border="#7f1d1d"
          label={t('sync.errors', { count: sync.errors })}
          href="/settings"
          icon={<CloudAlert size={12} />}
        />
      );
    }
    const pending = sync.pending + sync.inFlight;
    if (pending > 0) {
      return (
        <SyncChip
          color="#fbbf24"
          bg="#2a2410"
          border="#78350f"
          label={t('sync.pending', { count: pending })}
          icon={<CloudUpload size={12} />}
        />
      );
    }
    return null;
  };

  // In compact/floating mode the CompactBoard renders its own header and the
  // full navbar would eat too much vertical space in a 380px window.
  if (isCompact) {
    return (
      <div style={styles.shell}>
        <div style={styles.content}>{children}</div>
      </div>
    );
  }

  return (
    <div style={styles.shell}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <Link href="/orders" style={styles.brand}>
            <img
              src="/logo/logo.png"
              alt=""
              width={24}
              height={24}
              style={{ borderRadius: 5, display: 'block' }}
            />
            <span style={{ fontWeight: 700 }}>{t('nav.brand')}</span>
          </Link>
          <nav style={styles.nav}>
            <Link href="/orders" style={styles.navLink}>
              <ListOrdered size={14} />
              <span>{t('nav.orders')}</span>
            </Link>
            <Link href="/stats" style={styles.navLink}>
              <BarChart3 size={14} />
              <span>{t('nav.stats')}</span>
            </Link>
            <Link href="/orders/new" style={styles.navLinkPrimary}>
              <Plus size={14} />
              <span>{t('nav.newOrder')}</span>
            </Link>
          </nav>
        </div>
        <div style={styles.headerRight}>
          {syncBadge()}
          <Link href="/settings" style={styles.linkButton}>
            <Settings2 size={13} />
            <span>{t('nav.settings')}</span>
          </Link>
          <span style={{ fontSize: 12, opacity: 0.6 }}>{user?.email}</span>
          <button onClick={() => signOut()} style={styles.linkButton}>
            <LogOut size={13} />
            <span>{t('auth.signOut')}</span>
          </button>
        </div>
      </header>
      <div style={styles.content}>{children}</div>
    </div>
  );
}

function SyncChip({
  label,
  color,
  bg,
  border,
  href,
  icon,
}: {
  label: string;
  color: string;
  bg: string;
  border: string;
  href?: string;
  icon?: React.ReactNode;
}) {
  const style: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    padding: '3px 10px',
    borderRadius: 999,
    background: bg,
    color,
    border: `1px solid ${border}`,
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
  };
  return href ? (
    <Link href={href} style={style}>
      {icon}
      {label}
    </Link>
  ) : (
    <span style={style}>
      {icon}
      {label}
    </span>
  );
}

const styles: Record<string, React.CSSProperties> = {
  centered: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shell: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    borderBottom: '1px solid #232733',
    background: '#12141a',
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 20 },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: '#e6e8ec',
    textDecoration: 'none',
  },
  nav: { display: 'flex', gap: 12, alignItems: 'center' },
  navLink: {
    fontSize: 13,
    color: '#9ca3af',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  },
  navLinkPrimary: {
    fontSize: 13,
    color: 'white',
    textDecoration: 'none',
    background: '#f56c12',
    padding: '5px 12px',
    borderRadius: 6,
    fontWeight: 500,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
  linkButton: {
    background: 'transparent',
    color: '#9ca3af',
    border: 'none',
    fontSize: 12,
    cursor: 'pointer',
    padding: 0,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    textDecoration: 'none',
    fontFamily: 'inherit',
  },
  content: { flex: 1, minHeight: 0, overflow: 'auto' },
};
