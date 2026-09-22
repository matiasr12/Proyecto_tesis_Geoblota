'use strict';

const GEOLOCATION_TIMEOUT_MS = 8000;

/**
 * Resuelve una ubicacion aproximada a partir de los puntos de acceso WiFi
 * visibles, usando la Google Geolocation API (la unica con cobertura real
 * evaluada para este proyecto -- Mozilla Location Service y Mylnikov no
 * tuvieron datos ni para redes residenciales de prueba).
 *
 * Sin API key configurada, sin puntos de acceso, o si la API no encuentra
 * match (o falla la consulta), devuelve null -- el resto del sistema ya
 * tolera lat/long ausentes, igual que ip o connectionType.
 * @returns {Promise<{latitud: number, longitud: number, precisionMetros: number}|null>}
 */
async function resolveLocation(accessPoints, apiKey) {
  if (!apiKey || !accessPoints || accessPoints.length === 0) return null;

  const wifiAccessPoints = accessPoints
    .filter((ap) => ap.bssid)
    .map((ap) => (ap.dBm == null ? { macAddress: ap.bssid } : { macAddress: ap.bssid, signalStrength: ap.dBm }));

  if (wifiAccessPoints.length === 0) return null;

  try {
    const response = await fetch(`https://www.googleapis.com/geolocation/v1/geolocate?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ considerIp: false, wifiAccessPoints }),
      signal: AbortSignal.timeout(GEOLOCATION_TIMEOUT_MS),
    });

    if (!response.ok) return null;

    const data = await response.json();
    return {
      latitud: data.location.lat,
      longitud: data.location.lng,
      precisionMetros: data.accuracy,
    };
  } catch {
    return null;
  }
}

module.exports = { resolveLocation };
