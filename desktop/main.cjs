const { app, BrowserWindow, Tray, Menu, nativeImage, shell, session } = require('electron');
const path = require('path');

const APP_URL = 'https://centralhub.network/login';
const PARTITION = 'persist:centralhub-windows';
let mainWindow = null;
let tray = null;
let quitting = false;

app.setAppUserModelId('com.centralhub.network.windows');

function trayIcon() {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAsUlEQVRYR+2WMQ6AIAxFf4ZzF4/hoOHi4uTg6OBkPIKJkypFQ9v0B01M+7+0tFjACZ7nVcQTTgF0AC7AGVYB0wDZwDkgG7gG1gDrgHNAOXAPqAeuAfWAecA44B5wD7gH3APuAfcA+4B9wD7gH3APuAfcA+4B9wD7gH3APuAfcA+4B9wD7gH3APuAfcA+4B9wD7gH3APuAfcA+4B9wD7gP0Bf2bK8HVfX1UAAAAASUVORK5CYII=';
  return nativeImage.createFromBuffer(Buffer.from(png, 'base64')).resize({ width: 16, height: 16 });
}

function isCentralHubUrl(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && (u.hostname === 'centralhub.network' || u.hostname.endsWith('.centralhub.network'));
  } catch {
    return false;
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 960,
    minWidth: 980,
    minHeight: 700,
    backgroundColor: '#02050a',
    title: 'CentralHub',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      partition: PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  mainWindow.loadURL(APP_URL);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isCentralHubUrl(url)) return { action: 'allow' };
    shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
}

function showMain() {
  if (!mainWindow) createMainWindow();
  mainWindow.show();
  mainWindow.focus();
}

function configurePermissions() {
  const ses = session.fromPartition(PARTITION);
  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const origin = details?.requestingUrl || webContents.getURL() || '';
    if (permission === 'media' && isCentralHubUrl(origin)) return callback(true);
    callback(false);
  });
}

function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip('CentralHub');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open CentralHub', click: showMain },
    { type: 'separator' },
    { label: 'Quit CentralHub', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('double-click', showMain);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showMain);
  app.whenReady().then(() => {
    configurePermissions();
    createMainWindow();
    createTray();
    app.on('activate', showMain);
  });
}

app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && quitting) app.quit();
});
