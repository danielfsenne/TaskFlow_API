import {
  api,
  APP,
  inDays,
  launch,
  login,
  register,
  sleep,
  suite,
  waitFor,
  watchErrors,
} from './support.mjs';

const t = suite('dashboards: início, organização e projeto');
const lia = await register('Lia Painel');
const bia = await register('Bia Chefe');
const org = await api('POST', '/organizations', bia.token, {
  name: 'Painel Ltda',
});
await api('POST', `/organizations/${org.id}/members`, bia.token, {
  email: lia.email,
});
const project = await api(
  'POST',
  `/organizations/${org.id}/projects`,
  bia.token,
  { name: 'Portal' },
);
const board = await api('POST', `/projects/${project.id}/boards`, bia.token, {
  name: 'Quadro Portal',
});
const done = board.columns[2];
const createTask = (body) =>
  api('POST', `/boards/${board.id}/tasks`, bia.token, body);
await createTask({ title: 'Sem data', assigneeIds: [lia.id] });
await createTask({
  title: 'Venceu ontem',
  dueDate: inDays(-1),
  assigneeIds: [lia.id],
  priority: 'URGENT',
});
await createTask({
  title: 'Vence amanhã',
  dueDate: inDays(1),
  assigneeIds: [lia.id],
});
await createTask({
  title: 'Pronta',
  columnId: done.id,
  assigneeIds: [lia.id],
  dueDate: inDays(-5),
});

const browser = await launch({ width: 1300, height: 900 });
const page = await browser.newPage();
const errors = watchErrors(page);
const stat = (label) =>
  page
    .$eval(`[data-stat="${label}"]`, (e) => e.textContent.trim())
    .catch(() => null);
const openTab = async (label) => {
  await page.waitForSelector('div[role=tab]');
  const [tab] = await page.$$(
    `xpath/.//div[@role="tab"][contains(., "${label}")]`,
  );
  await tab.click();
};

try {
  await login(page, lia.email);
  await page.waitForSelector('[data-testid=my-tasks]');
  await sleep(400);

  t.ok('início: 3 atribuídas', (await stat('Atribuídas a mim')) === '3');
  t.ok('início: 1 atrasada', (await stat('Atrasadas')) === '1');
  t.ok('início: 1 vence em 7 dias', (await stat('Vencem em 7 dias')) === '1');
  t.ok(
    'início: 1 concluída na semana',
    (await stat('Concluídas na semana')) === '1',
  );
  const order = await page.$$eval('[data-my-task]', (els) =>
    els.map((e) => e.getAttribute('data-my-task')),
  );
  t.ok(
    'tarefas por urgência, sem a concluída',
    order.join('|') === 'Venceu ontem|Vence amanhã|Sem data',
    order,
  );
  t.ok('organização no início', !!(await page.$('[data-org="Painel Ltda"]')));

  const fresh = await createTask({ title: 'Chegou agora', dueDate: inDays(3) });
  await api('PUT', `/tasks/${fresh.id}/assignees`, bia.token, {
    userIds: [lia.id],
  });
  t.ok(
    'nova atribuição aparece sem recarregar',
    await waitFor(
      page,
      () => !!document.querySelector('[data-my-task="Chegou agora"]'),
    ),
  );
  t.ok(
    'contador atualizado',
    await waitFor(
      page,
      () =>
        document
          .querySelector('[data-stat="Atribuídas a mim"]')
          ?.textContent.trim() === '4',
    ),
  );

  await page.click('[data-my-task="Venceu ontem"]');
  t.ok(
    'abre o painel da tarefa',
    await waitFor(
      page,
      () =>
        document
          .querySelector('mat-dialog-container')
          ?.innerText.includes('Venceu ontem'),
      undefined,
      8000,
    ),
  );
  t.ok(
    'organização marcada na barra lateral',
    await waitFor(page, () =>
      [...document.querySelectorAll('[data-testid=sidebar] a.active')].some(
        (a) => a.textContent.includes('Painel Ltda'),
      ),
    ),
  );
  t.ok(
    'concluída não aparece como atrasada',
    await page.$eval(
      'app-task-card[data-task="Pronta"]',
      (e) => !e.innerHTML.includes('text-red-700'),
    ),
  );
  await page.keyboard.press('Escape');
  await sleep(300);

  await page.goto(`${APP}/orgs/${org.id}`, { waitUntil: 'networkidle0' });
  t.ok(
    'card do projeto mostra progresso',
    await waitFor(page, () =>
      document
        .querySelector('[data-project="Portal"]')
        ?.innerText.includes('1/5 concluídas'),
    ),
  );
  await openTab('Visão geral');
  await page.waitForSelector('app-stats-panel [data-stat]');
  t.ok('org: 4 abertas', (await stat('Abertas')) === '4');
  t.ok('org: 1 concluída', (await stat('Concluídas')) === '1');
  t.ok(
    'org: projeto no detalhamento',
    !!(await page.$('[data-breakdown="Portal"]')),
  );
  t.ok(
    'org: carga da Lia',
    await page
      .$eval('[data-bar="Lia Painel"]', (e) => e.innerText.includes('4'))
      .catch(() => false),
  );

  const weeks = await page.$$('[data-week]');
  t.ok('gráfico com 8 semanas', weeks.length === 8, weeks.length);
  await weeks[7].hover();
  t.ok(
    'dica da semana',
    await waitFor(page, () =>
      document
        .querySelector('.mat-mdc-tooltip')
        ?.textContent.includes('5 criadas · 1 concluídas'),
    ),
  );
  await page.mouse.move(5, 5);
  await sleep(300);
  const [table] = await page.$$('xpath/.//button[contains(., "Ver tabela")]');
  await table.click();
  t.ok(
    'alternativa em tabela',
    await waitFor(
      page,
      () => document.querySelectorAll('app-weekly-chart tbody tr').length === 8,
    ),
  );

  await page.click('[data-breakdown="Portal"]');
  await page.waitForFunction(
    (id) => location.pathname === `/projects/${id}`,
    {},
    project.id,
  );
  await openTab('Visão geral');
  t.ok(
    'projeto: quadro no detalhamento',
    await waitFor(
      page,
      () => !!document.querySelector('[data-breakdown="Quadro Portal"]'),
    ),
  );
} catch (e) {
  await t.fail(e, page);
}

t.ok('sem erros no console', errors.length === 0, errors);
await browser.close();
await api('DELETE', `/organizations/${org.id}`, bia.token);
t.done();
