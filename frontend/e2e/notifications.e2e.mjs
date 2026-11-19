import {
  api,
  clickButton,
  launch,
  login,
  register,
  sleep,
  suite,
  waitFor,
  watchErrors,
  PASSWORD,
} from './support.mjs';

const t = suite('sino de notificações');
const ana = await register('Ana Sino');
const beto = await register('Beto Sino');
const org = await api('POST', '/organizations', ana.token, {
  name: 'Sino Ltda',
});
const project = await api(
  'POST',
  `/organizations/${org.id}/projects`,
  ana.token,
  { name: 'Projeto Sino' },
);
const board = await api('POST', `/projects/${project.id}/boards`, ana.token, {
  name: 'Quadro Sino',
});

const browser = await launch();
const page = await browser.newPage();
const errors = watchErrors(page);
const badge = () =>
  page
    .$eval('[data-testid=bell] .mat-badge-content', (e) =>
      e.closest('.mat-badge-hidden') ? '' : e.textContent.trim(),
    )
    .catch(() => '');
const badgeIs = (n) =>
  waitFor(
    page,
    (v) =>
      document
        .querySelector('[data-testid=bell] .mat-badge-content')
        ?.textContent.trim() === v,
    String(n),
  );

try {
  await login(page, beto.email);
  await sleep(800);
  t.ok('sem notificações no início', (await badge()) === '');

  await api('POST', `/organizations/${org.id}/members`, ana.token, {
    email: beto.email,
  });
  t.ok('badge mostra 1 ao vivo', await badgeIs(1));
  t.ok(
    'organização aparece sozinha',
    await waitFor(page, () => document.body.innerText.includes('Sino Ltda')),
  );

  const task = await api('POST', `/boards/${board.id}/tasks`, ana.token, {
    title: 'Revisar proposta',
  });
  await api('PUT', `/tasks/${task.id}/assignees`, ana.token, {
    userIds: [beto.id],
  });
  t.ok('badge mostra 2', await badgeIs(2));

  await page.click('[data-testid=bell]');
  await page.waitForSelector('[data-notification]');
  await sleep(300);
  const items = await page.$$eval('[data-notification]', (els) =>
    els.map((e) => e.innerText),
  );
  t.ok(
    'mais recente primeiro',
    items[0]?.includes('Ana Sino atribuiu a você "Revisar proposta"'),
    items,
  );
  t.ok(
    'texto da entrada na organização',
    items[1]?.includes('adicionou você à organização Sino Ltda'),
    items,
  );

  await page.click('[data-notification="TASK_ASSIGNED"]');
  t.ok(
    'abre o quadro com o painel da tarefa',
    await waitFor(
      page,
      () =>
        document
          .querySelector('mat-dialog-container')
          ?.innerText.includes('Revisar proposta'),
      undefined,
      8000,
    ),
  );
  t.ok(
    'URL do quadro',
    page.url().includes(`/boards/${board.id}`) &&
      page.url().includes(`task=${task.id}`),
  );
  t.ok('badge cai para 1', await badgeIs(1));
  await page.keyboard.press('Escape');
  await sleep(400);

  await page.click('[data-testid=bell]');
  await page.waitForSelector('[data-notification]');
  await sleep(400);
  await clickButton(page, 'Marcar todas como lidas');
  await sleep(500);
  await page.keyboard.press('Escape');
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(800);
  t.ok('tudo lido continua lido após recarregar', (await badge()) === '');
  const session = await api('POST', '/auth/login', null, {
    email: beto.email,
    password: PASSWORD,
  });
  const unread = await api(
    'GET',
    '/notifications/unread-count',
    session.accessToken,
  );
  t.ok('API confirma 0 não lidas', unread.count === 0, unread);
} catch (e) {
  await t.fail(e, page);
}

t.ok('sem erros no console', errors.length === 0, errors);
await browser.close();
await api('DELETE', `/organizations/${org.id}`, ana.token);
t.done();
