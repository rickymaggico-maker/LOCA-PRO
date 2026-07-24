const { app, BrowserWindow, shell, Menu, dialog, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const path = require('path');

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
autoUpdater.autoDownload = false;

let mainWindow = null;
let updateCheckInProgress = false;

async function checkForUpdates() {
  if (updateCheckInProgress) return;
  updateCheckInProgress = true;

  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    updateCheckInProgress = false;
    await dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Errore aggiornamento',
      message: 'Impossibile controllare gli aggiornamenti.',
      detail: err?.message || 'Errore sconosciuto.'
    });
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f3f5f7',
    title: 'LOCA PRO',
    icon: path.join(__dirname, 'assets', 'loca-pro.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow = win;
  win.loadFile(path.join(__dirname, 'index.html'));

  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  const menu = Menu.buildFromTemplate([
    {
      label: 'LOCA PRO',
      submenu: [
        { label: 'Controlla aggiornamenti', click: checkForUpdates },
        { type: 'separator' },
        { role: 'quit', label: 'Esci' }
      ]
    }
  ]);
  Menu.setApplicationMenu(menu);
}

ipcMain.handle('locapro:check-updates', async () => {
  await checkForUpdates();
  return true;
});

autoUpdater.on('checking-for-update', () => {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'LOCA PRO',
    message: 'Controllo aggiornamenti in corso...'
  });
});

autoUpdater.on('update-available', async () => {
  updateCheckInProgress = false;
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Aggiornamento disponibile',
    message: 'È disponibile una nuova versione di LOCA PRO.',
    detail: 'Vuoi scaricarla adesso?',
    buttons: ['Scarica', 'Annulla'],
    defaultId: 0,
    cancelId: 1
  });

  if (result.response === 0) {
    autoUpdater.downloadUpdate();
  }
});

autoUpdater.on('update-not-available', () => {
  updateCheckInProgress = false;
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'LOCA PRO',
    message: 'Stai utilizzando l’ultima versione disponibile.'
  });
});

autoUpdater.on('download-progress', (progress) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setProgressBar(progress.percent / 100);
  }
});

autoUpdater.on('update-downloaded', async () => {
  updateCheckInProgress = false;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setProgressBar(-1);

  const result = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Aggiornamento pronto',
    message: "L'app verrà riavviata per installare l'aggiornamento.",
    buttons: ['Riavvia e installa', 'Più tardi'],
    defaultId: 0,
    cancelId: 1
  });

  if (result.response === 0) autoUpdater.quitAndInstall();
});

autoUpdater.on('error', (err) => {
  updateCheckInProgress = false;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setProgressBar(-1);
  dialog.showMessageBox(mainWindow, {
    type: 'error',
    title: 'Errore aggiornamento',
    message: 'Si è verificato un errore durante l’aggiornamento.',
    detail: err?.message || 'Errore sconosciuto.'
  });
});

app.setName('LOCA PRO');
app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
