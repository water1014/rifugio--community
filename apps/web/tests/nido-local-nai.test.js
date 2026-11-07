const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const studio = read('apps/web/js/apps/18-talk-image.js');
const stream = read('apps/web/js/apps/18-talk-stream.js');
const talk = read('apps/web/js/apps/18-talk.js');
const html = read('apps/web/index.html');
const native = read('android-shell/app/src/main/java/app/rifugio/shell/MainActivity.java');

test('Nido Android uses local NovelAI configuration and encrypted key storage', () => {
  assert.match(studio, /nido-local-image-config-v1/);
  assert.match(studio, /saveNidoImageConfig/);
  assert.match(studio, /setSecret\('talk_nai_api_key'/);
  assert.match(studio, /loadImageConfig = async \(\) => \{\s*if \(imageStudio\.localMode\)/);
  assert.match(studio, /saveImageServer = async \(\) => \{\s*if \(imageStudio\.localMode\)/);
  assert.match(html, /:disabled="imageStudio\.localMode"/);
  assert.match(html, /v-if="!imageStudio\.localMode" value="openai-image"/);
});

test('NovelAI requests are sent from Android and ZIP images are extracted natively', () => {
  assert.match(studio, /generateNaiImageForChat/);
  assert.match(studio, /postNaiImage\(endpoint/);
  assert.match(studio, /https:\/\/image\.novelai\.net/);
  assert.match(native, /@JavascriptInterface public void postNaiImage/);
  assert.match(native, /new ZipInputStream/);
  assert.match(native, /extractNaiImages/);
  assert.match(native, /imageDataUrls/);
  assert.match(native, /只允许 HTTPS NAI 接口地址/);
  assert.match(native, /setInstanceFollowRedirects\(false\)/);
});

test('NAI prompt presets and generated images remain local', () => {
  assert.match(studio, /saveNidoImageConfig\(\);\s*imageStudio\.saveStatus = '画师预设已保存到本机/);
  assert.match(studio, /nido-nai-gallery-v1/);
  assert.match(studio, /saveLatestNaiImages/);
  assert.match(talk, /localImageStoredInIndexedDB/);
  assert.match(talk, /dataUrl:item\?\.dataUrl \|\| oldItem\?\.dataUrl/);
});

test('local API chat exposes a NovelAI function tool and attaches generated images', () => {
  assert.match(stream, /NIDO_NAI_CHAT_TOOL/);
  assert.match(stream, /tool_choice:'auto'/);
  assert.match(stream, /msg\.tool_calls/);
  assert.match(stream, /generateNaiImageForChat\(/);
  assert.match(stream, /kind:'image'/);
});

test('changed Nido JavaScript modules parse successfully', () => {
  for (const [name, source] of [
    ['18-talk-image.js', studio],
    ['18-talk-stream.js', stream],
    ['18-talk.js', talk],
  ]) {
    assert.doesNotThrow(() => new vm.Script(source), name + ' must parse');
  }
});
