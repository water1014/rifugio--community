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

test('Nido Android is a standalone local-first app and does not require a hosted backend', () => {
  const manifest = read('android-shell/app/src/main/AndroidManifest.xml');
  const gradle = read('android-shell/app/build.gradle');
  const workflow = read('.github/workflows/android-apk.yml');
  const proactive = read('android-shell/app/src/main/java/app/rifugio/shell/NidoProactiveWorker.java');
  const lock = read('apps/web/js/04-lock-screen.js');

  assert.match(native, /LOCAL_APP_URL = "https:\/\/appassets\.androidplatform\.net\/index\.html"/);
  assert.match(native, /webView\.loadUrl\(LOCAL_APP_URL\)/);
  assert.match(native, /prefs\.edit\(\)\.putString\(KEY_SERVER, LOCAL_APP_URL\)/);
  assert.match(native, /interceptPackagedAsset\(uri\)/);
  assert.match(workflow, /cp -R apps\/web\/. android-shell\/app\/src\/main\/assets\//);
  assert.match(talk, /const NIDO_LOCAL_DB_NAME = 'nido-local-data-v1'/);
  assert.match(talk, /if \(isNidoLocalApp\(\)\) return Promise\.resolve\(\)/);
  assert.match(proactive, /https:\/\/opencode\.ai\/zen\/go/);
  assert.match(proactive, /Authorization/);
  assert.match(native, /SECRET_KEY_ALIAS = "nido_android_secret_key_v1"/);
  assert.match(lock, /hostname === 'appassets\.androidplatform\.net'/);
  assert.doesNotMatch(manifest, /INTERNET.*required="true"/);
  assert.match(gradle, /androidx\.work:work-runtime/);
});

test('standalone Nido memory buckets are stored and managed locally without server calls', () => {
  const memoria = read('apps/web/js/apps/15-memoria.js');
  assert.match(memoria, /NIDO_LOCAL_MEMORY_KEY = 'nido-local-memory-v1'/);
  assert.match(memoria, /const readLocalMemories = \(\) =>/);
  assert.match(memoria, /const writeLocalMemories = \(items\) =>/);
  assert.match(memoria, /const saveLocalMemory = \(item\) =>/);
  assert.match(memoria, /if \(isNidoLocalMemory\(\)\) \{[\s\S]*?refreshLocalMemoryState\(\);[\s\S]*?return;/);
  assert.match(memoria, /if \(isNidoLocalMemory\(\)\) \{[\s\S]*?bucket_type:'feel'[\s\S]*?return;/);
  assert.match(memoria, /本地记忆已启用。自动 Dream 整理尚未接入本地模型流程/);
  assert.match(memoria, /if \(isNidoLocalMemory\(\)\) \{[\s\S]*?readLocalMemories\(\)\.filter/);
  assert.match(memoria, /本地导入只接受结构化 JSON 记忆文件/);
});

test('Android WebView supports local JSON file import through the system picker', () => {
  assert.match(native, /import android\.webkit\.ValueCallback;/);
  assert.match(native, /onShowFileChooser\(WebView view, ValueCallback<Uri\[\]> callback/);
  assert.match(native, /WebChromeClient\.FileChooserParams\.parseResult/);
  assert.match(native, /FILE_CHOOSER_REQUEST_CODE/);
});

test('standalone Nido keeps favorite chat quotes and profile local', () => {
  const exporter = read('apps/web/js/apps/18-talk-export.js');
  assert.match(exporter, /NIDO_LOCAL_QUOTES_KEY = 'nido-local-favorite-quotes-v1'/);
  assert.match(exporter, /const readNidoLocalQuotes = \(\) =>/);
  assert.match(exporter, /if \(window\.NidoNative\) \{[\s\S]*?readNidoLocalQuotes\(\)/);
  assert.match(exporter, /已收藏到本机摘句/);
  assert.match(talk, /if \(!savedTalkProfile && !isNidoLocalApp\(\)\)/);
});

test('standalone Nido moments and AI stickers stay on-device', () => {
  const moments = read('apps/web/js/apps/18-talk-moments.js');
  const stickers = read('apps/web/js/apps/18-talk-stickers.js');
  assert.match(moments, /if \(window\.NidoNative\) \{[\s\S]*?writeTalkMomentsLocal\(\)/);
  assert.match(moments, /if \(!window\.NidoNative\) \{[\s\S]*?fetch\('\/api\/talk\/moments/);
  assert.match(stickers, /NIDO_LOCAL_AI_STICKERS_KEY = 'nido-local-ai-stickers-v1'/);
  assert.match(stickers, /const persistLocalAiStickers = \(\) =>/);
  assert.match(stickers, /category:String\(s\.category \|\| '未分类'\)/);
  assert.match(stickers, /if \(window\.NidoNative\) \{[\s\S]*?persistLocalAiStickers\(\)/);
  assert.match(stickers, /if \(window\.NidoNative\) \{ persistLocalAiStickers\(\); return; \}/);
});

test('standalone Nido voice uses device speech and skips hosted speech endpoints', () => {
  const voice = read('apps/web/js/apps/18-talk-voice.js');
  const call = read('apps/web/js/apps/18-talk-call.js');
  assert.match(voice, /const speakNidoSystemVoice = \(text\) => new Promise/);
  assert.match(voice, /if \(window\.NidoNative\) return '';/);
  assert.match(voice, /if \(window\.NidoNative\) return 'speechSynthesis' in window/);
  assert.match(voice, /正在使用手机系统语音朗读/);
  assert.match(voice, /系统语音试听成功/);
  assert.match(call, /if \(window\.NidoNative \|\| !conversationId \|\| talkSettings\.executionMode !== 'terminal'\) return/);
});

test('Android packaged assets are served directly and boot diagnostics report real resource attributes', () => {
  assert.equal((native.match(/WebResourceResponse direct = interceptPackagedAsset\(uri\)/g) || []).length, 2);
  assert.ok(native.indexOf('WebResourceResponse direct = interceptPackagedAsset(uri)') < native.indexOf('return assetLoader.shouldInterceptRequest(uri)'), 'direct APK assets must be attempted before WebViewAssetLoader');
  assert.match(html, /target\.getAttribute\('src'\) \|\| target\.getAttribute\('href'\)/);
  assert.match(html, /（没有设置 src\/href）/);
  assert.doesNotMatch(html, /target && target !== window && target\.src\)/);
});


test('OpenCode Go keeps a stable session header per conversation in chat and proactive notifications', () => {
  assert.match(stream, /const nidoProviderHeaders = \(conversationId='default'\) =>/);
  assert.match(stream, /nido-opencode-session:' \+ String\(conversationId \|\| 'default'\)/);
  assert.match(stream, /nidoProviderHeaders\(c\.id\)/);
  assert.match(stream, /x-opencode-session/);
  assert.ok(stream.includes("headers['User-Agent'] = 'Nido/Android'"));
  const proactive = read('android-shell/app/src/main/java/app/rifugio/shell/NidoProactiveWorker.java');
  assert.match(proactive, /String conversationId = chat\.optString\("conversationId", ""\)\.trim\(\)/);
  assert.match(proactive, /sessionPreferenceSuffix\(conversationId\)/);
  assert.match(proactive, /MessageDigest\.getInstance\("SHA-256"\)/);
  assert.match(proactive, /opencode_session_/);
  assert.match(proactive, /x-opencode-session/);
  assert.ok(proactive.indexOf("if (conversationId.isEmpty())") < proactive.indexOf("URL endpoint = buildEndpoint(baseUrl)"), "must skip proactive API calls when no conversation is active");
});
