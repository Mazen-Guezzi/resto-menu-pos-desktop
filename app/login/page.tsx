'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useSession } from '../lib/session-context';
import { supabaseConfigured } from '../lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { session, loading, signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && session) router.replace('/orders');
  }, [loading, session, router]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: err } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (err) setError(err.message);
    else router.replace('/orders');
  };

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <div style={styles.brandRow}>
          <img
            src="/logo/logo.png"
            alt=""
            width={44}
            height={44}
            style={{ borderRadius: 10 }}
          />
          <h1 style={styles.title}>{t('nav.brand')}</h1>
        </div>
        <p style={styles.subtitle}>{t('auth.subtitle')}</p>

        {!supabaseConfigured && <div style={styles.warn}>{t('auth.configMissing')}</div>}

        <form onSubmit={onSubmit} style={styles.form}>
          <label style={styles.label}>
            {t('auth.email')}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              style={styles.input}
            />
          </label>
          <label style={styles.label}>
            {t('auth.password')}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={styles.input}
            />
          </label>

          {error && <div style={styles.error}>{error}</div>}

          <button
            type="submit"
            disabled={submitting || !supabaseConfigured}
            style={{
              ...styles.button,
              opacity: submitting || !supabaseConfigured ? 0.5 : 1,
              cursor: submitting || !supabaseConfigured ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? t('auth.signingIn') : t('auth.signIn')}
          </button>
        </form>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    background: '#151821',
    border: '1px solid #232733',
    borderRadius: 12,
    padding: 32,
  },
  brandRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 },
  title: { margin: 0, fontSize: 22, fontWeight: 700 },
  subtitle: { margin: '4px 0 24px', opacity: 0.6, fontSize: 14 },
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  label: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, opacity: 0.85 },
  input: {
    background: '#0f1115',
    border: '1px solid #2a2f3d',
    color: '#e6e8ec',
    borderRadius: 8,
    padding: '10px 12px',
    fontSize: 14,
    outline: 'none',
  },
  button: {
    background: '#f56c12',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    padding: '12px 16px',
    fontSize: 14,
    fontWeight: 600,
    marginTop: 4,
  },
  error: {
    background: '#3b1a1a',
    color: '#fca5a5',
    border: '1px solid #7f1d1d',
    borderRadius: 6,
    padding: '8px 10px',
    fontSize: 13,
  },
  warn: {
    background: '#2a2410',
    color: '#fbbf24',
    border: '1px solid #78350f',
    borderRadius: 6,
    padding: '10px 12px',
    fontSize: 12,
    marginBottom: 16,
    lineHeight: 1.5,
  },
};
