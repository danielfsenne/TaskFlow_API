import {
  api,
  APP,
  clickButton,
  emailFor,
  launch,
  login,
  PASSWORD,
  register,
  sleep,
  suite,
  waitFor,
  waitText,
  watchErrors,
} from './support.mjs';

const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const t = suite('convite por e-mail');
const ana = await register('Ana Convite');
const org = await api('POST', '/organizations', ana.token, {
  name: 'Convites Ltda',
});
const guestEmail = emailFor('convidada');

async function inviteLink(email) {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
    );
    const { messages } = await res.json();
    if (messages?.length) {
      const msg = await (
        await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)
      ).json();
      return /(http\S+invite\?token=[0-9a-f]{64})/.exec(msg.Text)?.[1];
    }
    await sleep(250);
  }
  return null;
}

const browser = await launch();
const page = await browser.newPage();
const errors = watchErrors(page);
let guestPage;

try {
  await login(page, ana.email);
  await page.goto(`${APP}/orgs/${org.id}`, { waitUntil: 'networkidle0' });
  const [tab] = await page.$$(
    'xpath/.//div[@role="tab"][contains(., "Membros")]',
  );
  await tab.click();
  await page.waitForSelector('input[type=email]');
  await page.type('input[type=email]', guestEmail);
  await clickButton(page, 'Adicionar');
  await page.waitForSelector('app-confirm-dialog');
  t.ok(
    'oferece convite quando o e-mail não tem conta',
    (await page.$eval('app-confirm-dialog', (e) => e.innerText)).includes(
      guestEmail,
    ),
  );
  await clickButton(page, 'Enviar convite', 'app-confirm-dialog');
  t.ok(
    'convite aparece como pendente',
    await waitFor(
      page,
      (e) => !!document.querySelector(`[data-invite="${e}"]`),
      guestEmail,
    ),
  );

  const link = await inviteLink(guestEmail);
  t.ok('e-mail do convite chegou', !!link, link);

  // a convidada, em outra sessão, sem conta
  const context = await browser.createBrowserContext();
  guestPage = await context.newPage();
  guestPage.errors = watchErrors(guestPage, 'convidada: ');
  await guestPage.goto(link.replace(/^http:\/\/[^/]+/, APP), {
    waitUntil: 'networkidle0',
  });
  await waitText(guestPage, 'Convite para Convites Ltda');
  t.ok(
    'tela do convite mostra quem convidou',
    (
      await guestPage.$eval('[data-testid=invite]', (e) => e.innerText)
    ).includes('Ana Convite convidou'),
  );

  await clickButton(guestPage, 'Criar conta e aceitar');
  await guestPage.waitForFunction(() => location.pathname === '/register');
  await guestPage.waitForSelector('input[formcontrolname=name]');
  await sleep(200);
  t.ok(
    'cadastro já vem com o e-mail convidado',
    (await guestPage.$eval('input[formcontrolname=email]', (e) => e.value)) ===
      guestEmail,
  );
  await guestPage.type('input[formcontrolname=name]', 'Carla Convidada');
  await guestPage.type('input[formcontrolname=password]', PASSWORD);
  await clickButton(guestPage, 'Criar conta');
  await guestPage.waitForFunction(() => location.pathname === '/invite');
  t.ok('volta para o convite depois do cadastro', true);

  // a página recarrega o convite ao voltar do cadastro
  await waitText(guestPage, 'Entrar na organização');
  await clickButton(guestPage, 'Entrar na organização');
  await guestPage.waitForFunction(
    (id) => location.pathname === `/orgs/${id}`,
    {},
    org.id,
  );
  t.ok('entra na organização', true);
  t.ok(
    'organização aparece na barra lateral',
    await waitFor(guestPage, () =>
      document
        .querySelector('[data-testid=sidebar]')
        ?.innerText.includes('Convites Ltda'),
    ),
  );

  await page.reload({ waitUntil: 'networkidle0' });
  const [tab2] = await page.$$(
    'xpath/.//div[@role="tab"][contains(., "Membros")]',
  );
  await tab2.click();
  await waitText(page, 'Carla Convidada');
  t.ok('Ana vê a nova membro', true);
  t.ok(
    'convite sai da lista de pendentes',
    !(await page.$(`[data-invite="${guestEmail}"]`)),
  );
} catch (e) {
  await t.fail(e, guestPage ?? page);
}

if (guestPage) errors.push(...guestPage.errors);
// o 404 de adicionar alguém sem conta é o que oferece o convite
const unexpected = errors.filter((e) => !e.includes('404'));
t.ok('sem erros no console', unexpected.length === 0, unexpected);
await browser.close();
await api('DELETE', `/organizations/${org.id}`, ana.token);
t.done();
