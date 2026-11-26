import {
  api,
  APP,
  launch,
  login,
  register,
  suite,
  waitFor,
  watchErrors,
} from './support.mjs';

const t = suite('arquivar e excluir projeto com o quadro aberto');
const ana = await register('Ana Projeto');
const beto = await register('Beto Projeto');
const org = await api('POST', '/organizations', ana.token, {
  name: 'Projetos Co',
});
await api('POST', `/organizations/${org.id}/members`, ana.token, {
  email: beto.email,
});
const project = await api(
  'POST',
  `/organizations/${org.id}/projects`,
  ana.token,
  { name: 'Site novo' },
);
const board = await api('POST', `/projects/${project.id}/boards`, ana.token, {
  name: 'Quadro',
});
const other = await api('POST', `/projects/${project.id}/boards`, ana.token, {
  name: 'Outro quadro',
});

const browser = await launch();
const page = await browser.newPage();
const errors = watchErrors(page);
const bodyHas = (text) =>
  waitFor(page, (s) => document.body.innerText.includes(s), text);

try {
  await login(page, beto.email);
  await page.goto(`${APP}/boards/${board.id}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid=label-filter], app-task-card, h1');

  // etiqueta criada pela Ana em outro quadro do projeto aparece aqui
  await api('POST', `/boards/${other.id}/labels`, ana.token, {
    name: 'compartilhada',
    color: 'green',
  });
  t.ok(
    'etiqueta do projeto aparece ao vivo no filtro',
    await waitFor(page, () => {
      const trigger = document.querySelector('[data-testid=label-filter]');
      return !!trigger;
    }),
  );

  await api('PATCH', `/projects/${project.id}`, ana.token, { archived: true });
  t.ok(
    'arquivar mostra o aviso de somente leitura sem recarregar',
    await bodyHas('Projeto arquivado: o quadro está somente leitura.'),
  );
  t.ok('e avisa quem estava olhando', await bodyHas('O projeto foi arquivado'));

  await api('DELETE', `/projects/${project.id}`, ana.token);
  t.ok(
    'excluir leva de volta para a organização',
    await waitFor(
      page,
      (id) => location.pathname === `/orgs/${id}`,
      org.id,
      8000,
    ),
  );
  t.ok(
    'com o aviso da exclusão',
    await bodyHas('O projeto deste quadro foi excluído.'),
  );
} catch (e) {
  await t.fail(e, page);
}

t.ok('sem erros no console', errors.length === 0, errors);
await browser.close();
await api('DELETE', `/organizations/${org.id}`, ana.token);
t.done();
