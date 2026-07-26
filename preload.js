const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('locaProUpdates', {
  check: () => ipcRenderer.invoke('locapro:check-updates'),
  getVersion: () => ipcRenderer.invoke('locapro:get-version')
});

contextBridge.exposeInMainWorld('locaProDocuments', {
  chooseProgram: () => ipcRenderer.invoke('locapro:documents:choose-program'),
  generateAndOpen: (options) => ipcRenderer.invoke('locapro:documents:generate-and-open', options)
});
