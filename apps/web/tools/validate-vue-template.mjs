import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(here, '../../api/package.json'));
const { compile } = require('@vue/compiler-dom');
const htmlPath = path.resolve(here, '../index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const rootStart = html.indexOf('<div id="app"');
if (rootStart < 0) throw new Error('Vue root #app was not found in apps/web/index.html');

let i = rootStart;
let divDepth = 0;
let rootEnd = -1;
while (i < html.length) {
  if (html.startsWith('<!--', i)) {
    const end = html.indexOf('-->', i + 4);
    i = end < 0 ? html.length : end + 3;
    continue;
  }
  if (html[i] !== '<') { i++; continue; }
  let j = i + 1;
  let quote = '';
  while (j < html.length) {
    const char = html[j];
    if (quote) {
      if (char === quote) quote = '';
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '>') {
      break;
    }
    j++;
  }
  if (j >= html.length) break;
  const tag = html.slice(i, j + 1);
  const match = tag.match(/^<\s*(\/?)\s*([a-z][\w:-]*)/i);
  if (match && match[2].toLowerCase() === 'div') {
    if (match[1]) {
      divDepth--;
      if (divDepth === 0) { rootEnd = j + 1; break; }
    } else if (!/\/\s*>$/.test(tag)) {
      divDepth++;
    }
  }
  i = j + 1;
}
if (rootEnd < 0) throw new Error('Could not find the closing tag for Vue root #app');

const template = html.slice(rootStart, rootEnd);
const errors = [];
compile(template, {
  mode: 'function',
  onError(error) { errors.push(error); }
});
if (errors.length) {
  const details = errors.map(error => {
    const line = error.loc?.start?.line ?? '?';
    const column = error.loc?.start?.column ?? '?';
    return `line ${line}, column ${column}: ${error.message}; source=${JSON.stringify(error.loc?.source?.slice(0,180) || '')}`;
  });
  throw new Error('Vue template compilation failed:\\n' + details.join('\\n'));
}
console.log('Vue template compilation passed for #app using @vue/compiler-dom 3.5.39.');
