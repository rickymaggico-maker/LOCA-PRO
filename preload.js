const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('locaProUpdates', {
  check: () => ipcRenderer.invoke('locapro:check-updates')
});
