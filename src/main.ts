import './ui/styles.css';
import layout from './ui/layout.html?raw';
import { createApp } from './ui/app.js';
import { createDemoData } from './data/demo.ts';
import { LocalRepository, STORAGE_KEY } from './data/storage.ts';

const mount = document.querySelector<HTMLDivElement>('#app')!;
try {
  const repository = new LocalRepository(localStorage);
  const data = repository.load(createDemoData);
  mount.innerHTML = layout;
  createApp(mount.querySelector('#fristen-app'), data, repository);
} catch (error) {
  mount.innerHTML = '<main style="max-width:640px;margin:48px auto;padding:24px;font:16px/1.6 system-ui"><h1>Arbeitsstand konnte nicht geladen werden</h1><p id="load-error"></p><p>Gespeicherte Daten wurden nicht überschrieben.</p><button id="export-data" type="button">Gespeicherte Daten sichern</button> <button id="retry" type="button">Erneut laden</button></main>';
  document.querySelector('#load-error')!.textContent = error instanceof Error ? error.message : String(error);
  document.querySelector('#retry')!.addEventListener('click', () => location.reload());
  document.querySelector('#export-data')!.addEventListener('click', () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = 'fristen-arbeitsstand.json'; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { document.querySelector('#load-error')!.textContent = 'Der Browser erlaubt gerade keinen Zugriff auf den gespeicherten Arbeitsstand.'; }
  });
}
