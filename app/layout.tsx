import './globals.css';
import './fold-mobile-fixes.css';
import './dashboard-theme.css';
import './retired-integrations.css';
import AuthProvider from '@/components/AuthProvider';
import MobileLayout from '@/components/MobileLayout';
import ShruthiSecurityTranscriptNormalizer from '@/components/ShruthiSecurityTranscriptNormalizer';

export const metadata = {
  title: 'CentralHub',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AuthProvider>
          <ShruthiSecurityTranscriptNormalizer />
          <MobileLayout>
            {children}
          </MobileLayout>
        </AuthProvider>
      </body>
    </html>
  );
}
