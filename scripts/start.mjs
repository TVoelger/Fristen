import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { get } from 'node:http';

const APP_URL = 'http://127.0.0.1:5173/';

export function runningApplication(url = APP_URL) {
  return new Promise(resolvePromise => {
    const request = get(url, { agent: false }, response => {
      let html = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        html += chunk;
        if (html.length > 32768) { resolvePromise('other'); response.destroy(); }
      });
      response.on('end', () => {
        const identified = html.includes('name="fristen-app" content="local"') || /<title>\s*Fristen · ARNOLD RUESS\s*<\/title>/.test(html);
        resolvePromise(response.statusCode === 200 && identified ? 'fristen' : 'other');
      });
      response.on('error', () => resolvePromise('other'));
    });
    request.setTimeout(1500, () => { resolvePromise('other'); request.destroy(); });
    request.on('error', error => resolvePromise(error.code === 'ECONNREFUSED' ? 'none' : 'other'));
  });
}

async function openExistingApplication() {
  console.log('Fristen läuft bereits. Die vorhandene Anwendung wird im Browser geöffnet.');
  try {
    const child = process.platform === 'win32'
      ? spawn('cmd.exe', ['/d', '/s', '/c', 'start "" "http://127.0.0.1:5173/"'], { stdio: 'ignore', windowsHide: true })
      : spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [APP_URL], { stdio: 'ignore' });
    if (await waitFor(child) !== 0) console.log('Bitte im Browser öffnen: ' + APP_URL);
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    console.log('Bitte im Browser öffnen: ' + APP_URL);
  }
}

export function updateCheckout(directory, log = console.log) {
  const git = args => execFileSync('git', args, {
    cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 20000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  }).trim();
  try {
    if (git(['branch', '--show-current']) !== 'main') {
      log('Anderer Entwicklungszweig: Die vorhandene Version startet.');
      return 'skipped';
    }
    if (git(['status', '--porcelain', '--untracked-files=normal'])) {
      log('Lokale Dateiänderungen: Die Aktualisierung wird übersprungen.');
      return 'skipped';
    }
    const before = git(['rev-parse', 'HEAD']);
    log('Fristen sucht nach Aktualisierungen …');
    git(['fetch', '--no-tags', 'origin', 'main']);
    // A second check also protects changes made during the network request.
    if (git(['status', '--porcelain', '--untracked-files=normal'])) {
      log('Lokale Dateiänderungen: Die Aktualisierung wird übersprungen.');
      return 'skipped';
    }
    git(['merge', '--ff-only', '--no-edit', 'FETCH_HEAD']);
    const updated = before !== git(['rev-parse', 'HEAD']);
    log(updated ? 'Fristen wurde aktualisiert.' : 'Fristen ist aktuell.');
    return updated ? 'updated' : 'current';
  } catch {
    log('Automatische Aktualisierung nicht möglich. Die vorhandene Version startet.');
    return 'unavailable';
  }
}

export function dependencyFingerprint(directory) {
  const hash = createHash('sha256');
  for (const name of ['package.json', 'package-lock.json']) hash.update(readFileSync(join(directory, name)));
  return hash.digest('hex');
}

function waitFor(child) {
  return new Promise((resolvePromise, reject) => {
    let interrupted = false;
    const interrupt = () => { interrupted = true; child.kill('SIGINT'); };
    const terminate = () => { interrupted = true; child.kill('SIGTERM'); };
    process.on('SIGINT', interrupt); process.on('SIGTERM', terminate);
    const clean = () => { process.off('SIGINT', interrupt); process.off('SIGTERM', terminate); };
    child.once('error', error => { clean(); reject(error); });
    child.once('close', (code, signal) => {
      clean();
      if (interrupted || signal === 'SIGINT' || signal === 'SIGTERM') {
        reject(Object.assign(new Error('Start abgebrochen.'), { name: 'AbortError' }));
      } else resolvePromise(code ?? 1);
    });
  });
}

export async function installDependencies(directory) {
  // This constant command also runs npm.cmd on Windows. No input is inserted
  // into the shell command; the directory is passed separately to the process.
  const code = await waitFor(spawn('npm ci --no-audit --no-fund', {
    cwd: directory, stdio: 'inherit', shell: true,
  }));
  if (code !== 0) throw new Error('Die benötigten Pakete konnten nicht installiert werden.');
}

async function runApplication(directory) {
  const fingerprint = dependencyFingerprint(directory);
  const stamp = join(directory, 'node_modules', '.fristen-dependencies');
  const vite = join(directory, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!existsSync(vite) || !existsSync(stamp) || readFileSync(stamp, 'utf8') !== fingerprint) {
    console.log('Benötigte Pakete werden eingerichtet …');
    await installDependencies(directory);
    writeFileSync(stamp, fingerprint);
  }
  console.log('Fristen startet. Dieses Fenster während der Nutzung geöffnet lassen.');
  return waitFor(spawn(process.execPath, [vite, '--host', '127.0.0.1', '--open'], { cwd: directory, stdio: 'inherit' }));
}

const script = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === script) {
  const directory = resolve(dirname(script), '..');
  try {
    const running = await runningApplication();
    if (running === 'fristen') {
      await openExistingApplication();
    } else if (running === 'other') {
      throw new Error('Port 5173 wird von einem anderen oder nicht erkennbaren Dienst verwendet.');
    } else if (process.argv.includes('--run')) {
      process.exitCode = await runApplication(directory);
    } else {
      updateCheckout(directory);
      // Reload the launcher from disk after updating its own source files.
      process.exitCode = await waitFor(spawn(process.execPath, [script, '--run'], { cwd: directory, stdio: 'inherit' }));
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      process.exitCode = 0;
    } else {
      console.error('Fristen konnte nicht gestartet werden: ' + error.message);
      process.exitCode = 1;
    }
  }
}
