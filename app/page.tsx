'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useSession } from './lib/session-context';

export default function Index() {
  const router = useRouter();
  const { t } = useTranslation();
  const { session, loading } = useSession();

  useEffect(() => {
    if (loading) return;
    router.replace(session ? '/orders' : '/login');
  }, [loading, session, router]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ opacity: 0.5, fontSize: 13 }}>{t('common.loading')}</div>
    </div>
  );
}
