import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

export const APP = process.env.E2E_APP_URL ?? 'http://localhost:4200';
export const API = `${APP}/api/v1`;
export const PASSWORD = 'senha12345';
const OUTPUT = fileURLToPath(new URL('./.output/', import.meta.url));

const CHROME_PATHS = {
  win32: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  linux: '/usr/bin/google-chrome',
};

const run = Date.now().toString(36);
export const emailFor = (name) => `${name}.${run}@e2e.taskflow.dev`;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const inDays = (d) => new Date(Date.now() + d * 86400000).toISOString();

export async function api(method, path, token, body) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token && { authorization: `Bearer ${token}` }),
    },
    body: body && JSON.stringify(body),
  });
  if (res.status >= 400) {
    throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  }
  return res.status === 204 ? null : res.json();
}

export async function register(name) {
  const email = emailFor(name.split(' ')[0].toLowerCase());
  const res = await api('POST', '/auth/register', null, {
    name,
    email,
    password: PASSWORD,
  });
  return { ...res.user, email, token: res.accessToken };
}

export function launch(viewport = { width: 1360, height: 880 }) {
  return puppeteer.launch({
    executablePath: process.env.CHROME_PATH ?? CHROME_PATHS[process.platform],
    headless: process.env.E2E_HEADFUL ? false : true,
    defaultViewport: viewport,
  });
}

// erros de console e de página entram como falha no fim
export function watchErrors(page, prefix = '') {
  const errors = [];
  page.on(
    'console',
    (m) => m.type() === 'error' && errors.push(prefix + m.text()),
  );
  page.on('pageerror', (e) => errors.push(prefix + e.message));
  return errors;
}

export async function login(page, email) {
  await page.goto(`${APP}/login`, { waitUntil: 'networkidle0' });
  await page.type('input[formcontrolname=email]', email);
  await page.type('input[formcontrolname=password]', PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => location.pathname === '/');
}

export const waitFor = (page, fn, arg, timeout = 6000) =>
  page.waitForFunction(fn, { timeout }, arg).then(
    () => true,
    () => false,
  );

export const waitText = (page, text, timeout = 8000) =>
  page.waitForFunction(
    (t) => document.body.innerText.includes(t),
    { timeout },
    text,
  );

export async function clickButton(page, label, scope = '') {
  const [btn] = await page.$$(
    `xpath/.//${scope ? scope + '//' : ''}*[self::button or self::a or self::mat-option][contains(normalize-space(.), "${label}")]`,
  );
  if (!btn) throw new Error(`botão não encontrado: ${label}`);
  await btn.click();
}

// arrasta em passos: o CDK só reage a movimento contínuo
export async function drag(page, fromSelector, to) {
  const box = await (await page.waitForSelector(fromSelector)).boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + Math.min(box.height / 2, 14);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 5, y + 5, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 20 });
  await sleep(150);
  await page.mouse.up();
  await sleep(600);
}

export async function boxOf(page, selector) {
  return (await page.waitForSelector(selector)).boundingBox();
}

export function suite(name) {
  let passed = 0;
  const failures = [];
  console.log(`\n${name}`);
  return {
    ok(label, cond, detail) {
      if (cond) passed++;
      else {
        failures.push(label);
        console.log(
          `  ✗ ${label}`,
          detail === undefined ? '' : JSON.stringify(detail),
        );
      }
    },
    async fail(error, page) {
      failures.push('exceção');
      console.log(`  ✗ ${error.message}`);
      if (page) {
        mkdirSync(OUTPUT, { recursive: true });
        const file = join(OUTPUT, `${name.replace(/\W+/g, '-')}.png`);
        await page.screenshot({ path: file }).catch(() => {});
        console.log(`    captura: ${file}`);
      }
    },
    done() {
      console.log(`  ${passed} ok, ${failures.length} falha(s)`);
      process.exitCode = failures.length ? 1 : 0;
    },
  };
}
