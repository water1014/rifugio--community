'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createTalkProactive } = require('../modules/talk-proactive');

test('proactive provider credentials are encrypted at rest and masked in settings responses', () => {
  const store = new Map();
  const handlers = {};
  const app = {
    get(path, handler) { handlers['GET ' + path] = handler; },
    put(path, handler) { handlers['PUT ' + path] = handler; },
    post(path, handler) { handlers['POST ' + path] = handler; },
  };
  const proactive = createTalkProactive({
    DB_PATH: ':memory:',
    readJsonSetting: (key, fallback) => store.has(key) ? store.get(key) : fallback,
    writeJsonSetting: (key, value) => store.set(key, value),
    sanitizeTalkMessages: value => value,
    sendWebPushNotification: async () => ({ ok: true }),
    encrypt: value => 'encrypted:' + value,
    decrypt: value => value.replace(/^encrypted:/, ''),
    maskKey: () => 'sk-***-oken',
  });
  proactive.mountTalkProactiveRoutes(app);

  let responseBody;
  const res = { json(value) { responseBody = value; } };
  handlers['PUT /api/talk/proactive/settings']({
    body: {
      enabled: false,
      provider: 'opencode-go',
      baseUrl: 'https://opencode.ai/zen/go',
      apiModel: 'kimi-k3',
      apiKey: 'sk-private-token',
    },
  }, res);

  const stored = store.get('talk_proactive_settings');
  assert.equal(stored.apiKeyEnc, 'encrypted:sk-private-token');
  assert.equal(Object.hasOwn(stored, 'apiKey'), false);
  assert.equal(responseBody.settings.apiKey, 'sk-***-oken');
  assert.equal(responseBody.settings.provider, 'opencode-go');

  handlers['PUT /api/talk/proactive/settings']({
    body: { enabled: false, apiKey: 'sk-***-oken', apiModel: 'kimi-k3' },
  }, res);
  assert.equal(store.get('talk_proactive_settings').apiKeyEnc, 'encrypted:sk-private-token');
});
