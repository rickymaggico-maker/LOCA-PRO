const { app, BrowserWindow, shell, Menu, dialog, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const path = require('path');

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.allowPrerelease = false;

let mainWindow = null;
let updateCheckInProgress = false;
let manualUpdateCheck = false;
let updateDownloadInProgress = false;

function showUpdateDialog(options) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return dialog.showMessageBox(mainWindow, options);
  }
  return dialog.showMessageBox(options);
}

async function checkForUpdates(isManual = true) {
  if (updateCheckInProgress) {
    if (isManual) {
      await showUpdateDialog({
        type: 'info',
        title: 'LOCA PRO',
        message: 'Il controllo degli aggiornamenti è già in corso.'
      });
    }
    return false;
  }

  if (!app.isPackaged) {
    if (isManual) {
      await showUpdateDialog({
        type: 'info',
        title: 'LOCA PRO',
        message: 'Il controllo aggiornamenti è disponibile nell’app installata.',
        detail: 'In modalità sviluppo non viene contattato GitHub.'
      });
    }
    return false;
  }

  updateCheckInProgress = true;
  manualUpdateCheck = isManual;

  try {
    await autoUpdater.checkForUpdates();
    return true;
  } catch (err) {
    const errorWasNotHandled = updateCheckInProgress;
    updateCheckInProgress = false;
    if (errorWasNotHandled && isManual) {
      await showUpdateDialog({
        type: 'error',
        title: 'Errore aggiornamento',
        message: 'Impossibile controllare gli aggiornamenti.',
        detail: err?.message || 'Errore sconosciuto.'
      });
    } else if (errorWasNotHandled) {
      log.error('Controllo automatico aggiornamenti non riuscito:', err);
    }
    return false;
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
        { label: 'Controlla aggiornamenti', click: () => checkForUpdates(true) },
        { type: 'separator' },
        { role: 'quit', label: 'Esci' }
      ]
    }
  ]);
  Menu.setApplicationMenu(menu);
}

ipcMain.handle('locapro:check-updates', async () => {
  return checkForUpdates(true);
});

ipcMain.handle('locapro:get-version', () => app.getVersion());

autoUpdater.on('checking-for-update', () => {
  log.info('Controllo aggiornamenti in corso...');
});

autoUpdater.on('update-available', async (info) => {
  updateCheckInProgress = false;
  const version = info?.version ? ` ${info.version}` : '';
  const result = await showUpdateDialog({
    type: 'info',
    title: 'Aggiornamento disponibile',
    message: `È disponibile LOCA PRO${version}.`,
    detail: 'Vuoi scaricarla adesso?',
    buttons: ['Scarica', 'Annulla'],
    defaultId: 0,
    cancelId: 1
  });
  manualUpdateCheck = false;

  if (result.response === 0) {
    updateDownloadInProgress = true;
    try {
      await autoUpdater.downloadUpdate();
    } catch (err) {
      log.error('Download aggiornamento non riuscito:', err);
    }
  }
});

autoUpdater.on('update-not-available', () => {
  updateCheckInProgress = false;
  if (manualUpdateCheck) {
    showUpdateDialog({
      type: 'info',
      title: 'LOCA PRO',
      message: 'Stai utilizzando l’ultima versione disponibile.'
    });
  }
  manualUpdateCheck = false;
});

autoUpdater.on('download-progress', (progress) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setProgressBar(progress.percent / 100);
  }
});

autoUpdater.on('update-downloaded', async () => {
  updateCheckInProgress = false;
  updateDownloadInProgress = false;
  manualUpdateCheck = false;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setProgressBar(-1);

  const result = await showUpdateDialog({
    type: 'info',
    title: 'Aggiornamento pronto',
    message: 'L’aggiornamento è pronto per essere installato.',
    detail: 'Puoi installarlo subito oppure automaticamente alla chiusura di LOCA PRO.',
    buttons: ['Riavvia e installa', 'Installa alla chiusura'],
    defaultId: 0,
    cancelId: 1
  });

  if (result.response === 0) autoUpdater.quitAndInstall();
});

autoUpdater.on('error', (err) => {
  const shouldNotify = manualUpdateCheck || updateDownloadInProgress;
  updateCheckInProgress = false;
  manualUpdateCheck = false;
  updateDownloadInProgress = false;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setProgressBar(-1);
  if (shouldNotify) {
    showUpdateDialog({
      type: 'error',
      title: 'Errore aggiornamento',
      message: 'Si è verificato un errore durante l’aggiornamento.',
      detail: err?.message || 'Errore sconosciuto.'
    });
  } else {
    log.error('Aggiornamento automatico non riuscito:', err);
  }
});

app.setName('LOCA PRO');
app.whenReady().then(() => {
  createWindow();
  setTimeout(() => checkForUpdates(false), 8000);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
