const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('CentralHubNative', {
  getPlatform: () => 'windows',
  getAppId: () => 'com.centralhub.network.windows',
  getFcmToken: () => '',
  isTaraVoiceAvailable: () => false,
  setTaraEnabled: () => {},
  setTaraSpeaking: () => {},
  stopTaraTts: () => {},
  isShruthiRealtimeAvailable: () => false,
  startShruthiRealtime: () => false,
  stopShruthiRealtime: () => {},
  interruptShruthiRealtime: () => {},
});
