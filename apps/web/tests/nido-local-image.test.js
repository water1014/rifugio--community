const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const image = fs.readFileSync(path.join(root, 'js/apps/18-talk-image.js'), 'utf8');
const stream = fs.readFileSync(path.join(root, 'js/apps/18-talk-stream.js'), 'utf8');
const talk = fs.readFileSync(path.join(root, 'js/apps/18-talk.js'), 'utf8');
const native = fs.readFileSync(path.resolve(root, '../../android-shell/app/src/main/java/app/rifugio/shell/MainActivity.java'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('Nido local image generation uses NovelAI directly without the app backend', () => {
  assert.match(image, /generateNaiImageForChat/);
  assert.match(image, /window\.NidoNativeHttp\?\.postNaiImage/);
  assert.match(image, /\/ai\/generate-image/);
  assert.match(image, /Authorization:\s*'Bearer '\s*\+\s*key/);
  assert.match(image, /saveLatestNaiImages\(images, payload\.input\)/);
  assert.match(image, /talkSettings\.imageProvider = 'novelai'/);
});

test('native NAI ZIP response is decoded into persistent local image URLs', () => {
  assert.match(native, /extractNaiImages\(response\)/);
  assert.match(native, /result\.put\("imageUrls", urls\)/);
  assert.match(stream, /imageUrls:Array\.isArray\(envelope\.imageUrls\)/);
  assert.match(stream, /imageDataUrl:String\(envelope\.imageDataUrl \|\| ''\)/);
  assert.match(image, /response\.imageUrls/);
});

test('local image settings and gallery restore without server calls', () => {
  assert.match(image, /if \(imageStudio\.localMode\) \{/);
  assert.match(image, /NIDO_IMAGE_CONFIG_LS/);
  assert.match(image, /restoreLatestNaiImages\(\)/);
  assert.match(image, /nido-nai-gallery-v1/);
  assert.match(html, /18-talk-image\.js\?v=nido-local-nai-20261107/);
});

test('full local chat snapshot is not overwritten before IndexedDB restore completes', () => {
  assert.match(talk, /let nidoLocalRestoreReady = !Boolean\(window\.NidoNative\)/);
  assert.match(talk, /if \(!isNidoLocalApp\(\) \|\| !nidoLocalRestoreReady\) return/);
  assert.match(talk, /finally\s*\{\s*\/\/ Even an empty database[\s\S]*?nidoLocalRestoreReady = true;\s*saveTalk\(\);/);
});
