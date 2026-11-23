import {
  api,
  APP,
  launch,
  login,
  register,
  sleep,
  suite,
  waitFor,
  watchErrors,
} from './support.mjs';

const t = suite('busca geral');
const ana = await register('Ana Busca');
const term = `kappa${Date.now().toString(36).slice(-5)}`;
const org = await api('POST', '/organizations', ana.token, {
  name: 'Busca Co',
});
const project = await api(
  'POST',
  `/organizations/${org.id}/projects`,
  ana.token,
  {
    name: `Portal ${term}`,
  },
);
const board = await api('POST', `/projects/${project.id}/boards`, ana.token, {
  name: 'Sprint',
});
const task = await api('POST', `/boards/${board.id}/tasks`, ana.token, {
  title: `Revisar ${term} no checkout`,
});

const browser = await launch();
const page = await browser.newPage();
const errors = watchErrors(page);
const hits = () =>
  page.$$eval('[data-hit]', (els) =>
    els.map((e) => e.getAttribute('data-hit')),
  );

try {
  await login(page, ana.email);
  await sleep(300);

  // atalho "/" foca a busca
  await page.keyboard.press('/');
  t.ok(
    'atalho / foca a busca',
    await page.evaluate(
      () => document.activeElement?.getAttribute('data-testid') === 'search',
    ),
  );
  await page.keyboard.type(term);
  t.ok(
    'mostra tarefa e projeto encontrados',
    await waitFor(
      page,
      (n) => document.querySelectorAll('[data-hit]').length === n,
      2,
    ),
    await hits(),
  );
  const found = await hits();
  t.ok(
    'tarefas antes de projetos',
    found[0] === `Revisar ${term} no checkout`,
    found,
  );

  // Enter abre o primeiro resultado (a tarefa) no quadro
  await page.keyboard.press('Enter');
  t.ok(
    'Enter abre a tarefa no painel',
    await waitFor(
      page,
      (id) =>
        location.search.includes(`task=${id}`) &&
        !!document.querySelector('mat-dialog-container'),
      task.id,
      8000,
    ),
  );
  await page.keyboard.press('Escape');
  await sleep(400);

  // setas escolhem o projeto
  await page.click('[data-testid=search]');
  await page.keyboard.type(term);
  await waitFor(
    page,
    () => document.querySelectorAll('[data-hit]').length === 2,
  );
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  t.ok(
    'seta para baixo e Enter abrem o projeto',
    await waitFor(
      page,
      (id) => location.pathname === `/projects/${id}`,
      project.id,
    ),
  );

  await page.click('[data-testid=search]');
  await page.keyboard.type('nada-disso-existe');
  t.ok(
    'avisa quando não encontra nada',
    await waitFor(page, () =>
      document
        .querySelector('[data-testid=search-results]')
        ?.innerText.includes('Nada encontrado'),
    ),
  );
  await page.keyboard.press('Escape');
  t.ok(
    'Esc fecha a lista',
    await waitFor(
      page,
      () => !document.querySelector('[data-testid=search-results]'),
    ),
  );
} catch (e) {
  await t.fail(e, page);
}

t.ok('sem erros no console', errors.length === 0, errors);
await browser.close();
await api('DELETE', `/organizations/${org.id}`, ana.token);
t.done();
