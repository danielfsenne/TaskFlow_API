import {
  api,
  APP,
  clickButton,
  launch,
  login,
  register,
  sleep,
  suite,
  watchErrors,
} from './support.mjs';

const t = suite('painel da tarefa e comentários');
const me = await register('Carla Painel');
const colleague = await register('Diego Souza');
const org = await api('POST', '/organizations', me.token, {
  name: 'Painel Co',
});
await api('POST', `/organizations/${org.id}/members`, me.token, {
  email: colleague.email,
});
const project = await api(
  'POST',
  `/organizations/${org.id}/projects`,
  me.token,
  { name: 'App mobile' },
);
const board = await api('POST', `/projects/${project.id}/boards`, me.token, {
  name: 'Sprint 2',
});
const done = board.columns[2];
const task = await api('POST', `/boards/${board.id}/tasks`, me.token, {
  title: 'Tela de login',
  dueDate: '2026-12-05T15:00:00.000Z',
});
await api('POST', `/boards/${board.id}/tasks`, me.token, {
  title: 'Tela de perfil',
});
await api('POST', `/tasks/${task.id}/comments`, colleague.token, {
  content: 'Posso pegar essa depois do almoço.',
});

const browser = await launch();
const page = await browser.newPage();
const errors = watchErrors(page);
const dialog = 'mat-dialog-container';
const dialogText = () => page.$eval(dialog, (e) => e.innerText).catch(() => '');
const waitDialogText = (text) =>
  page.waitForFunction(
    (t) =>
      document.querySelector('mat-dialog-container')?.innerText.includes(t),
    { timeout: 8000 },
    text,
  );
const fetchTask = async () =>
  (await api('GET', `/boards/${board.id}/tasks`, me.token)).find(
    (x) => x.id === task.id,
  );
async function selectOption(field, option) {
  const [select] = await page.$$(
    `xpath/.//mat-dialog-container//mat-form-field[.//mat-label[contains(., "${field}")]]//mat-select`,
  );
  await select.click();
  await page.waitForSelector('mat-option');
  await clickButton(page, option, 'div[contains(@class,"cdk-overlay-pane")]');
}
const commentButton = (comment, label) =>
  page.$$(
    `xpath/.//mat-dialog-container//li[.//p[contains(., "${comment}")]]//button[contains(., "${label}")]`,
  );

try {
  await login(page, me.email);
  await page.goto(`${APP}/boards/${board.id}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('app-task-card[data-task="Tela de login"]');

  const column = await (
    await page.$('section[data-column="Em andamento"]')
  ).boundingBox();
  const card = await (
    await page.$('app-task-card[data-task="Tela de perfil"]')
  ).boundingBox();
  await page.mouse.move(card.x + 40, card.y + 15);
  await page.mouse.down();
  await page.mouse.move(card.x + 45, card.y + 20, { steps: 3 });
  await page.mouse.move(column.x + 100, column.y + 60, { steps: 15 });
  await page.mouse.up();
  await sleep(700);
  t.ok('arrastar não abre o painel', !(await page.$(dialog)));

  await page.click('app-task-card[data-task="Tela de login"]');
  await waitDialogText('Posso pegar essa');
  t.ok('URL ganha ?task=', page.url().includes(`task=${task.id}`), page.url());

  await page.click(`${dialog} h2`);
  const titleInput = `${dialog} input[aria-label="Título da tarefa"]`;
  await page.waitForSelector(titleInput);
  await page.click(titleInput, { clickCount: 3 });
  await page.type(titleInput, 'Tela de login com Google');
  await page.keyboard.press('Enter');
  await waitDialogText('Tela de login com Google');
  await sleep(300);
  t.ok(
    'título salvo',
    (await fetchTask()).title === 'Tela de login com Google',
  );
  t.ok(
    'card atualizado',
    !!(await page.$('app-task-card[data-task="Tela de login com Google"]')),
  );

  const [description] = await page.$$(
    'xpath/.//mat-dialog-container//div[contains(normalize-space(.), "Clique para adicionar") and not(.//div)]',
  );
  await description.click();
  await page.waitForSelector('textarea[aria-label="Descrição"]');
  await page.type(
    'textarea[aria-label="Descrição"]',
    'Usar OAuth.\nTestar no Android e no iOS.',
  );
  await clickButton(page, 'Salvar', dialog);
  await waitDialogText('Usar OAuth.');
  await sleep(300);
  t.ok(
    'descrição salva',
    (await fetchTask()).description ===
      'Usar OAuth.\nTestar no Android e no iOS.',
  );

  await selectOption('Prioridade', 'Urgente');
  await sleep(500);
  t.ok('prioridade salva', (await fetchTask()).priority === 'URGENT');
  await selectOption('Responsáveis', 'Diego Souza');
  await page.keyboard.press('Escape');
  await sleep(700);
  t.ok(
    'responsável salvo',
    (await fetchTask()).assignees.map((a) => a.name).join() === 'Diego Souza',
  );
  t.ok('Esc fecha só o select', !!(await page.$(dialog)));

  await clickButton(page, 'Remover prazo', dialog);
  await sleep(500);
  t.ok('prazo removido', (await fetchTask()).dueDate === null);

  await page.type(
    'textarea[aria-label="Novo comentário"]',
    'Comecei pelo layout.',
  );
  await clickButton(page, 'Enviar', dialog);
  await waitDialogText('Comecei pelo layout.');
  t.ok(
    'contador de comentários',
    (await dialogText()).includes('Comentários (2)'),
  );

  const [edit] = await commentButton('Comecei pelo layout.', 'Editar');
  await edit.click();
  const editBox = 'textarea[aria-label="Editar comentário"]';
  await page.waitForSelector(editBox);
  await page.click(editBox);
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await page.type(editBox, 'Comecei pelo layout e pelos ícones.');
  await clickButton(page, 'Salvar', `${dialog}//li`);
  await waitDialogText('(editado)');
  t.ok('comentário editado', (await dialogText()).includes('pelos ícones'));
  t.ok(
    'sem edição no comentário alheio',
    (await commentButton('Posso pegar', 'Editar')).length === 0,
  );

  const [remove] = await commentButton('Posso pegar', 'Excluir');
  await remove.click();
  await page.waitForSelector('app-confirm-dialog');
  await clickButton(page, 'Excluir', 'app-confirm-dialog');
  await page.waitForFunction(
    () =>
      !document
        .querySelector('mat-dialog-container')
        ?.innerText.includes('Posso pegar'),
  );
  t.ok(
    'dona do projeto modera comentário',
    (await dialogText()).includes('Comentários (1)'),
  );

  await selectOption('Coluna', 'Concluído');
  await sleep(700);
  t.ok('movida pelo painel', (await fetchTask()).columnId === done.id);
  await page.keyboard.press('Escape');
  await sleep(500);
  t.ok('fechar limpa ?task=', !page.url().includes('task='), page.url());

  await page.goto(`${APP}/boards/${board.id}?task=${task.id}`, {
    waitUntil: 'networkidle0',
  });
  await waitDialogText('Tela de login com Google');
  t.ok('link direto abre o painel', true);

  await clickButton(page, 'Excluir tarefa', dialog);
  await page.waitForSelector('app-confirm-dialog');
  await clickButton(page, 'Excluir', 'app-confirm-dialog');
  await page.waitForFunction(() => !document.querySelector('app-task-dialog'));
  await sleep(400);
  t.ok(
    'tarefa some do quadro',
    !(await page.$('app-task-card[data-task="Tela de login com Google"]')),
  );
  t.ok('API confirma exclusão', !(await fetchTask()));
} catch (e) {
  await t.fail(e, page);
}

t.ok('sem erros no console', errors.length === 0, errors);
await browser.close();
await api('DELETE', `/organizations/${org.id}`, me.token);
t.done();
