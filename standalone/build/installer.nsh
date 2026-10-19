; Script custom de NSIS, incluido automaticamente por electron-builder
; (convencion: build/installer.nsh) al generar el instalador/desinstalador.
;
; Quita el autoarranque que la app registra con app.setLoginItemSettings.
; Se borra la entrada del registro directamente porque electron-builder corre
; customUnInstall DESPUES de borrar los archivos: ya no se puede ejecutar la
; app para que lo deshaga ella misma. Electron nombra la entrada
; "electron.app.<productName>". StartupApproved guarda si el usuario la
; habilito/deshabilito desde el Administrador de tareas.
; El borrado de los datos locales (cola pendiente cifrada, equipo-info.json,
; clave de cifrado) lo hace electron-builder solo via
; "deleteAppDataOnUninstall" en package.json.
!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "electron.app.${PRODUCT_NAME}"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "electron.app.${PRODUCT_NAME}"
!macroend
