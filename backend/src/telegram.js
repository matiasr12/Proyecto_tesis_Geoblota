'use strict';

// Aviso por Telegram cuando se abre una alerta de geocerca. Las credenciales
// llegan por config (variables de entorno del App Service); si faltan, el
// backend sigue igual y solo se advierte una vez.

const PANEL_ALERTAS_URL = 'https://geoflota-panel-euaqcvgyhdetf8eh.brazilsouth-01.azurewebsites.net/alerts';
const TIMEOUT_MS = 10 * 1000;
// Mismo equipo abriendo varias alertas seguidas (entra y sale del borde del
// poligono): solo se avisa la primera de cada ventana.
const VENTANA_ANTISPAM_MS = 5 * 60 * 1000;

const ultimoAvisoPorEquipo = new Map();
let advertido = false;

function escaparHtml(valor) {
  return String(valor ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** dd-mm-aaaa HH:mm en hora de Chile. */
function formatearFecha(fecha) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('es-CL', {
      timeZone: 'America/Santiago',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(fecha).map((p) => [p.type, p.value])
  );
  return `${partes.day}-${partes.month}-${partes.year} ${partes.hour}:${partes.minute}`;
}

function armarMensaje({ computerName, nombre, apellido, areaAsignada, areaDetectada, fechaInicio }) {
  const persona = [nombre, apellido].filter(Boolean).join(' ').trim() || 'Sin asignar';
  const fueraDe = [areaAsignada || 'Sin área', areaDetectada].filter(Boolean).join(' / ');
  return [
    '🚨 <b>Alerta GeoFlota</b>',
    `💻 <b>${escaparHtml(computerName)}</b>`,
    `👤 ${escaparHtml(persona)}`,
    `📍 Fuera de: ${escaparHtml(fueraDe)}`,
    `🕐 ${formatearFecha(fechaInicio)}`,
    `🔗 <a href="${PANEL_ALERTAS_URL}">Ver en el panel</a>`,
  ].join('\n');
}

/**
 * Manda el aviso de una alerta recien abierta. No lanza errores: si Telegram
 * falla solo se loguea (sin la URL, que lleva el token).
 */
async function notificarAlertaAbierta(datos, config) {
  if (!config.telegramBotToken || !config.telegramChatId) {
    if (!advertido) {
      console.warn('[telegram] falta TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID: no se envian avisos de alertas');
      advertido = true;
    }
    return;
  }

  const ahora = Date.now();
  const ultimo = ultimoAvisoPorEquipo.get(datos.equipoId);
  if (ultimo && ahora - ultimo < VENTANA_ANTISPAM_MS) return;
  ultimoAvisoPorEquipo.set(datos.equipoId, ahora);

  try {
    const response = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.telegramChatId,
        text: armarMensaje(datos),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      // La descripcion de Telegram no incluye el token.
      const { description } = await response.json().catch(() => ({}));
      console.error(`[telegram] no se pudo enviar el aviso: ${response.status} ${description || ''}`.trim());
    }
  } catch (err) {
    // err.message de fetch/timeout no trae la URL; igual se usa solo el nombre.
    console.error(`[telegram] no se pudo enviar el aviso: ${err.name}`);
  }
}

module.exports = { notificarAlertaAbierta, armarMensaje, escaparHtml };
