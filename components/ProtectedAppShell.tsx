'use client';

import type { ReactNode } from 'react';
import AuthProvider from '@/components/AuthProvider';
import MobileLayout from '@/components/MobileLayout';
import ShruthiSecurityTranscriptNormalizer from '@/components/ShruthiSecurityTranscriptNormalizer';
import ShruthiSecurityBiometricAutoStart from '@/components/ShruthiSecurityBiometricAutoStart';
import NativeAppAutoUpdater from '@/components/NativeAppAutoUpdater';

export default function ProtectedAppShell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ShruthiSecurityTranscriptNormalizer />
      <ShruthiSecurityBiometricAutoStart />
      <NativeAppAutoUpdater />
      <MobileLayout>{children}</MobileLayout>
    </AuthProvider>
  );
}
