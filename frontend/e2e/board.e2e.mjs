import {
  api,
  APP,
  boxOf,
  clickButton,
  drag,
  launch,
  login,
  register,
  sleep,
  suite,
  waitFor,
  watchErrors,
} from './support.mjs';

const t = suite('quadro Kanban: criar, arrastar, colunas e filtros');
const me = await register('Ana Kanban');
const colleague = await register('Bruno Lima');
const org = await api('POST', '/organizations', me.token, {
  name: 'Kanban Co',
});
await api('POST', `/organizations/${org.id}/members`, me.token, {
  email: colleague.email,
});
const project = await api(
  'POST',
  `/organizations/${org.id}/projects`,
  me.token,
  {
    name: 'Site novo',
    description: 'Redesign completo do site institucional.',
  },
);
const board = await api('POST', `/projects/${project.id}/boards`, me.token, {
  name: 'Sprint 1',
});
const [todo, doing, done] = board.columns;
const createTask = (body) =>
  api('POST', `/boards/${board.id}/tasks`, me.token, body);
await createTask({
  title: 'Definir paleta de cores',
  priority: 'HIGH',
  assigneeIds: [me.id],
});
await createTask({
  title: 'Montar wireframes',
  priority: 'URGENT',
  assigneeIds: [colleague.id, me.id],
});
await createTask({ title: 'Escrever textos da home', priority: 'LOW' });
await createTask({ title: 'Configurar domínio', columnId: done.id });

const browser = await launch();
const page = await browser.newPage();
const errors = watchErrors(page);
const titlesIn = (column) =>
  page.$$eval(`section[data-column="${column}"] app-task-card`, (els) =>
    els.map((e) => e.getAttribute('data-task')),
  );
const tasksInApi = () => api('GET', `/boards/${board.id}/tasks`, me.token);

try {
  await login(page, me.email);
  await page.goto(`${APP}/projects/${project.id}`, {
    waitUntil: 'networkidle0',
  });
  await page.waitForSelector('[data-board="Sprint 1"]');
  t.ok(
    'projeto mostra descrição e quadro',
    (await page.evaluate(() => document.body.innerText)).includes(
      'Redesign completo',
    ),
  );

  await page.click('[data-board="Sprint 1"]');
  await page.waitForSelector('section[data-column="A fazer"] app-task-card');
  t.ok('3 tarefas em A fazer', (await titlesIn('A fazer')).length === 3);

  await clickButton(
    page,
    'Adicionar tarefa',
    'section[@data-column="Em andamento"]',
  );
  await page.waitForSelector('section[data-column="Em andamento"] textarea');
  await page.type(
    'section[data-column="Em andamento"] textarea',
    'Revisar acessibilidade',
  );
  await page.keyboard.press('Enter');
  await page.waitForSelector(
    'app-task-card[data-task="Revisar acessibilidade"]',
  );
  await page.keyboard.press('Escape');
  t.ok(
    'tarefa criada na coluna',
    (await titlesIn('Em andamento')).includes('Revisar acessibilidade'),
  );

  // abrir o campo de novo: o foco tem que ir para ele sem clicar no campo
  await clickButton(
    page,
    'Adicionar tarefa',
    'section[@data-column="Concluído"]',
  );
  await page.waitForSelector('section[data-column="Concluído"] textarea');
  await page.keyboard.type('Digitada direto');
  await page.keyboard.press('Enter');
  t.ok(
    'campo de nova tarefa recebe o foco',
    await page
      .waitForSelector('app-task-card[data-task="Digitada direto"]', {
        timeout: 3000,
      })
      .then(
        () => true,
        () => false,
      ),
  );
  await page.keyboard.press('Escape');
  t.ok(
    'Esc fecha o campo',
    await waitFor(page, () => !document.querySelector('section textarea')),
  );
  await api(
    'DELETE',
    `/tasks/${(await tasksInApi()).find((x) => x.title === 'Digitada direto').id}`,
    me.token,
  );
  await page.waitForFunction(
    () => !document.querySelector('app-task-card[data-task="Digitada direto"]'),
  );

  const target = await boxOf(
    page,
    'app-task-card[data-task="Revisar acessibilidade"]',
  );
  await drag(page, 'app-task-card[data-task="Definir paleta de cores"]', {
    x: target.x + target.width / 2,
    y: target.y + 4,
  });
  t.ok(
    'tarefa arrastada para Em andamento',
    (await titlesIn('Em andamento'))[0] === 'Definir paleta de cores',
  );
  await sleep(500);
  const afterMove = await tasksInApi();
  t.ok(
    'ordem salva na API',
    afterMove
      .filter((x) => x.columnId === doing.id)
      .map((x) => x.title)
      .join('|') === 'Definir paleta de cores|Revisar acessibilidade',
  );

  const top = await boxOf(page, 'app-task-card[data-task="Montar wireframes"]');
  await drag(page, 'app-task-card[data-task="Escrever textos da home"]', {
    x: top.x + top.width / 2,
    y: top.y + 2,
  });
  t.ok(
    'reordena dentro da coluna',
    (await titlesIn('A fazer'))[0] === 'Escrever textos da home',
  );
  await sleep(500);
  t.ok(
    'nova ordem salva',
    (await tasksInApi()).filter((x) => x.columnId === todo.id)[0].title ===
      'Escrever textos da home',
  );

  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('section[data-column="A fazer"] app-task-card');
  t.ok(
    'ordem mantida após recarregar',
    (await titlesIn('Em andamento'))[0] === 'Definir paleta de cores',
  );

  const first = await boxOf(page, 'section[data-column="A fazer"]');
  await drag(page, 'section[data-column="Concluído"] h2', {
    x: first.x + 10,
    y: first.y + 20,
  });
  await sleep(500);
  const columns = await page.$$eval('section[data-column]', (els) =>
    els.map((e) => e.getAttribute('data-column')),
  );
  t.ok('coluna arrastada para o início', columns[0] === 'Concluído', columns);
  const saved = await api('GET', `/boards/${board.id}`, me.token);
  t.ok('ordem das colunas salva', saved.columns[0].name === 'Concluído');

  await page.type('input[placeholder="Buscar"]', 'wire');
  await sleep(300);
  const visible = await page.$$eval('app-task-card', (els) =>
    els.map((e) => e.getAttribute('data-task')),
  );
  t.ok(
    'busca filtra os cards',
    visible.join() === 'Montar wireframes',
    visible,
  );
  await clickButton(page, 'Limpar');
  await sleep(300);
  t.ok('limpar volta tudo', (await page.$$('app-task-card')).length === 5);

  await clickButton(page, 'Nova coluna');
  await page.waitForSelector('mat-dialog-container input');
  await page.type('mat-dialog-container input', 'Revisão');
  await page.keyboard.press('Enter');
  await page.waitForSelector('section[data-column="Revisão"]');
  t.ok('coluna criada', true);
} catch (e) {
  await t.fail(e, page);
}

t.ok('sem erros no console', errors.length === 0, errors);
await browser.close();
await api('DELETE', `/organizations/${org.id}`, me.token);
t.done();
