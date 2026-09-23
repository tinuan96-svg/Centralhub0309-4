import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.centralhub.network',
  appName: 'CentralHub',
  webDir: 'out',
  server: {
    url: 'https://centralhub.network/login',
    cleartext: false,
  },
};

export default config;
