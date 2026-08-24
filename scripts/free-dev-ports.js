#!/usr/bin/env node
/**
 * `predev` (uruchamiane automatycznie przed `npm run dev`) — zwalnia porty
 * API (3000) i WEB (5173), zanim `concurrently` odpali oba serwery.
 *
 * PRZYCZYNA: na Windows zamknięcie terminala / Ctrl+C nie zawsze zabija
 * cały łańcuch procesów `npm.cmd → node.exe` (nest/vite), bo konsola nie
 * przekazuje niezawodnie sygnału do wnuków procesu. Osierocony proces
 * (`node ... vite.js` albo `node ... nest.js`) zostaje żywy i nadal trzyma
 * port. Przy KOLEJNYM `npm run dev` nowy Vite po cichu przechodzi na 5174
 * (Vite domyślnie nie traktuje zajętego portu jako błąd — tylko szuka
 * kolejnego wolnego), więc `http://localhost:5173/` wygląda jak "nie
 * działa", choć w rzeczywistości działa gdzie indziej. Ten skrypt usuwa
 * problem u źródła: przed startem sprząta wszystko, co nadal siedzi na
 * portach, których zaraz potrzebujemy.
 *
 * Czysty Node.js (`child_process`), bez zewnętrznych zależności — działa
 * identycznie z `postinstall`/`setup-env.js`. Celowo NIGDY nie rzuca: brak
 * `netstat`/`lsof` albo brak uprawnień do zabicia procesu nie może
 * zablokować `npm run dev` — w najgorszym razie port zostaje zajęty i Vite/
 * Nest zgłoszą to same (Nest głośno, Vite cicho przez `strictPort` w
 * `vite.config.ts`).
 */
const { execSync } = require('child_process');
const os = require('os');

const PORTS = [3000, 5173];

function freePortWindows(port) {
  let output;
  try {
    output = execSync(`netstat -ano -p tcp`, { encoding: 'utf8' });
  } catch {
    return;
  }
  const pids = new Set();
  for (const line of output.split('\n')) {
    const parts = line.trim().split(/\s+/);
    // `TCP  0.0.0.0:3000  0.0.0.0:0  LISTENING  12345`
    if (parts.length < 5) continue;
    const [, localAddr, , state, pid] = parts;
    if (state !== 'LISTENING' || !localAddr.endsWith(`:${port}`)) continue;
    if (pid && pid !== '0') pids.add(pid);
  }
  for (const pid of pids) {
    try {
      // `/T` — zabija całe drzewo procesów potomnych, nie tylko sam PID.
      execSync(`taskkill /PID ${pid} /F /T`, { stdio: 'ignore' });
      console.log(`[free-dev-ports] Zwolniono port ${port} (zatrzymano osierocony proces PID ${pid}).`);
    } catch {
      // Proces mógł już zniknąć między odczytem netstat a taskkill — nic do zrobienia.
    }
  }
}

function freePortPosix(port) {
  let output;
  try {
    output = execSync(`lsof -ti tcp:${port}`, { encoding: 'utf8' }).trim();
  } catch {
    return;
  }
  if (!output) return;
  for (const pid of output.split('\n')) {
    try {
      execSync(`kill -9 ${pid.trim()}`, { stdio: 'ignore' });
      console.log(`[free-dev-ports] Zwolniono port ${port} (zatrzymano osierocony proces PID ${pid.trim()}).`);
    } catch {
      // jw.
    }
  }
}

const freePort = os.platform() === 'win32' ? freePortWindows : freePortPosix;

for (const port of PORTS) {
  try {
    freePort(port);
  } catch {
    // Defensywnie — ten skrypt nigdy nie ma zablokować `npm run dev`.
  }
}
