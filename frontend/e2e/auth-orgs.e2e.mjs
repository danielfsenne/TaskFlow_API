import {
  APP,
  clickButton,
  emailFor,
  launch,
  register,
  sleep,
  suite,
  waitText,
  watchErrors,
  PASSWORD,
} from './support.mjs';

const t = suite('cadastro, sessão, organizações e membros');
const colleague = await register('Colega Teste');
const browser = await launch();
const page = await browser.newPage();
const errors = watchErrors(page);
const text = () => page.evaluate(() => document.body.innerText);
async function fill(selector, value) {
  await page.waitForSelector(selector);
  await page.click(selector, { clickCount: 3 });
  await page.type(selector, value);
}

try {
  await page.goto(`${APP}/orgs/qualquer`, { waitUntil: 'networkidle0' });
  t.ok(
    'sem sessão vai para o login',
    page.url().includes('/login'),
    page.url(),
  );
  t.ok('guarda returnUrl', page.url().includes('returnUrl'), page.url());

  await fill('input[formcontrolname=email]', 'ninguem@e2e.taskflow.dev');
  await fill('input[formcontrolname=password]', 'errada123');
  await clickButton(page, 'Entrar');
  await page.waitForSelector('[role=alert]');
  t.ok('erro de login aparece', /inválid|Credenciais/.test(await text()));

  await page.goto(`${APP}/register`, { waitUntil: 'networkidle0' });
  await fill('input[formcontrolname=name]', 'Daniel Teste');
  await fill('input[formcontrolname=email]', emailFor('daniel'));
  await fill('input[formcontrolname=password]', PASSWORD);
  await clickButton(page, 'Criar conta');
  await waitText(page, 'ainda não participa');
  t.ok(
    'após o cadastro vai para o início',
    page.url() === `${APP}/`,
    page.url(),
  );

  await page.reload({ waitUntil: 'networkidle0' });
  t.ok(
    'sessão sobrevive a recarregar',
    page.url() === `${APP}/` && (await text()).includes('Daniel Teste'),
  );

  await clickButton(page, 'Nova organização');
  await page.waitForSelector('mat-dialog-container input');
  await page.type('mat-dialog-container input', 'Empresa Visual');
  await page.keyboard.press('Enter');
  await waitText(page, 'Novo projeto');
  t.ok('abre a organização criada', page.url().includes('/orgs/'), page.url());
  t.ok(
    'organização aparece na barra lateral',
    await page.$eval('[data-testid=sidebar]', (e) =>
      e.innerText.includes('Empresa Visual'),
    ),
  );

  const [tab] = await page.$$(
    'xpath/.//div[@role="tab"][contains(., "Membros")]',
  );
  await tab.click();
  await page.waitForSelector('input[type=email]');
  await page.type('input[type=email]', colleague.email);
  await clickButton(page, 'Adicionar');
  await waitText(page, 'Colega Teste');
  t.ok('membro adicionado aparece', (await text()).includes(colleague.email));

  await page.goto(`${APP}/`, { waitUntil: 'networkidle0' });
  await waitText(page, 'Empresa Visual');
  t.ok('organização listada no início', true);

  await page.click('[data-testid=user-menu]');
  await page.waitForSelector('.mat-mdc-menu-panel button[mat-menu-item]');
  await sleep(300); // animação do menu
  await clickButton(page, 'Sair', 'div[contains(@class,"mat-mdc-menu-panel")]');
  await page.waitForFunction(() => location.pathname === '/login');
  await page.reload({ waitUntil: 'networkidle0' });
  t.ok(
    'após sair, recarregar continua no login',
    page.url().includes('/login'),
  );
} catch (e) {
  await t.fail(e, page);
}

// o 401 do login com senha errada é esperado
const unexpected = errors.filter((e) => !e.includes('401'));
t.ok('sem erros no console', unexpected.length === 0, unexpected);
await browser.close();
t.done();
