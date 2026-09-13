import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { updateCheckout, dependencyFingerprint, installDependencies, runningApplication } from '../scripts/start.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const quiet = () => {};
function fixture(t, prepare = () => {}) {
  const directory = mkdtempSync(join(tmpdir(), 'fristen startup '));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const remote = join(directory, 'remote.git'), writer = join(directory, 'writer'), local = join(directory, 'local');
  git(directory, 'init', '--bare', '--initial-branch=main', remote);
  git(directory, 'clone', remote, writer);
  git(writer, 'config', 'user.name', 'Fristen Test');
  git(writer, 'config', 'user.email', 'fristen-test@example.invalid');
  git(writer, 'config', 'commit.gpgsign', 'false');
  writeFileSync(join(writer, 'entry.txt'), 'original');
  prepare(writer);
  const publish = () => { git(writer, 'add', '.'); git(writer, 'commit', '-m', 'Test update'); git(writer, 'push', 'origin', 'HEAD:main'); };
  publish();
  git(directory, 'clone', remote, local);
  return { directory, remote, writer, local, publish };
}

test('startup takes a fast-forward update and recognizes the current version', t => {
  const { writer, local, publish } = fixture(t);
  writeFileSync(join(writer, 'entry.txt'), 'updated'); publish();
  assert.equal(updateCheckout(local, quiet), 'updated');
  assert.equal(readFileSync(join(local, 'entry.txt'), 'utf8'), 'updated');
  assert.equal(updateCheckout(local, quiet), 'current');
});

test('startup preserves local edits and untracked files', t => {
  const { writer, local, publish } = fixture(t);
  writeFileSync(join(writer, 'entry.txt'), 'updated'); publish();
  writeFileSync(join(local, 'entry.txt'), 'local work');
  writeFileSync(join(local, 'notes.txt'), 'local notes');
  const before = git(local, 'rev-parse', 'HEAD');
  assert.equal(updateCheckout(local, quiet), 'skipped');
  assert.equal(readFileSync(join(local, 'entry.txt'), 'utf8'), 'local work');
  assert.equal(readFileSync(join(local, 'notes.txt'), 'utf8'), 'local notes');
  assert.equal(git(local, 'rev-parse', 'HEAD'), before);
});

test('startup leaves another development branch alone', t => {
  const { local } = fixture(t);
  git(local, 'checkout', '-b', 'experiment');
  assert.equal(updateCheckout(local, quiet), 'skipped');
  assert.equal(git(local, 'branch', '--show-current'), 'experiment');
});

test('diverging local commits are not reset or merged', t => {
  const { writer, local, publish } = fixture(t);
  writeFileSync(join(writer, 'entry.txt'), 'remote work'); publish();
  git(local, 'config', 'user.name', 'Fristen Test');
  git(local, 'config', 'user.email', 'fristen-test@example.invalid');
  writeFileSync(join(local, 'entry.txt'), 'committed local work');
  git(local, 'add', '.'); git(local, '-c', 'commit.gpgsign=false', 'commit', '-m', 'Local work');
  const before = git(local, 'rev-parse', 'HEAD');
  assert.equal(updateCheckout(local, quiet), 'unavailable');
  assert.equal(git(local, 'rev-parse', 'HEAD'), before);
  assert.equal(readFileSync(join(local, 'entry.txt'), 'utf8'), 'committed local work');
});

test('an unavailable remote leaves the installed checkout usable', t => {
  const { local, remote } = fixture(t);
  renameSync(remote, remote + '-offline');
  assert.equal(updateCheckout(local, quiet), 'unavailable');
  assert.equal(readFileSync(join(local, 'entry.txt'), 'utf8'), 'original');
});

test('npm installation works in a directory with spaces', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'fristen packages '));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const pkg = { name: 'fristen-startup-test', version: '1.0.0', scripts: { postinstall: 'node -e "require(\'node:fs\').writeFileSync(\'installed.txt\',\'ok\')"' } };
  writeFileSync(join(directory, 'package.json'), JSON.stringify(pkg));
  writeFileSync(join(directory, 'package-lock.json'), JSON.stringify({ name: pkg.name, version: pkg.version, lockfileVersion: 3, packages: { '': { name: pkg.name, version: pkg.version, hasInstallScript: true } } }));
  await installDependencies(directory);
  assert.equal(readFileSync(join(directory, 'installed.txt'), 'utf8'), 'ok');
});

test('the launcher recognizes Fristen without confusing another service with the app', async t => {
  let html = '<meta name="fristen-app" content="local">';
  const server = createServer((request, response) => response.end(html));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  assert.equal(await runningApplication(url), 'fristen');
  html = '<title>Fristen · ARNOLD RUESS</title>';
  assert.equal(await runningApplication(url), 'fristen');
  html = '<title>Another app</title>';
  assert.equal(await runningApplication(url), 'other');
  await new Promise(resolve => server.close(resolve));
  assert.equal(await runningApplication(url), 'none');
});

test('the launcher can update itself and start the fresh code with installed packages', async t => {
  // Give this isolated test installation a free address, so a developer can
  // also run the test while the real Fristen server is open on port 5173.
  const reservation = createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const testUrl = 'http://127.0.0.1:' + reservation.address().port + '/';
  await new Promise(resolve => reservation.close(resolve));
  const { writer, local, publish } = fixture(t, root => {
    mkdirSync(join(root, 'scripts'));
    writeFileSync(join(root, 'scripts', 'start.mjs'), readFileSync(new URL('../scripts/start.mjs', import.meta.url), 'utf8').replace("const APP_URL = 'http://127.0.0.1:5173/';", 'const APP_URL = ' + JSON.stringify(testUrl) + ';'));
    copyFileSync(new URL('../Start-Fristen.cmd', import.meta.url), join(root, 'Start-Fristen.cmd'));
    writeFileSync(join(root, '.gitignore'), 'node_modules/\nstarted.json\n');
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'fristen-launch-test', type: 'module' }));
    writeFileSync(join(root, 'package-lock.json'), '{}');
  });
  mkdirSync(join(local, 'node_modules', 'vite', 'bin'), { recursive: true });
  writeFileSync(join(local, 'node_modules', 'vite', 'bin', 'vite.js'), "require('node:fs').writeFileSync('started.json', JSON.stringify(process.argv.slice(2)))");
  writeFileSync(join(local, 'node_modules', '.fristen-dependencies'), dependencyFingerprint(local));
  writeFileSync(join(writer, 'scripts', 'start.mjs'), "console.log('Aktueller Starter geladen');\n" + readFileSync(join(writer, 'scripts', 'start.mjs'), 'utf8'));
  writeFileSync(join(writer, 'Start-Fristen.cmd'), '@rem Updated batch file\n' + readFileSync(join(writer, 'Start-Fristen.cmd'), 'utf8'));
  publish();
  const options = { cwd: local, encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] };
  const output = process.platform === 'win32'
    ? execFileSync('cmd.exe', ['/d', '/c', 'Start-Fristen.cmd'], options)
    : execFileSync(process.execPath, ['scripts/start.mjs'], options);
  assert.match(output, /Aktueller Starter geladen/);
  assert.ok(existsSync(join(local, 'started.json')));
  assert.deepEqual(JSON.parse(readFileSync(join(local, 'started.json'), 'utf8')), ['--host', '127.0.0.1', '--open']);
  assert.equal(git(local, 'status', '--porcelain'), '');
});
