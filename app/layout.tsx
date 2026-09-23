import './globals.css';
import './fold-mobile-fixes.css';
import './dashboard-theme.css';
import './retired-integrations.css';
import './shruthi-security-ux.css';
import AppRouteShell from '@/components/AppRouteShell';

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
        <AppRouteShell>{children}</AppRouteShell>
      </body>
    </html>
  );
}
