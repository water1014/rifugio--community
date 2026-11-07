const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../../..');
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
  assert.match(studio, /secretSaved = window\.NidoNative\.setSecret\('talk_nai_api_key', key\) === true/);
  assert.match(studio, /NovelAI 密钥未能写入 Android 安全存储/);
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
  assert.match(native, /imageUrls/);
  assert.match(native, /interceptNidoImage/);
  assert.match(native, /nido-images/);
  assert.match(native, /只允许 HTTPS NAI 接口地址/);
  assert.match(native, /setInstanceFollowRedirects\(false\)/);
});

test('NAI image files remain available to older chat messages and ZIP errors keep HTTP diagnostics', () => {
  assert.match(native, /Keep generated images for old chat attachments/);
  assert.doesNotMatch(native, /existing\.length >= 200/);
  assert.match(native, /result\.put\("status", responseStatus\)/);
  assert.match(native, /Content-Type: /);
  assert.match(native, /Content-Length: /);
  assert.match(native, /已读取: /);
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

test('NAI tool-call incompatibility falls back to ordinary provider chat', () => {
  assert.match(stream, /const sendProviderPayload = async \(payload\)/);
  assert.match(stream, /Some OpenAI-compatible models do not implement function calling/);
  assert.match(stream, /delete providerPayload\.tools/);
  assert.match(stream, /\[400, 404, 422\]\.includes\(Number\(r\.status\)\)/);
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

test('Android proactive worker receives fresh context after chat saves', () => {
  assert.match(talk, /let nidoProactiveContextSyncTimer = null/);
  assert.match(talk, /window\.NidoNative\?\.setProactiveContext/);
  assert.match(talk, /syncNidoProactiveContext\(current\)/);
  assert.match(talk, /}, 700\);/);
  assert.match(native, /setProactiveContext\(String rawContext\)/);
  assert.ok(native.includes('scheduleNidoProactiveWork(config.optBoolean("enabled", false)'));
});

test('chat context updates do not keep postponing Android proactive work', () => {
  const start = native.indexOf('@JavascriptInterface public void setProactiveContext(String rawContext)');
  const end = native.indexOf('@JavascriptInterface public String takePendingProactiveMessages()', start);
  assert.ok(start >= 0 && end > start, 'setProactiveContext bridge method should exist');
  const contextMethod = native.slice(start, end);
  assert.ok(contextMethod.includes('putString(NidoProactiveWorker.KEY_CONTEXT'));
  assert.ok(contextMethod.includes('putLong(NidoProactiveWorker.KEY_NEXT_DUE, 0)'));
  assert.ok(!contextMethod.includes('scheduleNidoProactiveWork'));
  assert.ok(native.includes('enqueueUniquePeriodicWork'));
});

test('NovelAI locked character presets override model guesses and work on older models', () => {
  assert.match(studio, /const lockedCharacters = preset\?\.lockCharacters && presetChars\.length \? presetChars : null/);
  assert.match(studio, /const characters = lockedCharacters \|\| requestedCharacters/);
  assert.match(studio, /\.\.\.\(!isV4Model \? characters : \[\]\)/);
  assert.match(studio, /if \(isV4Model\) \{/);
});

test('active conversation watcher is registered only after activeConvo initialization', () => {
  const declaration = talk.indexOf('const activeConvo = Vue.computed(');
  const watcher = talk.indexOf('Vue.watch(() => activeConvo.value?.id');
  assert.ok(declaration >= 0, 'activeConvo must be declared');
  assert.ok(watcher > declaration, 'activeConvo watcher must be registered after declaration');
});
