import {
  launch,
  login,
  register,
  sleep,
  suite,
  watchErrors,
} from './support.mjs';

const t = suite('tema escuro');
const user = await register('Tina Tema');
const browser = await launch();
const page = await browser.newPage();
const errors = watchErrors(page);
const isDark = () =>
  page.evaluate(() => document.documentElement.classList.contains('dark'));
const pageBg = () =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

async function choose(option) {
  await page.waitForFunction(() =>
    document
      .querySelector('[data-testid=user-menu]')
      ?.textContent.includes('Tina'),
  );
  await sleep(200);
  await page.click('[data-testid=user-menu]');
  await page.waitForSelector('.mat-mdc-menu-panel');
  await sleep(300);
  const [item] = await page.$$(
    'xpath/.//button[@mat-menu-item][contains(., "Tema")]',
  );
  await item.click();
  await page.waitForSelector(`[data-theme-option="${option}"]`);
  await sleep(300);
  await page.click(`[data-theme-option="${option}"]`);
  await sleep(300);
}

try {
  await page.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: 'light' },
  ]);
  await login(page, user.email);
  t.ok('começa claro com o sistema claro', !(await isDark()));
  const light = await pageBg();

  await choose('dark');
  t.ok('escolher Escuro aplica o tema', await isDark());
  t.ok('fundo da página muda', (await pageBg()) !== light, await pageBg());

  await page.reload({ waitUntil: 'networkidle0' });
  t.ok('a escolha continua após recarregar', await isDark());

  await choose('system');
  t.ok('"Igual ao sistema" volta ao claro', !(await isDark()));
  await page.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: 'dark' },
  ]);
  await sleep(200);
  t.ok('e acompanha quando o sistema muda para escuro', await isDark());

  await choose('light');
  t.ok('Claro vence o sistema escuro', !(await isDark()));
} catch (e) {
  await t.fail(e, page);
}

t.ok('sem erros no console', errors.length === 0, errors);
await browser.close();
t.done();
