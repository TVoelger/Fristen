import { test as base, expect } from '@playwright/test';

const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.setFixedTime(new Date('2026-09-14T07:30:00Z'));
    await use(page);
    expect(errors).toEqual([]);
  },
});
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('fristen.workspace.v1')));
async function scope(page, id) { await page.locator('#ff-scope > summary').click(); await page.locator(`[data-scope="${id}"]`).click(); }
async function user(page, id) { await page.locator('#ff-profile > summary').click(); await page.locator(`[data-user="${id}"]`).click(); }
test.beforeEach(async ({ page }) => { await page.goto('/'); await expect(page.getByRole('heading', { name: 'Meine Fristen', exact: true })).toBeVisible(); });

test('project rename is saved and the disclosure remains independently operable', async ({ page }) => {
  await page.locator('[data-project-open="meridian"]').click();
  await page.getByLabel('Projektname', { exact: true }).fill('Meridian · Neuer Name');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.locator('[data-project-open="meridian"]')).toHaveText('Meridian · Neuer Name');
  await page.reload();
  await expect(page.locator('[data-project-open="meridian"]')).toHaveText('Meridian · Neuer Name');
  const group = page.locator('[data-project-id="meridian"]');
  await group.locator('.ff-tree-chevron').click();
  await expect(group).not.toHaveAttribute('open', '');
});

test('deleting only a project retains every deadline and its assignments', async ({ page }) => {
  const before = await stored(page);
  await page.locator('[data-project-open="meridian"]').click();
  await page.getByRole('button', { name: 'Projekt löschen', exact: true }).click();
  await expect(page.getByLabel('Fristen behalten')).toBeChecked();
  await page.getByRole('button', { name: 'Projekt löschen', exact: true }).click();
  const after = await stored(page);
  expect(after.projects.meridian).toBeUndefined();
  expect(after.items).toHaveLength(before.items.length);
  for (const d of after.items.filter(d => ['f1', 'f2', 'f3', 'f7', 'f8'].includes(d.id))) {
    expect(d.project).toBeNull();
    expect(d.partners).toEqual(d.id === 'f7' ? ['mara'] : ['felix']);
  }
  await page.reload();
  await scope(page, 'all');
  await expect(page.locator('.ff-row[data-open]')).toHaveCount(9);
});

test('cascade deletion includes hidden open deadlines and requires the extra confirmation', async ({ page }) => {
  await expect(page.locator('.ff-row[data-open="f1"]')).toHaveCount(0);
  await page.locator('[data-project-open="meridian"]').click();
  await page.getByRole('button', { name: 'Projekt löschen', exact: true }).click();
  await expect(page.getByText('5 Fristen, davon 5 offen.', { exact: false })).toBeVisible();
  await page.getByLabel('Alle Fristen mitlöschen').check();
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Offene Fristen mitlöschen?' })).toBeVisible();
  await expect(page.getByText('Berufungsbegründung', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Projekt und Fristen löschen', exact: true }).click();
  expect((await stored(page)).projects.meridian).toBeDefined();
  await page.getByLabel('Auch die noch offenen Fristen löschen').check();
  await page.getByRole('button', { name: 'Projekt und Fristen löschen', exact: true }).click();
  expect((await stored(page)).items.map(d => d.id)).toEqual(['f4', 'f5', 'f6', 'f9']);
});

test('cancelling the extra warning leaves project and deadlines unchanged', async ({ page }) => {
  const before = await stored(page);
  await page.locator('[data-project-open="meridian"]').click();
  await page.getByRole('button', { name: 'Projekt löschen', exact: true }).click();
  await page.getByLabel('Alle Fristen mitlöschen').check();
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await page.getByLabel('Fristen behalten').check();
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  expect(await stored(page)).toEqual(before);
});

test('individual subscriptions persist without granting a lawyer editing rights', async ({ page }) => {
  await user(page, 'jonas');
  await scope(page, 'all');
  await page.locator('[data-subscribe="f5"]').click();
  await scope(page, 'mine');
  const row = page.locator('.ff-row-shell').filter({ has: page.locator('.ff-row[data-open="f5"]') });
  await expect(row).toHaveAttribute('data-subscription-only', 'true');
  await expect(row.getByText('abonniert', { exact: true })).toBeVisible();
  await page.reload();
  await page.locator('.ff-row[data-open="f5"]').click();
  await expect(page.locator('[data-edit="assign"]')).toHaveCount(0);
  await expect(page.locator('[data-edit="complete"]')).toHaveCount(0);
  await page.getByRole('dialog').locator('[data-subscribe="f5"]').click();
  await page.getByRole('button', { name: 'Fenster schließen', exact: true }).click();
  await expect(page.locator('.ff-row[data-open="f5"]')).toHaveCount(0);
});

test('partner overview includes inherited responsibility and respects overrides', async ({ page }) => {
  await user(page, 'felix');
  await expect(page.getByRole('heading', { name: 'Übersicht', exact: true })).toBeVisible();
  await expect(page.locator('.ff-row[data-open="f1"]')).toBeVisible();
  await expect(page.locator('.ff-row[data-open="f7"]')).toHaveCount(0);
  await scope(page, 'mine');
  await expect(page.locator('.ff-row[data-open]')).toHaveCount(1);
  await expect(page.locator('.ff-row[data-open="f6"]')).toBeVisible();
});

test('new projects and new proceedings can be used immediately; entered text is escaped', async ({ page }) => {
  await page.getByRole('button', { name: 'Projekt anlegen', exact: true }).click();
  await page.getByLabel('Projektname', { exact: true }).fill('Projekt Alpha');
  await page.getByRole('dialog').getByRole('button', { name: 'Projekt anlegen', exact: true }).click();
  const projectId = Object.entries((await stored(page)).projects).find(([, p]) => p.name === 'Projekt Alpha')[0];
  await expect(page.locator(`[data-project-open="${projectId}"]`)).toBeVisible();
  await page.getByRole('button', { name: 'Frist erfassen', exact: true }).click();
  await page.getByLabel('Bezeichnung', { exact: true }).fill('Erster eigener Eintrag');
  await page.locator('#ff-new-project').selectOption(projectId);
  await page.locator('#ff-new-matter').selectOption('__new__');
  await page.getByLabel('Aktenzeichen', { exact: true }).fill('<img src=x onerror=alert(1)>');
  await page.getByLabel('Verfahrensbezeichnung', { exact: true }).fill('Alpha / Beta');
  await page.locator('#ff-flag').selectOption('notfrist');
  await page.locator('input[name="day"]').fill('2026-10-15');
  await page.locator('input[name="source"]').fill('Beispielgrundlage');
  await page.getByRole('button', { name: 'Eintrag anlegen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Erster eigener Eintrag', exact: true })).toBeVisible();
  await expect(page.locator('.ff-detail-title img')).toHaveCount(0);
  await expect(page.locator('.ff-detail-title')).toContainText('<img src=x onerror=alert(1)>');
  const saved = await stored(page), d = saved.items.find(d => d.title === 'Erster eigener Eintrag');
  expect(d.project).toBe(projectId); expect(d.notfrist).toBe(true); expect(saved.matters[d.matter].name).toBe('Alpha / Beta');
  await page.reload();
  await scope(page, 'all');
  await expect(page.locator(`.ff-row[data-open="${d.id}"]`)).toBeVisible();
});

test('the pre-deadline date stays below its marker and narrow views do not overflow', async ({ page }) => {
  const row = page.locator('.ff-row[data-open="f6"]');
  await expect(row.locator('.ff-preliminary-date')).toHaveText('18.09.');
  const pin = await row.locator('.ff-preliminary-pin').boundingBox(), label = await row.locator('.ff-preliminary-date').boundingBox();
  expect(label.y).toBeGreaterThan(pin.y + pin.height - 1);
  expect(Math.abs(label.x + label.width / 2 - pin.x - pin.width / 2)).toBeLessThan(2);
  for (const width of [1024, 736, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test('deadline dialogs preserve the mounted list, collapsed projects, scroll position and focus', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 400 });
  const project = page.locator('[data-project-id="meridian"]');
  await project.locator('.ff-tree-chevron').click();
  const row = page.locator('.ff-row[data-open="f6"]');
  await row.scrollIntoViewIfNeeded();
  const before = await row.evaluate(element => { window.originRow = element; return window.scrollY; });
  await row.locator('.ff-title').click();
  await expect(page.getByRole('dialog', { name: 'Klageerwiderung', exact: true })).toBeVisible();
  await expect(page.locator('#ff-content')).toBeVisible();
  expect(await row.evaluate(element => element === window.originRow)).toBe(true);
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(project).not.toHaveAttribute('open', '');
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
  await expect(row).toBeFocused();
});

test('settings save from the dialog without changing the selected overview and Escape discards edits', async ({ page }) => {
  await scope(page, 'all');
  await page.locator('#ff-profile > summary').click();
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Einstellungen', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('combobox', { name: 'Personenanzeige', exact: true }).selectOption('full');
  await dialog.getByLabel('Maximale Balkenspanne in Wochen', { exact: true }).fill('8');
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Fristen Kanzlei', exact: true })).toBeVisible();
  expect((await stored(page)).userSettings.clara).toEqual({ weeks: 8, nameDisplay: 'full' });
  await page.locator('#ff-profile > summary').click();
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await dialog.getByLabel('Maximale Balkenspanne in Wochen', { exact: true }).fill('3');
  await page.keyboard.press('Escape');
  expect((await stored(page)).userSettings.clara.weeks).toBe(8);
  await expect(page.locator('#ff-profile > summary')).toBeFocused();
});

test('date edits stay in one dialog and closing an unfinished preliminary date does not save it', async ({ page }) => {
  await page.locator('.ff-row[data-open="f3"] .ff-title').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Datum ändern', exact: true }).click();
  await expect(dialog).toHaveCount(1);
  await dialog.getByLabel('Datum', { exact: true }).fill('2026-09-25');
  await dialog.getByLabel('Grund', { exact: true }).fill('Geänderte Vorgabe');
  await dialog.getByRole('button', { name: 'Datum ändern', exact: true }).click();
  await expect(dialog).toHaveAccessibleName('Stellungnahme zur Nichtigkeitsklage');
  await expect(dialog.locator('.ff-detail-date')).toContainText('25.09.2026 (Fr.)');
  expect((await stored(page)).items.find(d => d.id === 'f3').day).toBe('2026-09-25');
  await dialog.getByRole('button', { name: 'Vorfrist setzen', exact: true }).click();
  await dialog.getByLabel('Vorfristdatum', { exact: true }).fill('2026-09-20');
  await dialog.getByRole('button', { name: 'Fenster schließen', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect((await stored(page)).items.find(d => d.id === 'f3').preliminary).toBeUndefined();
  await expect(page.locator('.ff-row[data-open="f3"]')).toContainText('25.09.2026 (Fr.)');
});

test('small dialog windows keep actions reachable, prevent background focus and close through the backdrop', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 500 });
  await page.locator('#ff-profile > summary').click();
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const bounds = await dialog.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(500);
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  const cancel = dialog.getByRole('button', { name: 'Abbrechen', exact: true });
  await cancel.focus();
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Tab');
    // Native dialogs may include the browser toolbar in the cycle (body then
    // becomes active), but the background application must remain inert.
    expect(await dialog.evaluate(element => document.activeElement === document.body || element.contains(document.activeElement))).toBe(true);
  }
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole('button', { name: 'Speichern', exact: true })).toBeInViewport();
  await page.mouse.click(2, 2);
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#ff-profile > summary')).toBeFocused();
});
