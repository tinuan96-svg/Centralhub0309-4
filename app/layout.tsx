import './globals.css';
import './fold-mobile-fixes.css';
import AuthProvider from '@/components/AuthProvider';
import MobileLayout from '@/components/MobileLayout';

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
          <MobileLayout>
            {children}
          </MobileLayout>
        </AuthProvider>
      </body>
    </html>
  );
}
