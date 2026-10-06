; Script custom de NSIS, incluido automaticamente por electron-builder
; (convencion: build/installer.nsh) al generar el instalador/desinstalador.
;
; Antes de borrar los archivos de la instalacion, corre el propio
; ejecutable con --uninstall-cleanup para que Electron deshaga el
; autoarranque que el mismo registro (app.setLoginItemSettings), en vez de
; adivinar el nombre exacto de la entrada en el registro de Windows desde
; este script. El borrado de los datos locales (cola pendiente cifrada,
; equipo-info.json, clave de cifrado) lo hace electron-builder solo via
; "deleteAppDataOnUninstall" en package.json.
!macro customUnInstall
  IfFileExists "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 +2
    ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" uninstall-cleanup'
!macroend
