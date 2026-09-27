import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

const root = resolve('dist/web');
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await inspect(path);
      continue;
    }
    assert.ok(!entry.name.endsWith('.map'), 'Sourcemap público inesperado');
    if (!/\.(js|html|json|css)$/.test(entry.name)) continue;
    const content = await readFile(path, 'utf8');
    for (const secret of [
      'game.acronyms',
      'game.frameworks',
      'game.code_snippets',
      'source_code',
      'editorial_key',
      'Software as a Service',
      'const scores = [',
    ]) {
      assert.ok(
        !content.includes(secret),
        `Conteúdo privado encontrado no build público: ${secret}`,
      );
    }
  }
}
await inspect(root);
console.log('Build público verificado: sem catálogo, relações SQL, gabaritos ou sourcemaps.');
