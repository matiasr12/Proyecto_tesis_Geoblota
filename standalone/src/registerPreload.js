'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('equipoAPI', {
  guardar: (data) => ipcRenderer.invoke('guardar-equipo-info', data),
  cargar: () => ipcRenderer.invoke('cargar-equipo-info'),
});
