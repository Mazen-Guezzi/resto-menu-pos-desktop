import type { Metadata } from 'next';
import { SessionProvider } from './lib/session-context';
import { I18nProvider } from './lib/i18n/provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'SwiftQR POS',
  description: 'Desktop POS for SwiftQR',
  icons: {
    icon: '/favicon.ico',
    apple: '/favicon/apple-touch-icon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" dir="ltr">
      <body>
        <I18nProvider>
          <SessionProvider>{children}</SessionProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
