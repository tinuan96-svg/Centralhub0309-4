import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.centralhub.network',
  appName: 'CentralHub',
  webDir: 'out',
  server: {
    url: 'https://centralhub.network',
    cleartext: false,
  },
};

export default config;
