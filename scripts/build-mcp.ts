import { build } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { mkdir, writeFile } from 'node:fs/promises';
const result = await build({
  configFile: false,
  plugins: [svelte()],
  build: {
    write: false,
    lib: { entry: 'src/mcp/main.ts', name: 'SmrtKitchenPlanner', formats: ['iife'] },
    cssCodeSplit: false,
  },
});
const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) => 'output' in r ? r.output : []);
const code = outputs.filter((o) => o.type === 'chunk').map((o) => o.code).join('\n');
const css = outputs.flatMap((o) => o.type === 'asset' && o.fileName.endsWith('.css') ? [o.source] : []).join('\n');
await mkdir('app', { recursive: true });
await writeFile('app/mcp.html', `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><main id="planner"></main><script>${code.replaceAll('</script', '<\\/script')}</script></body></html>`);
console.log('Wrote self-contained Planner resource: app/mcp.html');
