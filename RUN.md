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
cp src/secrets.example.js src/secrets.js   # completar SERVER_URL (nunca se commitea; sin credenciales)
npm run build:win                          # genera standalone/dist/TesisInventario Setup <version>.exe
```

Ese `.exe` es un instalador NSIS normal (Siguiente > Instalar > Finalizar, elige
carpeta, crea acceso directo y entrada en "Agregar o quitar programas"). Al primer
inicio de sesion arranca solo (registrado via `app.setLoginItemSettings`, sin scripts
de autostart manuales) y abre la ventana de registro de equipo si es la primera vez.

La URL del backend va fija en `standalone/src/secrets.js` (nunca se commitea, el repo
es publico) y queda dentro del `.exe`. **El instalador no lleva ninguna credencial**:
la primera vez que se conecta, la app pide sola al backend su **token propio**
(`POST /api/equipos/enrolar`, sin codigo ni nada que escribir) y lo guarda cifrado con
DPAPI (`userData/device-token.bin`). Ese token solo sirve para enviar las lecturas y el
registro de ese mismo equipo; no permite leer la flota. Sin internet, la app junta
lecturas en la cola (icono rojo) y se enrola al volver la conexion. Una instalacion
anterior (sin token) se enrola sola igual. `GOOGLE_GEOLOCATION_API_KEY` es
opcional: la ubicacion se pide primero al servicio de ubicacion de Windows y la API de
Google solo se usa como respaldo si hay key.

En la ventana de registro, Faena y Area son menus desplegables que se llenan con
`GET /api/areas` cada vez que se abre la ventana (y al volver a ella), asi que un area
nueva cargada en la base aparece sin reinstalar. Las dos listas son independientes:
el desplegable de Area muestra siempre todas las areas. Sin conexion al backend los
menus quedan vacios y la ventana muestra un aviso.

Cada 10 s la app pregunta a Windows si hay red, y cada 60 s pregunta al backend si
responde (`/api/salud`): si falla cualquiera, el icono pasa a rojo. La app es de
instancia unica (abrirla dos veces no duplica envios) y espera hasta 30 s la
respuesta de cada envio. Sin internet, las lecturas se guardan en la cola cifrada. Mientras
tanto la app reintenta mandar la cola cada 30 s; apenas vuelve la conexion la envia,
manda una lectura nueva y el icono vuelve a azul (no espera el ciclo de 15 min ni hay
que reiniciar la app). Para que la ventana abra rapido, la
primera recoleccion (PowerShell/netsh) arranca recien cuando la ventana ya esta en
pantalla.

Al desinstalar, el desinstalador borra la entrada de inicio de Windows
(`electron.app.TesisInventario` en `HKCU\...\Run` y en `StartupApproved\Run`) y
los datos locales (cola cifrada, `equipo-info.json`, clave). Ver
`standalone/build/installer.nsh`.

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

El codigo vive en `backend/`. Hay dos credenciales distintas:

| Credencial | Quien la usa | Rutas |
|---|---|---|
| `JWT_SECRET` (Bearer) | Panel web (`DAEMON_API_TOKEN` del panel) | `GET /api/equipos` (lectura de toda la flota). Rechazada en las rutas de equipos (403). |
| Token propio del equipo (Bearer `<nombre base64url>.<HMAC-SHA256 con DEVICE_SECRET>`) | App de escritorio, tras enrolarse | `POST /api/device-records` y `POST /api/equipos/registro` **solo con su propio `computerName`** (otro nombre: 403). No lee la flota (401). |

`POST /api/equipos/enrolar` es publica: recibe `{ computerName }` y devuelve el token de
ese nombre. `GET /api/areas` y `/api/turnos` aceptan el panel o un token de equipo.
`GET /api/salud` es publica (no devuelve datos). Sin `DEVICE_SECRET`
configurado, las rutas de equipos y el enrolamiento responden 503
(falla cerrado) y el panel sigue funcionando. Pruebas de regresion: `cd backend && npm test`
(base simulada, sin Azure).

Recibe `POST /api/device-records` y guarda los registros en Azure SQL Database.
Tambien recibe `POST /api/equipos/registro` con los datos de
Faena/Area/Persona/Equipo que manda el tray una sola vez, y arma/actualiza esas
tablas relacionadas (`Faenas`, `Areas`, `Personal`, `Equipos`). El area se busca por
nombre en cualquier faena (solo se crea si no existe en ninguna), asi no se duplican
areas cuando la persona elige una faena y un area de otra faena.

Rutas de lectura:

- `GET /api/equipos`: un renglon por equipo con su persona/area/faena, ultima
  ubicacion y `alerta` si esa ubicacion cae fuera del poligono del area asignada.
  La ubicacion es el promedio de los routers de `dbo.BssidsArea` que ve la lectura
  (con coordenadas); si no ve ninguno, la que mando el PC (Windows).
- `GET /api/areas`: lista `{ faena, area }` para los desplegables del registro.
- `GET /api/health`: hace `SELECT 1` en la base y responde `{ ok: true, dbMs }` o 503.
  Despierta la base: no usarla como Health check de Azure (usar `/api/salud`).
- `GET /api/salud`: responde `{ ok: true }` sin tocar la base; la app lo consulta cada
  minuto para saber si el backend esta vivo.

`POST /api/device-records` ignora una lectura que ya existe (mismo equipo y misma
hora de lectura): asi un reintento de la app no la duplica.

### Areas y poligonos (Google Earth)

`dbo.Areas.Poligono` (tipo `geography`) guarda el limite de cada area, y
`dbo.BssidsArea` asocia cada router (BSSID) a un area, con su latitud/longitud
opcional. Para cargar un poligono dibujado en Google Earth: clic derecho sobre el
poligono > "Guardar lugar como..." > KML, copiar el contenido de `<coordinates>` y
armar el `UPDATE dbo.Areas SET Poligono = geography::STGeomFromText('POLYGON((lon lat,
...))', 4326).MakeValid() WHERE Nombre = N'...'`. Ojo: en WKT va longitud primero, el
primer punto se repite al final, y el contorno debe ir en sentido antihorario (si
`Poligono.STArea()` da un numero del tamaño de la Tierra, esta invertido: usar
`.ReorientObject()`). La pestaña "Ver" de Google Earth es la posicion de la camara, no
el perimetro.

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
`JWT_SECRET`, `DEVICE_SECRET` de 32+ caracteres y, opcionales, `TELEGRAM_BOT_TOKEN` y
`TELEGRAM_CHAT_ID` para avisar por Telegram cada alerta que se abre) se cargan
en **Configuracion > Variables de entorno**, no en un `.env` (ese archivo es solo para
correrlo en la maquina local). El `JWT_SECRET` debe ser el mismo valor que
`DAEMON_API_TOKEN` del panel web. Cambiar `DEVICE_SECRET` invalida todos los tokens
de equipo (las apps se vuelven a enrolar solas solo si se borra `device-token.bin`). El modo servicio (`daemon/`) todavia usa el
secreto compartido y no funciona con estas rutas hasta adaptarlo.

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
