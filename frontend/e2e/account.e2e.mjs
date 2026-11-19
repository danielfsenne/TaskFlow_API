import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  api,
  APP,
  clickButton,
  launch,
  PASSWORD,
  register,
  sleep,
  suite,
  waitFor,
  waitText,
  watchErrors,
} from './support.mjs';

const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const t = suite('conta: recuperar senha e perfil');
const user = await register('Paula Perfil');

async function resetLink(email) {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
    );
    const { messages } = await res.json();
    if (messages?.length) {
      const msg = await (
        await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)
      ).json();
      return /(http\S+reset-password\?token=[0-9a-f]{64})/.exec(msg.Text)?.[1];
    }
    await sleep(250);
  }
  return null;
}

// PNG 1x1 em arquivo temporário, para o <input type=file>
const png = join(mkdtempSync(join(tmpdir(), 'taskflow-')), 'foto.png');
writeFileSync(
  png,
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  ),
);

const browser = await launch();
const page = await browser.newPage();
const errors = watchErrors(page);
async function replaceText(selector, text) {
  await page.click(selector);
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await page.keyboard.type(text);
}
const NEW_PASSWORD = 'SenhaNova456';
const FINAL_PASSWORD = 'SenhaFinal789';

try {
  // esqueci minha senha → e-mail → link → senha nova
  await page.goto(`${APP}/login`, { waitUntil: 'networkidle0' });
  await page.click('a[href="/forgot-password"]');
  await page.waitForSelector('input[formcontrolname=email]');
  await page.type('input[formcontrolname=email]', user.email);
  await clickButton(page, 'Enviar link');
  await page.waitForSelector('[data-testid=forgot-sent]');
  t.ok('confirma o envio sem revelar se a conta existe', true);

  const link = await resetLink(user.email);
  t.ok('e-mail chegou com o link', !!link, link);
  await page.goto(link.replace(/^http:\/\/[^/]+/, APP), {
    waitUntil: 'networkidle0',
  });
  await page.type('input[formcontrolname=password]', NEW_PASSWORD);
  await page.type('input[formcontrolname=confirm]', 'diferente1');
  await page.click('input[formcontrolname=password]');
  t.ok(
    'avisa quando as senhas não conferem',
    await waitFor(page, () =>
      document.body.innerText.includes('As senhas não conferem'),
    ),
  );
  await page.click('input[formcontrolname=confirm]', { clickCount: 3 });
  await page.type('input[formcontrolname=confirm]', NEW_PASSWORD);
  await clickButton(page, 'Salvar senha');
  await page.waitForFunction(() => location.pathname === '/login');
  t.ok('volta para o login', true);

  const old = await fetch(`${APP}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: PASSWORD }),
  });
  t.ok('senha antiga não entra mais', old.status === 401, old.status);

  await page.type('input[formcontrolname=email]', user.email);
  await page.type('input[formcontrolname=password]', NEW_PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => location.pathname === '/');
  t.ok('entra com a senha nova', true);

  // perfil
  // o botão muda de largura quando o nome carrega; clicar antes pega o sino
  await page.waitForFunction(() =>
    document
      .querySelector('[data-testid=user-menu]')
      ?.textContent.includes('Paula'),
  );
  await sleep(200);
  await page.click('[data-testid=user-menu]');
  await page.waitForSelector('a[href="/profile"]');
  await sleep(300);
  await page.click('a[href="/profile"]');
  // "Meu perfil" também é o texto do item do menu: espera a rota e o menu fechar
  await page.waitForFunction(
    () =>
      location.pathname === '/profile' &&
      !document.querySelector('.cdk-overlay-backdrop'),
  );
  await page.waitForSelector('input[formcontrolname=name]');

  const name = 'input[formcontrolname=name]';
  await replaceText(name, 'Paula Atualizada');
  await clickButton(page, 'Salvar nome');
  t.ok(
    'nome novo aparece no topo',
    await waitFor(page, () =>
      document
        .querySelector('[data-testid=user-menu]')
        ?.textContent.includes('Paula Atualizada'),
    ),
  );

  const input = await page.$('[data-testid=avatar-input]');
  await input.uploadFile(png);
  t.ok(
    'foto aparece no perfil e no topo',
    await waitFor(
      page,
      () =>
        !!document.querySelector('[data-testid=profile-avatar] img') &&
        !!document.querySelector('[data-testid=user-menu] app-avatar img'),
    ),
  );
  const me = await api('POST', '/auth/login', null, {
    email: user.email,
    password: NEW_PASSWORD,
  });
  t.ok(
    'API confirma nome e foto',
    me.user.name === 'Paula Atualizada' && !!me.user.avatarUrl,
    me.user,
  );

  await page.reload({ waitUntil: 'networkidle0' });
  t.ok(
    'foto continua após recarregar',
    await waitFor(
      page,
      () => !!document.querySelector('[data-testid=profile-avatar] img'),
    ),
  );
  await clickButton(page, 'Remover');
  t.ok(
    'remover volta para as iniciais',
    await waitFor(
      page,
      () => !document.querySelector('[data-testid=profile-avatar] img'),
    ),
  );

  // troca de senha logado: continua logado nesta aba
  await page.type('input[formcontrolname=current]', 'errada000');
  await page.type('input[formcontrolname=password]', FINAL_PASSWORD);
  await page.type('input[formcontrolname=confirm]', FINAL_PASSWORD);
  await clickButton(page, 'Trocar senha');
  t.ok(
    'senha atual errada é recusada',
    await waitText(page, 'Senha atual incorreta').then(
      () => true,
      () => false,
    ),
  );
  await replaceText('input[formcontrolname=current]', NEW_PASSWORD);
  await clickButton(page, 'Trocar senha');
  t.ok(
    'senha trocada',
    await waitText(page, 'Senha alterada').then(
      () => true,
      () => false,
    ),
  );
  await page.reload({ waitUntil: 'networkidle0' });
  t.ok(
    'sessão desta aba continua válida',
    page.url().endsWith('/profile'),
    page.url(),
  );
} catch (e) {
  await t.fail(e, page);
}

// 400 da senha atual errada é esperado
const unexpected = errors.filter((e) => !e.includes('400'));
t.ok('sem erros no console', unexpected.length === 0, unexpected);
await browser.close();
t.done();
