const { app, BrowserWindow, shell, Menu, dialog, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { spawn } = require('child_process');
const HTMLtoDOCX = require('html-to-docx');
const JSZip = require('jszip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const { createBillsDocument } = require('./word-documents');

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.allowPrerelease = false;

let mainWindow = null;
let updateCheckInProgress = false;
let manualUpdateCheck = false;
let updateDownloadInProgress = false;

function safeDocumentName(value) {
  const cleaned = String(value || 'documento_loca_pro')
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return cleaned || 'documento_loca_pro';
}

function documentTimestamp() {
  const d = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return [
    d.getFullYear(),
    pad(d.getMonth() + 1),
    pad(d.getDate()),
    '-',
    pad(d.getHours()),
    pad(d.getMinutes()),
    pad(d.getSeconds())
  ].join('');
}

async function ensurePrintFolder() {
  const folder = path.join(app.getPath('documents'), 'LOCA PRO', 'Stampe');
  await fsp.mkdir(folder, { recursive: true });
  return folder;
}

async function openGeneratedDocument(filePath, programPath = '') {
  const selectedProgram = String(programPath || '').trim();

  if (selectedProgram) {
    if (!selectedProgram.toLowerCase().endsWith('.exe') || !fs.existsSync(selectedProgram)) {
      throw new Error('Il programma selezionato non è più disponibile. Scegline uno nuovo nelle Impostazioni.');
    }

    await new Promise((resolve, reject) => {
      const child = spawn(selectedProgram, [filePath], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false
      });
      child.once('spawn', () => {
        child.unref();
        resolve();
      });
      child.once('error', reject);
    });
    return;
  }

  const openError = await shell.openPath(filePath);
  if (openError) throw new Error(openError);
}

async function htmlToPdf(html, outputPath) {
  const tempHtmlPath = path.join(
    app.getPath('temp'),
    `loca-pro-print-${process.pid}-${Date.now()}.html`
  );
  let printWindow = null;

  try {
    await fsp.writeFile(tempHtmlPath, html, 'utf8');
    printWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    await printWindow.loadFile(tempHtmlPath);
    const pdf = await printWindow.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true
    });
    await fsp.writeFile(outputPath, pdf);
  } finally {
    if (printWindow && !printWindow.isDestroyed()) printWindow.destroy();
    await fsp.unlink(tempHtmlPath).catch(() => {});
  }
}

function mmToTwip(value) {
  return Math.round(Number(value) * 1440 / 25.4);
}

function sanitizeHtmlForDocx(html) {
  return String(html || '')
    .replace(/\swidth=(["'])[^"']*%\1/gi, '')
    .replace(/(?<![-\w])width\s*:\s*\d+(?:\.\d+)?%\s*(?:!important)?\s*;?/gi, '');
}

const WORD_XML_NAMESPACE = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function directWordChildren(element, localName) {
  return Array.from(element?.childNodes || []).filter(node => (
    node.nodeType === 1 &&
    (node.localName === localName || node.nodeName === `w:${localName}`)
  ));
}

function firstDirectWordChild(element, localName) {
  return directWordChildren(element, localName)[0] || null;
}

function wordAttribute(element, name) {
  if (!element) return '';
  return element.getAttributeNS(WORD_XML_NAMESPACE, name) ||
    element.getAttribute(`w:${name}`) ||
    element.getAttribute(name) ||
    '';
}

function setWordAttribute(element, name, value) {
  element.setAttributeNS(WORD_XML_NAMESPACE, `w:${name}`, String(value));
}

function createWordElement(document, localName) {
  return document.createElementNS(WORD_XML_NAMESPACE, `w:${localName}`);
}

function ensureDirectWordChild(document, parent, localName, beforeNode = null) {
  const existing = firstDirectWordChild(parent, localName);
  if (existing) return existing;
  const created = createWordElement(document, localName);
  if (beforeNode) parent.insertBefore(created, beforeNode);
  else parent.appendChild(created);
  return created;
}

function tableCellWidth(cell) {
  const properties = firstDirectWordChild(cell, 'tcPr');
  const width = firstDirectWordChild(properties, 'tcW');
  const value = Number(wordAttribute(width, 'w'));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function tableCellSpan(cell) {
  const properties = firstDirectWordChild(cell, 'tcPr');
  const span = firstDirectWordChild(properties, 'gridSpan');
  const value = Number(wordAttribute(span, 'val'));
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 1;
}

function setTableCellWidth(document, cell, width) {
  const properties = ensureDirectWordChild(document, cell, 'tcPr', cell.firstChild);
  const widthNode = ensureDirectWordChild(document, properties, 'tcW', properties.firstChild);
  setWordAttribute(widthNode, 'w', Math.max(1, Math.round(width)));
  setWordAttribute(widthNode, 'type', 'dxa');
}

function setParagraphAlignment(document, paragraph, alignment) {
  const properties = ensureDirectWordChild(document, paragraph, 'pPr', paragraph.firstChild);
  const justification = ensureDirectWordChild(document, properties, 'jc', properties.firstChild);
  setWordAttribute(justification, 'val', alignment);
}

function normalizedColumnWidths(firstRowCells, tableWidth) {
  const rawWidths = firstRowCells.map(tableCellWidth);
  const total = rawWidths.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    const equalWidth = Math.floor(tableWidth / Math.max(1, firstRowCells.length));
    return firstRowCells.map((_cell, index) => (
      index === firstRowCells.length - 1
        ? tableWidth - (equalWidth * (firstRowCells.length - 1))
        : equalWidth
    ));
  }

  let consumed = 0;
  return rawWidths.map((value, index) => {
    if (index === rawWidths.length - 1) return tableWidth - consumed;
    const width = Math.max(1, Math.round(tableWidth * value / total));
    consumed += width;
    return width;
  });
}

function tableContainsText(table, values) {
  const text = String(table?.textContent || '').replace(/\s+/g, ' ').toUpperCase();
  return values.every(value => text.includes(value));
}

function replaceTableGrid(document, table, columnWidths) {
  directWordChildren(table, 'tblGrid').forEach(grid => table.removeChild(grid));
  const grid = createWordElement(document, 'tblGrid');
  columnWidths.forEach(width => {
    const column = createWordElement(document, 'gridCol');
    setWordAttribute(column, 'w', Math.max(1, Math.round(width)));
    grid.appendChild(column);
  });

  const properties = firstDirectWordChild(table, 'tblPr');
  const firstRow = firstDirectWordChild(table, 'tr');
  table.insertBefore(grid, firstRow || properties?.nextSibling || null);
}

function applyTableGeometry(document, table, usableWidth) {
  const isFinancialTable = tableContainsText(table, ['DESCRIZIONE', 'IMPORTO', 'TOTALE DA PAGARE']);
  if (!isFinancialTable) return;

  const properties = ensureDirectWordChild(document, table, 'tblPr', table.firstChild);
  const tableWidthNode = ensureDirectWordChild(document, properties, 'tblW', properties.firstChild);
  const tableWidth = usableWidth;
  setWordAttribute(tableWidthNode, 'w', Math.round(tableWidth));
  setWordAttribute(tableWidthNode, 'type', 'dxa');

  const justification = ensureDirectWordChild(document, properties, 'jc');
  setWordAttribute(justification, 'val', 'left');

  const rows = directWordChildren(table, 'tr');
  const firstCells = rows.length ? directWordChildren(rows[0], 'tc') : [];
  if (!firstCells.length) return;

  let columnWidths = normalizedColumnWidths(firstCells, tableWidth);
  if (columnWidths.length === 2) {
    const descriptionWidth = Math.round(tableWidth * 0.74);
    columnWidths = [descriptionWidth, tableWidth - descriptionWidth];
  }

  replaceTableGrid(document, table, columnWidths);

  rows.forEach(row => {
    const cells = directWordChildren(row, 'tc');
    let columnIndex = 0;
    cells.forEach(cell => {
      const span = Math.min(tableCellSpan(cell), columnWidths.length - columnIndex);
      const cellWidth = columnWidths
        .slice(columnIndex, columnIndex + Math.max(1, span))
        .reduce((sum, width) => sum + width, 0);
      setTableCellWidth(document, cell, cellWidth || tableWidth);
      columnIndex += Math.max(1, span);
    });

    if (isFinancialTable && cells[1]) {
      Array.from(cells[1].getElementsByTagName('w:p')).forEach(paragraph => {
        setParagraphAlignment(document, paragraph, 'right');
      });
    }
  });
}

async function enforceWordTableGeometry(documentBuffer, usableWidth) {
  const zip = await JSZip.loadAsync(documentBuffer);
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) return Buffer.from(documentBuffer);

  const xml = await documentFile.async('string');
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  const parserErrors = document.getElementsByTagName('parsererror');
  if (parserErrors.length) return Buffer.from(documentBuffer);

  Array.from(document.getElementsByTagName('w:tbl')).forEach(table => {
    applyTableGeometry(document, table, usableWidth);
  });

  zip.file('word/document.xml', new XMLSerializer().serializeToString(document));
  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
}

async function htmlToWord(html, outputPath, settings = {}, wordData = null) {
  if (wordData?.type === 'bollette') {
    const documentBuffer = await createBillsDocument(wordData, settings);
    await fsp.writeFile(outputPath, documentBuffer);
    return;
  }

  const marginMm = Math.min(30, Math.max(8, Number(settings.margins) || 14));
  const fontSizePt = Math.min(14, Math.max(8, Number(settings.size) || 10));
  const font = String(settings.font || 'Arial').replace(/["']/g, '').trim() || 'Arial';
  const margin = mmToTwip(marginMm);

  const documentBuffer = await HTMLtoDOCX(sanitizeHtmlForDocx(html), null, {
    orientation: 'portrait',
    pageSize: {
      width: 11906,
      height: 16838
    },
    margins: {
      top: margin,
      right: margin,
      bottom: margin,
      left: margin,
      header: mmToTwip(6),
      footer: mmToTwip(6),
      gutter: 0
    },
    font,
    fontSize: Math.round(fontSizePt * 2),
    complexScriptFontSize: Math.round(fontSizePt * 2),
    table: {
      row: {
        cantSplit: true
      }
    },
    title: 'Documento LOCA PRO',
    subject: 'Documento gestionale LOCA PRO',
    creator: 'LOCA PRO',
    lastModifiedBy: 'LOCA PRO',
    lang: 'it-IT'
  });

  const usableWidth = 11906 - (margin * 2);
  const alignedDocumentBuffer = await enforceWordTableGeometry(documentBuffer, usableWidth);
  await fsp.writeFile(outputPath, alignedDocumentBuffer);
}

async function generateAndOpenDocument(payload = {}) {
  const format = payload.format === 'word' ? 'word' : payload.format === 'pdf' ? 'pdf' : '';
  const html = typeof payload.html === 'string' ? payload.html : '';

  if (!format) throw new Error('Formato documento non valido.');
  if (!html.trim()) throw new Error('Il documento è vuoto.');

  const folder = await ensurePrintFolder();
  const baseName = `${safeDocumentName(payload.filename)}_${documentTimestamp()}`;
  const outputPath = path.join(folder, `${baseName}.${format === 'pdf' ? 'pdf' : 'docx'}`);

  if (format === 'pdf') {
    await htmlToPdf(html, outputPath);
  } else {
    await htmlToWord(html, outputPath, payload.settings, payload.wordData);
  }

  await openGeneratedDocument(outputPath, payload.programPath);
  return { ok: true, path: outputPath };
}

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

ipcMain.handle('locapro:documents:choose-program', async () => {
  const options = {
    title: 'Scegli il programma per aprire le stampe',
    properties: ['openFile'],
    filters: [
      { name: 'Programmi Windows', extensions: ['exe'] },
      { name: 'Tutti i file', extensions: ['*'] }
    ]
  };
  const result = mainWindow && !mainWindow.isDestroyed()
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);

  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  const selectedPath = result.filePaths[0];
  return {
    canceled: false,
    path: selectedPath,
    name: path.basename(selectedPath, path.extname(selectedPath))
  };
});

ipcMain.handle('locapro:documents:generate-and-open', async (_event, payload) => {
  try {
    return await generateAndOpenDocument(payload);
  } catch (err) {
    log.error('Creazione documento non riuscita:', err);
    return {
      ok: false,
      error: err?.message || 'Non è stato possibile creare o aprire il documento.'
    };
  }
});

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
