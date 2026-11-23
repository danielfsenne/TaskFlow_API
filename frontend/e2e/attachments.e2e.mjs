import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

const t = suite('anexos');
const ana = await register('Ana Anexo');
const beto = await register('Beto Anexo');
const org = await api('POST', '/organizations', ana.token, {
  name: 'Anexos Co',
});
await api('POST', `/organizations/${org.id}/members`, ana.token, {
  email: beto.email,
});
const project = await api(
  'POST',
  `/organizations/${org.id}/projects`,
  ana.token,
  {
    name: 'Projeto anexos',
  },
);
const board = await api('POST', `/projects/${project.id}/boards`, ana.token, {
  name: 'Quadro',
});
const task = await api('POST', `/boards/${board.id}/tasks`, ana.token, {
  title: 'Revisar layout',
});

const dir = mkdtempSync(join(tmpdir(), 'taskflow-anexos-'));
const png = join(dir, 'tela inicial.png');
const pdf = join(dir, 'briefing.pdf');
writeFileSync(
  png,
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  ),
);
writeFileSync(pdf, '%PDF-1.4 briefing');

const browser = await launch();
const page = await browser.newPage();
const errors = watchErrors(page);
const cardCount = () =>
  page
    .$eval(
      'app-task-card[data-task="Revisar layout"] [aria-label$="anexos"]',
      (e) => e.textContent.match(/[0-9]+/)?.[0],
    )
    .catch(() => '0');

try {
  await login(page, ana.email);
  await page.goto(`${APP}/boards/${board.id}?task=${task.id}`, {
    waitUntil: 'networkidle0',
  });
  await page.waitForSelector('[data-testid=attach-input]');

  const input = await page.$('[data-testid=attach-input]');
  await input.uploadFile(png, pdf);
  await page.waitForSelector('[data-attachment="briefing.pdf"]');
  t.ok(
    'lista os dois arquivos',
    !!(await page.$('[data-attachment="tela inicial.png"]')),
  );
  t.ok(
    'imagem ganha miniatura',
    await waitFor(
      page,
      () =>
        !!document.querySelector('[data-attachment="tela inicial.png"] img'),
    ),
  );
  t.ok(
    'card mostra 2 anexos',
    await waitFor(
      page,
      () =>
        document
          .querySelector(
            'app-task-card[data-task="Revisar layout"] [aria-label$="anexos"]',
          )
          ?.textContent.match(/[0-9]+/)?.[0] === '2',
    ),
  );

  // baixar o PDF busca o arquivo com o login
  const download = page.waitForResponse(
    (r) => r.url().includes('/file') && r.request().method() === 'GET',
  );
  await page.click('[data-attachment="briefing.pdf"] button.min-w-0');
  const res = await download;
  t.ok(
    'download autenticado do arquivo',
    res.status() === 200 &&
      res.headers()['content-disposition']?.startsWith('attachment'),
    res.status(),
  );

  // outra pessoa exclui pela API: some do painel e do card
  const list = await api('GET', `/tasks/${task.id}/attachments`, beto.token);
  const pdfId = list.find((a) => a.fileName === 'briefing.pdf').id;
  const status = await fetch(`${APP}/api/v1/attachments/${pdfId}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${beto.token}` },
  }).then((r) => r.status);
  t.ok('Beto não pode excluir o anexo da Ana', status === 403, status);
  await api('DELETE', `/attachments/${pdfId}`, ana.token);
  t.ok(
    'exclusão some do painel',
    await waitFor(
      page,
      () => !document.querySelector('[data-attachment="briefing.pdf"]'),
    ),
  );
  t.ok(
    'card volta para 1',
    await waitFor(
      page,
      () =>
        document
          .querySelector(
            'app-task-card[data-task="Revisar layout"] [aria-label$="anexos"]',
          )
          ?.textContent.match(/[0-9]+/)?.[0] === '1',
    ),
  );

  // anexo enviado por outra pessoa aparece ao vivo
  const form = new FormData();
  form.append('file', new Blob(['ola']), 'notas.txt');
  await fetch(`${APP}/api/v1/tasks/${task.id}/attachments`, {
    method: 'POST',
    headers: { authorization: `Bearer ${beto.token}` },
    body: form,
  });
  t.ok(
    'anexo do Beto aparece sem recarregar',
    await waitFor(
      page,
      () => !!document.querySelector('[data-attachment="notas.txt"]'),
    ),
  );
  await sleep(300);
  t.ok(
    'card conta sem duplicar',
    (await cardCount()) === '2',
    await cardCount(),
  );

  await page.click('[data-testid=history-tab]');
  t.ok(
    'histórico registra os anexos',
    await waitFor(page, () =>
      document
        .querySelector('[data-testid=history]')
        ?.innerText.includes('anexou briefing.pdf'),
    ),
  );
} catch (e) {
  await t.fail(e, page);
}

// o 403 da tentativa do Beto foi feito fora da página
t.ok('sem erros no console', errors.length === 0, errors);
await browser.close();
await api('DELETE', `/organizations/${org.id}`, ana.token);
t.done();
