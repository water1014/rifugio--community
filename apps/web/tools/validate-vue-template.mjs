import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(here, '../../api/package.json'));
const { compile } = require('@vue/compiler-dom');
const parse5 = require('parse5');
const htmlPath = path.resolve(here, '../index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// WebView compiles the browser-parsed DOM, not the raw source string.
// HTML5 parsing can repair invalid nesting and move nodes, which may break
// adjacency-sensitive Vue directives such as v-if / v-else.
const document = parse5.parse(html);
function findApp(node) {
  if (node.tagName === 'div' && node.attrs?.some(attr => attr.name === 'id' && attr.value === 'app')) return node;
  for (const child of node.childNodes || []) {
    const found = findApp(child);
    if (found) return found;
  }
  return null;
}
const appRoot = findApp(document);
if (!appRoot) throw new Error('Vue root #app was not found after HTML5 parsing');

const template = parse5.serialize(appRoot);
const errors = [];
compile(template, {
  mode: 'function',
  onError(error) { errors.push(error); }
});
if (errors.length) {
  const details = errors.map(error => {
    const line = error.loc?.start?.line ?? '?';
    const column = error.loc?.start?.column ?? '?';
    return `line ${line}, column ${column}: ${error.message}; source=${JSON.stringify(error.loc?.source?.slice(0, 180) || '')}`;
  });
  throw new Error('Browser-normalized Vue template compilation failed:\\n' + details.join('\\n'));
}
console.log('Browser-normalized #app template compilation passed with HTML5 parser + Vue compiler 3.5.39.');
