# Como ejecutar

Tres proyectos independientes: `daemon/` (recolecta y envia datos, sin interfaz),
`tray/` (icono de bandeja, sin ventana) y `backend/` (API en Azure que recibe y guarda
los registros). El daemon y el tray corren como procesos separados a proposito: un
servicio de Windows / LaunchDaemon de macOS no tiene acceso a la sesion grafica, asi
que no podria mostrar un icono aunque quisiera.

## 1. Modo desarrollo (probar en tu maquina, sin instalar nada de sistema)

### daemon

```bash
cd daemon
npm install
npm run generate-key          # copiar el resultado
cp .env.example .env          # completar SERVER_URL, JWT_TOKEN, DB_ENCRYPTION_KEY
npm start                     # corre en primer plano, Ctrl+C para parar
```

Para probar sin un backend real, en otra terminal:

```bash
cd daemon
npm run mock-server            # levanta un servidor local en http://localhost:4000
```

y en `.env` usar `SERVER_URL=http://localhost:4000`.

### tray

```bash
cd tray
npm install
npm start
```

Busca el icono en la bandeja del sistema (junto al reloj, puede estar en la flecha de
"iconos ocultos"). El menu se actualiza solo cada 15s leyendo lo que el daemon va
escribiendo. Si el daemon todavia no corrio ningun ciclo, el menu muestra "Esperando
primer registro...". El icono se pone rojo cuando el ultimo envio del daemon fallo
(sin internet); sigue recolectando igual, solo que encolado hasta reconectar.

La primera vez que corre (no existe `equipo-info.json` en `DAEMON_DATA_DIR`) se abre
sola una ventana para completar Faena, Area, Rut/Nombre/Apellido de la persona
responsable y Codigo de activo del equipo. El daemon manda esos datos una sola vez al
backend (no en cada ciclo de 15 min). Se puede volver a abrir esa ventana despues desde
el menu ("Registrar/editar equipo...") para corregir los datos.

## 1.b Build de demo para pendrive (instalador normal, con ventanas)

`standalone/` es una version alternativa que junta `tray` + `daemon` en una sola app
Electron (sin servicio de Windows separado), pensada para repartir en un pendrive a
alguien que solo quiere instalar y probar, sin tocar `.env` ni la terminal. No
reemplaza a `daemon`/`tray` (esos siguen siendo el diseño real para la empresa, con
servicio de Windows a nivel sistema); es un build aparte, self-contained.

```bash
cd standalone
npm install
cp src/secrets.example.js src/secrets.js   # completar SERVER_URL y JWT_TOKEN (nunca se commitea)
npm run build:win                          # genera standalone/dist/TesisInventario Setup <version>.exe
```

Ese `.exe` es un instalador NSIS normal (Siguiente > Instalar > Finalizar, elige
carpeta, crea acceso directo y entrada en "Agregar o quitar programas"). Al primer
inicio de sesion arranca solo (registrado via `app.setLoginItemSettings`, sin scripts
de autostart manuales) y abre la ventana de registro de equipo si es la primera vez.

La URL del backend y el token van fijos en `standalone/src/secrets.js` (nunca se
commitea, el repo es publico) y quedan compilados dentro del `.exe` — quien instala no
completa nada. Si cambia el backend o el `JWT_SECRET`, hay que actualizar
`secrets.js` y volver a generar el instalador.

## 2. Empaquetar el tray como ejecutable

```bash
cd tray
npm run build:win     # genera tray/dist/TesisTray <version>.exe (portable, ~100MB)
npm run build:mac     # en un Mac: genera tray/dist/mac/TesisTray.app
```

## 3. Instalar como servicio de sistema (arranque automatico)

Esto modifica el sistema (requiere administrador) y queda corriendo despues de cerrar
la sesion. Revisar bien el `.env` antes de instalar.

### Windows

```bash
cd daemon
# Consola/PowerShell como Administrador:
npm run service:install
```

Instala un Windows Service llamado `TesisDaemon` (LocalSystem, arranca con Windows,
reinicia solo). Un usuario normal no puede detenerlo desde services.msc sin permisos de
administrador (comportamiento por defecto de Windows para servicios). Para revertir:

```bash
npm run service:uninstall     # tambien como Administrador
```

Para que el icono de bandeja tambien arranque solo al iniciar sesion (esto no requiere
administrador, solo afecta tu usuario):

```bash
cd tray
npm run build:win             # si no lo hiciste todavia
npm run install-autostart
# para revertir: npm run uninstall-autostart
```

### macOS — NO PROBADO EN HARDWARE REAL

Los scripts estan escritos segun la documentacion de `launchd` pero nunca se corrieron
en un Mac. Verificar antes de usar en produccion.

```bash
cd daemon
sudo bash scripts/macos/install-launchdaemon.sh      # el daemon, como root
# revertir: sudo bash scripts/macos/uninstall-launchdaemon.sh

cd ../tray
npm run build:mac
bash scripts/macos/install-launchagent.sh             # el tray, sin sudo
# revertir: bash scripts/macos/uninstall-launchagent.sh
```

## Backend (Azure)

El codigo vive en `backend/`. Recibe `POST /api/device-records` con
`Authorization: Bearer <JWT_TOKEN>` y guarda los registros en Azure SQL Database.
Tambien recibe `POST /api/equipos/registro` (mismo token) con los datos de
Faena/Area/Persona/Equipo que manda el tray una sola vez, y arma/actualiza esas
tablas relacionadas (`Faenas`, `Areas`, `Personal`, `Equipos`).

```bash
cd backend
npm install
cp .env.example .env          # completar con los mismos datos que en Azure
npm start                     # corre en primer plano, Ctrl+C para parar
```

Antes de usarlo hay que crear la tabla una sola vez: correr `backend/schema.sql` desde
el "Editor de consultas" de Azure Portal (dentro del recurso de la base SQL) o desde
Azure Data Studio / SSMS.

En Azure App Service las variables (`DB_SERVER`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`,
`JWT_SECRET`) se cargan en **Configuracion > Variables de entorno**, no en un `.env`
(ese archivo es solo para correrlo en la maquina local). El `JWT_SECRET` del backend
tiene que ser el mismo valor que `JWT_TOKEN` en `daemon/.env`.

Deploy: GitHub + Deployment Center de Azure (build y despliegue automatico en cada
push a `main`).

## Variables de entorno (`daemon/.env`)

| Variable | Obligatoria | Descripcion |
|---|---|---|
| `SERVER_URL` | si | Base HTTPS del backend |
| `JWT_TOKEN` | si | Token para autenticar cada envio |
| `DB_ENCRYPTION_KEY` | si | Hex de 64 caracteres, generar con `npm run generate-key` |
| `SERVER_RECORDS_PATH` | no | Default `/api/device-records` |
| `EQUIPO_REGISTRO_PATH` | no | Default `/api/equipos/registro` |
| `COLLECT_INTERVAL_MS` | no | Default 900000 (15 min) |
| `DAEMON_DATA_DIR` | no | Donde vive el SQLite y `status.json`; default `%PROGRAMDATA%\TesisDaemon` (Windows) o `/Library/Application Support/TesisDaemon` (macOS) |

`.env` nunca se commitea. `tray/` lee `status.json` de la misma carpeta
(`DAEMON_DATA_DIR`), asi que si se cambia ese valor hay que exportarlo tambien para el
tray (mismo nombre de variable) antes de arrancarlo.
