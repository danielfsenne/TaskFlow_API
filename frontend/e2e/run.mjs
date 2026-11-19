// node e2e/run.mjs [filtro]  — roda os *.e2e.mjs em sequência
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('.', import.meta.url));
const filter = process.argv[2] ?? '';
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.e2e.mjs') && f.includes(filter))
  .sort();

try {
  const res = await fetch(
    `${process.env.E2E_APP_URL ?? 'http://localhost:4200'}/api/v1/health`,
  );
  if (!res.ok) throw new Error(String(res.status));
} catch (e) {
  console.error(
    'App ou API fora do ar. Suba o backend e o `ng serve` antes.',
    e.message,
  );
  process.exit(1);
}

const failed = files.filter(
  (f) =>
    spawnSync(process.execPath, [f], { cwd: dir, stdio: 'inherit' }).status !==
    0,
);
console.log(`\n${files.length - failed.length}/${files.length} suítes ok`);
if (failed.length) {
  console.log('falharam:', failed.join(', '));
  process.exit(1);
}
