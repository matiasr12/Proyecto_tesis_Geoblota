'use strict';

const os = require('os');
const { execFile } = require('child_process');

const EXEC_TIMEOUT_MS = 5000;

function execFileAsync(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: EXEC_TIMEOUT_MS, windowsHide: true }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

async function getWindowsComputerName() {
  const stdout = await execFileAsync('powershell', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    'Get-CimInstance -ClassName Win32_ComputerSystem | Select-Object Name,Domain,PartOfDomain | ConvertTo-Json -Compress',
  ]);

  const info = JSON.parse(stdout);
  if (info.PartOfDomain) {
    return {
      computerName: `${info.Name}.${info.Domain}`,
      domain: info.Domain,
      partOfDomain: true,
      source: 'ad',
    };
  }

  return {
    computerName: info.Name || os.hostname(),
    domain: null,
    partOfDomain: false,
    source: 'hostname-fallback',
  };
}

async function getMacComputerName() {
  let localName;
  try {
    localName = (await execFileAsync('scutil', ['--get', 'ComputerName'])).trim();
  } catch {
    localName = os.hostname();
  }

  try {
    const stdout = await execFileAsync('/usr/sbin/dsconfigad', ['-show']);
    const domainMatch = stdout.match(/Active Directory Domain\s*=\s*(\S+)/i);
    if (domainMatch) {
      return {
        computerName: `${localName}.${domainMatch[1]}`,
        domain: domainMatch[1],
        partOfDomain: true,
        source: 'ad',
      };
    }
  } catch {
    // dsconfigad no disponible o el equipo no esta unido a AD: se usa el fallback.
  }

  return {
    computerName: localName,
    domain: null,
    partOfDomain: false,
    source: 'hostname-fallback',
  };
}

/**
 * Resuelve el nombre del equipo desde Active Directory / Azure AD.
 * Si el equipo no esta unido a un dominio o la consulta falla, cae a os.hostname().
 * @returns {Promise<{computerName: string, domain: string|null, partOfDomain: boolean, source: 'ad'|'hostname-fallback'}>}
 */
async function getComputerName() {
  try {
    if (process.platform === 'win32') {
      return await getWindowsComputerName();
    }
    if (process.platform === 'darwin') {
      return await getMacComputerName();
    }
  } catch {
    // Cualquier fallo en la consulta cae al fallback de abajo.
  }

  return {
    computerName: os.hostname(),
    domain: null,
    partOfDomain: false,
    source: 'hostname-fallback',
  };
}

module.exports = { getComputerName };
