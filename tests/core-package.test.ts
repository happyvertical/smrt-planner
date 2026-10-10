import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, expect, it } from 'vitest';

/**
 * `./core` must run in plain Node: packaged by svelte-package (as `pnpm
 * package` does) and imported by a bare `node` process, with no Vite, no
 * Svelte compiler and no workspace resolution.
 */
const root = resolve(import.meta.dirname, '..');
let out = '';

beforeAll(() => {
  out = mkdtempSync(join(tmpdir(), 'planner-core-'));
  execFileSync(
    'pnpm',
    [
      'exec',
      'svelte-package',
      '-i',
      'src/lib',
      '-o',
      out,
      '--tsconfig',
      'tsconfig.package.json',
    ],
    { cwd: root, stdio: 'pipe' },
  );
}, 120_000);

afterAll(() => rmSync(out, { recursive: true, force: true }));

it('maps ./core and ./app in the package exports', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  expect(pkg.exports['./core'].default).toBe('./dist/core/index.js');
  expect(pkg.exports['./app'].default).toBe('./dist/core/app.js');
  expect(pkg.exports['./app/*']).toBe('./app/*');
  expect(pkg.files).toEqual(expect.arrayContaining(['dist', 'app']));
});

it('imports and runs under plain Node', () => {
  const entry = pathToFileURL(join(out, 'core', 'index.js')).href;
  const script = `
    const core = await import(${JSON.stringify(entry)});
    const snapshot = {
      version: 1, revision: 1, app: { name: 'my-app', cookbook: null },
      recipes: [], features: [], unavailable: [],
      settings: { currency: 'USD', taxRate: 0, paymentTerms: '' },
      theme: { text: 'smrt', preset: null, primary: null, colorScheme: 'system' },
      sections: [], focus: { tab: null, section: null }, policies: 0, undo: [],
    };
    const prompt = core.buildHostPrompt({ message: 'I run a bakery', snapshot });
    const parsed = core.parseHostReply('{"reply":"ok","add":["commerce.invoicing"]}');
    console.log(JSON.stringify({
      tools: core.commandTools.length,
      schemas: Object.keys(core.commandSchemas).length,
      recipes: core.recipes.length,
      cookbooks: core.libraryCookbooks.length,
      system: prompt.system.includes('You help assemble a small business app'),
      last: prompt.messages.at(-1),
      add: parsed.reply.add,
      schema: core.replySchema.type,
    }));
  `;
  const stdout = execFileSync(
    process.execPath,
    ['--input-type=module', '-e', script],
    { cwd: out, encoding: 'utf8' },
  );
  const result = JSON.parse(stdout.trim().split('\n').at(-1) ?? '{}');
  expect(result.tools).toBe(19);
  expect(result.schemas).toBe(19);
  expect(result.recipes).toBeGreaterThan(10);
  expect(result.cookbooks).toBeGreaterThan(0);
  expect(result.system).toBe(true);
  expect(result.last).toEqual({ role: 'user', content: 'I run a bakery' });
  expect(result.add).toEqual(['commerce.invoicing']);
  expect(result.schema).toBe('object');
});

it('locates the packaged app directory', async () => {
  const mod = await import(pathToFileURL(join(out, 'core', 'app.js')).href);
  expect(mod.appDir.endsWith('/app/')).toBe(true);
  expect(mod.appFile('index.html').endsWith('/app/index.html')).toBe(true);
});
