'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('equipoAPI', {
  guardar: (data) => ipcRenderer.invoke('guardar-equipo-info', data),
  cargar: () => ipcRenderer.invoke('cargar-equipo-info'),
  estaEnrolado: () => ipcRenderer.invoke('esta-enrolado'),
  listarAreas: (codigo) => ipcRenderer.invoke('listar-areas', codigo),
  listarTurnos: (codigo) => ipcRenderer.invoke('listar-turnos', codigo),
});
