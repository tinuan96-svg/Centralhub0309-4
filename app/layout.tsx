import './globals.css';
import './fold-mobile-fixes.css';
import './dashboard-theme.css';
import './retired-integrations.css';
import './shruthi-security-ux.css';
import AuthProvider from '@/components/AuthProvider';
import MobileLayout from '@/components/MobileLayout';
import ShruthiSecurityTranscriptNormalizer from '@/components/ShruthiSecurityTranscriptNormalizer';
import ShruthiSecurityBiometricAutoStart from '@/components/ShruthiSecurityBiometricAutoStart';
import NativeAppAutoUpdater from '@/components/NativeAppAutoUpdater';

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
          <ShruthiSecurityBiometricAutoStart />
          <NativeAppAutoUpdater />
          <MobileLayout>
            {children}
          </MobileLayout>
        </AuthProvider>
      </body>
    </html>
  );
}
