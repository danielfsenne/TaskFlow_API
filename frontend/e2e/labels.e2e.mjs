import {
  api,
  APP,
  clickButton,
  launch,
  login,
  register,
  sleep,
  suite,
  waitFor,
  watchErrors,
} from './support.mjs';

const t = suite('etiquetas');
const ana = await register('Ana Etiqueta');
const beto = await register('Beto Etiqueta');
const org = await api('POST', '/organizations', ana.token, {
  name: 'Etiquetas Co',
});
await api('POST', `/organizations/${org.id}/members`, ana.token, {
  email: beto.email,
});
const project = await api(
  'POST',
  `/organizations/${org.id}/projects`,
  ana.token,
  {
    name: 'Projeto etiquetas',
  },
);
const board = await api('POST', `/projects/${project.id}/boards`, ana.token, {
  name: 'Quadro',
});
const task = await api('POST', `/boards/${board.id}/tasks`, ana.token, {
  title: 'Corrigir login',
});
await api('POST', `/boards/${board.id}/tasks`, ana.token, {
  title: 'Escrever documentação',
});

const browser = await launch();
const page = await browser.newPage();
const errors = watchErrors(page);
const chipsOn = (title) =>
  page.$$eval(`app-task-card[data-task="${title}"] app-label-chip`, (els) =>
    els.map((e) => e.getAttribute('data-label')),
  );

try {
  await login(page, ana.email);
  await page.goto(`${APP}/boards/${board.id}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('app-task-card[data-task="Corrigir login"]');

  // criar pelo menu do quadro
  await page.click('button[aria-label="Opções do quadro"]');
  await page.waitForSelector('.mat-mdc-menu-panel');
  await sleep(300);
  await clickButton(
    page,
    'Etiquetas',
    'div[contains(@class,"mat-mdc-menu-panel")]',
  );
  await page.waitForSelector('app-labels-dialog');
  const nameInput = 'input[aria-label="Nome da nova etiqueta"]';
  await page.type(nameInput, 'bug');
  await page.click('button[aria-label="Vermelho"]');
  await clickButton(page, 'Criar', 'app-labels-dialog');
  await page.waitForSelector('[data-testid=labels-list] [data-label="bug"]');
  await page.type(nameInput, 'design');
  await page.click('button[aria-label="Roxo"]');
  await clickButton(page, 'Criar', 'app-labels-dialog');
  await page.waitForSelector('[data-testid=labels-list] [data-label="design"]');
  const labels = await api('GET', `/boards/${board.id}/labels`, ana.token);
  t.ok(
    'etiquetas criadas com nome e cor',
    labels.map((l) => `${l.name}:${l.color}`).join() ===
      'bug:red,design:purple',
    labels,
  );
  await clickButton(page, 'Fechar', 'app-labels-dialog');
  await page.waitForFunction(
    () => !document.querySelector('app-labels-dialog'),
  );

  // aplicar pelo painel da tarefa
  await page.click('app-task-card[data-task="Corrigir login"]');
  await page.waitForSelector('[data-testid=task-labels]');
  await sleep(300);
  await page.click('[data-testid=task-labels]');
  await page.waitForSelector('mat-option');
  await clickButton(page, 'bug', 'div[contains(@class,"cdk-overlay-pane")]');
  await sleep(500);
  await page.keyboard.press('Escape');
  await sleep(300);
  await page.keyboard.press('Escape');
  t.ok(
    'card mostra a etiqueta',
    await waitFor(
      page,
      () =>
        !!document.querySelector(
          'app-task-card[data-task="Corrigir login"] [data-label="bug"]',
        ),
    ),
  );
  const saved = await api('GET', `/tasks/${task.id}`, ana.token);
  t.ok(
    'etiqueta salva na tarefa',
    saved.labels.map((l) => l.name).join() === 'bug',
    saved.labels,
  );

  // filtro
  await page.click('[data-testid=label-filter]');
  await page.waitForSelector('mat-option');
  await clickButton(page, 'bug', 'div[contains(@class,"cdk-overlay-pane")]');
  await sleep(300);
  const visible = await page.$$eval('app-task-card', (els) =>
    els.map((e) => e.getAttribute('data-task')),
  );
  t.ok(
    'filtro mostra só as tarefas com a etiqueta',
    visible.join() === 'Corrigir login',
    visible,
  );
  await clickButton(page, 'Limpar');
  await sleep(300);

  // outra pessoa renomeia e depois exclui: o card acompanha ao vivo
  const bug = labels.find((l) => l.name === 'bug');
  await api('PATCH', `/labels/${bug.id}`, beto.token, { name: 'defeito' });
  t.ok(
    'renomeada por outra pessoa, o card atualiza',
    await waitFor(
      page,
      () =>
        !!document.querySelector(
          'app-task-card[data-task="Corrigir login"] [data-label="defeito"]',
        ),
    ),
  );
  await api('DELETE', `/labels/${bug.id}`, beto.token);
  t.ok(
    'excluída por outra pessoa, some do card',
    await waitFor(
      page,
      () =>
        !document.querySelector(
          'app-task-card[data-task="Corrigir login"] app-label-chip',
        ),
    ),
  );
  t.ok(
    'lista do quadro atualizada',
    (await chipsOn('Corrigir login')).length === 0,
  );
} catch (e) {
  await t.fail(e, page);
}

t.ok('sem erros no console', errors.length === 0, errors);
await browser.close();
await api('DELETE', `/organizations/${org.id}`, ana.token);
t.done();
