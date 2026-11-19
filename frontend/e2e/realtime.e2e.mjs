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

const t = suite('tempo real: duas pessoas no mesmo quadro');
const ana = await register('Ana Real');
const beto = await register('Beto Tempo');
const org = await api('POST', '/organizations', ana.token, { name: 'Ao Vivo' });
await api('POST', `/organizations/${org.id}/members`, ana.token, {
  email: beto.email,
});
const project = await api(
  'POST',
  `/organizations/${org.id}/projects`,
  ana.token,
  { name: 'Projeto ao vivo' },
);
const board = await api('POST', `/projects/${project.id}/boards`, ana.token, {
  name: 'Quadro compartilhado',
});
const seed = await api('POST', `/boards/${board.id}/tasks`, ana.token, {
  title: 'Tarefa existente',
});

const browser = await launch();
const errors = [];

// contexto separado = outra pessoa, com outra sessão
async function openAs(user) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  page.errors = watchErrors(page, `${user.name}: `);
  await login(page, user.email);
  await page.goto(`${APP}/boards/${board.id}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('app-task-card[data-task="Tarefa existente"]');
  return page;
}

let pa;
let pb;
try {
  pa = await openAs(ana);
  pb = await openAs(beto);
  await sleep(800);

  const newTask = 'section[data-column="A fazer"] textarea';
  for (let i = 0; i < 3 && !(await pa.$(newTask)); i++) {
    await clickButton(pa, 'Adicionar tarefa', 'section[@data-column="A fazer"]');
    await pa.waitForSelector(newTask, { timeout: 2000 }).catch(() => {});
  }
  await pa.type(newTask, 'Criada pela Ana');
  await pa.keyboard.press('Enter');
  t.ok(
    'Beto vê a tarefa criada pela Ana',
    await waitFor(
      pb,
      () =>
        !!document.querySelector('app-task-card[data-task="Criada pela Ana"]'),
    ),
  );

  const card = await (
    await pb.$('app-task-card[data-task="Tarefa existente"]')
  ).boundingBox();
  const column = await (
    await pb.$('section[data-column="Em andamento"]')
  ).boundingBox();
  await pb.mouse.move(card.x + 40, card.y + 15);
  await pb.mouse.down();
  await pb.mouse.move(card.x + 45, card.y + 20, { steps: 3 });
  await pb.mouse.move(column.x + 100, column.y + 60, { steps: 15 });
  await sleep(150);
  await pb.mouse.up();
  t.ok(
    'Ana vê a tarefa que o Beto arrastou',
    await waitFor(pa, () =>
      [
        ...document.querySelectorAll(
          'section[data-column="Em andamento"] app-task-card',
        ),
      ].some((e) => e.getAttribute('data-task') === 'Tarefa existente'),
    ),
  );

  await pa.click('app-task-card[data-task="Tarefa existente"]');
  await pa.waitForSelector('mat-dialog-container');
  await sleep(400);
  await api('POST', `/tasks/${seed.id}/comments`, beto.token, {
    content: 'Comentário do Beto ao vivo',
  });
  t.ok(
    'comentário aparece no painel aberto da Ana',
    await waitFor(pa, () =>
      document
        .querySelector('mat-dialog-container')
        ?.innerText.includes('Comentário do Beto ao vivo'),
    ),
  );
  t.ok(
    'contador do painel sobe',
    await waitFor(pa, () =>
      document
        .querySelector('mat-dialog-container')
        ?.innerText.includes('Comentários (1)'),
    ),
  );

  await pa.type('textarea[aria-label="Novo comentário"]', 'Resposta da Ana');
  await clickButton(pa, 'Enviar', 'mat-dialog-container');
  await waitFor(pa, () =>
    document
      .querySelector('mat-dialog-container')
      ?.innerText.includes('Resposta da Ana'),
  );
  await sleep(800);
  t.ok(
    'eco do próprio comentário não conta em dobro',
    (await pa.$eval('mat-dialog-container', (e) => e.innerText)).includes(
      'Comentários (2)',
    ),
  );
  t.ok(
    'card do Beto mostra 2 comentários',
    await waitFor(pb, () =>
      document
        .querySelector('app-task-card[data-task="Tarefa existente"]')
        ?.innerText.includes('2'),
    ),
  );

  const [priority] = await pa.$$(
    'xpath/.//mat-dialog-container//mat-form-field[.//mat-label[contains(., "Prioridade")]]//mat-select',
  );
  await priority.click();
  await pa.waitForSelector('mat-option');
  await clickButton(pa, 'Urgente', 'div[contains(@class,"cdk-overlay-pane")]');
  t.ok(
    'Beto vê a prioridade alterada',
    await waitFor(pb, () =>
      document
        .querySelector('app-task-card[data-task="Tarefa existente"]')
        ?.innerText.includes('Urgente'),
    ),
  );
  await pa.keyboard.press('Escape');

  await clickButton(pb, 'Nova coluna');
  await pb.waitForSelector('mat-dialog-container input');
  await pb.type('mat-dialog-container input', 'Homologação');
  await pb.keyboard.press('Enter');
  t.ok(
    'Ana vê a coluna nova',
    await waitFor(
      pa,
      () => !!document.querySelector('section[data-column="Homologação"]'),
    ),
  );

  await api('PATCH', `/boards/${board.id}`, ana.token, {
    name: 'Quadro renomeado',
  });
  t.ok(
    'Beto vê o quadro renomeado',
    await waitFor(pb, () =>
      document.querySelector('h1')?.textContent.includes('Quadro renomeado'),
    ),
  );

  const created = (
    await api('GET', `/boards/${board.id}/tasks`, ana.token)
  ).find((x) => x.title === 'Criada pela Ana');
  await api('DELETE', `/tasks/${created.id}`, ana.token);
  t.ok(
    'Beto vê a exclusão',
    await waitFor(
      pb,
      () =>
        !document.querySelector('app-task-card[data-task="Criada pela Ana"]'),
    ),
  );

  await api('DELETE', `/boards/${board.id}`, ana.token);
  t.ok(
    'quadro excluído leva o Beto ao projeto',
    await waitFor(
      pb,
      (id) => location.pathname === `/projects/${id}`,
      project.id,
    ),
  );
} catch (e) {
  await t.fail(e, pa);
}

for (const page of [pa, pb]) if (page) errors.push(...page.errors);
t.ok('sem erros no console', errors.length === 0, errors);
await browser.close();
await api('DELETE', `/organizations/${org.id}`, ana.token);
t.done();
