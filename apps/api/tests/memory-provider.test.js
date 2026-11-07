'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dns = require('node:dns').promises;
const Database = require('../modules/sqlite');
const { createSettingsMemoryRoutes } = require('../modules/settings-memory-routes');

test('memory LLM settings encrypt credentials and discover OpenCode Go models with custom headers', async t => {
  const DB_PATH = path.join(os.tmpdir(), 'nido-memory-provider-' + process.pid + '-' + Date.now() + '.sqlite');
  const db = new Database(DB_PATH);
  db.exec('CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT)');
  db.close();

  const originalFetch = global.fetch;
  const originalLookup = dns.lookup;
  let captured = null;
  dns.lookup = async () => [{ address:'8.8.8.8', family:4 }];
  global.fetch = async (url, options = {}) => {
    captured = { url:String(url), options, headers:new Headers(options.headers || {}) };
    return new Response(JSON.stringify({ data:[{ id:'kimi-k3' }] }), {
      status:200, headers:{ 'content-type':'application/json' },
    });
  };
  t.after(() => {
    global.fetch = originalFetch;
    dns.lookup = originalLookup;
    try { fs.unlinkSync(DB_PATH); } catch (_) {}
  });

  const handlers = {};
  const app = {
    get(route, handler) { handlers['GET ' + route] = handler; },
    put(route, handler) { handlers['PUT ' + route] = handler; },
    post(route, handler) { handlers['POST ' + route] = handler; },
    delete(route, handler) { handlers['DELETE ' + route] = handler; },
  };
  const routes = createSettingsMemoryRoutes({
    DB_PATH,
    maskKey: () => 'sk-***',
    encrypt: value => 'enc:' + value,
    decrypt: value => value.replace(/^enc:/, ''),
  });
  routes.mountPreMigrationRoutes(app);

  let responseBody = null;
  const res = { json(value) { responseBody = value; } };
  handlers['PUT /api/settings/llm']({
    body:{
      provider:'opencode-go',
      base_url:'https://opencode.ai/zen/go',
      api_key:'sk-private-test',
      model:'kimi-k3',
      custom_headers:JSON.stringify({ 'X-Nido-Memory':'enabled' }),
    },
  }, res);

  const storedDb = new Database(DB_PATH, { readonly:true });
  const stored = JSON.parse(storedDb.prepare("SELECT value FROM app_settings WHERE key='llm'").get().value);
  storedDb.close();
  assert.equal(stored.api_key_enc, 'enc:sk-private-test');
  assert.equal(stored.custom_headers_enc, 'enc:{"X-Nido-Memory":"enabled"}');
  assert.equal(Object.hasOwn(stored, 'api_key'), false);
  assert.equal(Object.hasOwn(stored, 'custom_headers'), false);

  handlers['GET /api/settings/llm']({}, res);
  assert.equal(responseBody.data.api_key, 'sk-***');
  assert.equal(responseBody.data.provider, 'opencode-go');
  assert.equal(responseBody.data.custom_headers, '{"X-Nido-Memory":"enabled"}');

  await handlers['POST /api/settings/llm/test']({
    body:{ api_key:'sk-***', provider:'opencode-go', base_url:'https://opencode.ai/zen/go', model:'kimi-k3' },
  }, res);

  assert.equal(responseBody.ok, true);
  assert.deepEqual(responseBody.data, [{ id:'kimi-k3' }]);
  assert.equal(captured.url, 'https://opencode.ai/zen/go/v1/models');
  assert.equal(captured.headers.get('authorization'), 'Bearer sk-private-test');
  assert.equal(captured.headers.get('x-nido-memory'), 'enabled');
  assert.match(captured.headers.get('x-opencode-session'), /^ses_[a-f0-9]{24}$/);
});
