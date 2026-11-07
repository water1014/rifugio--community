'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { mountChatroomApiRoutes, providerFor, endpointFor, modelsEndpointFor, withOpenCodeSession } = require('../modules/chatroom-api');

test('detects and normalizes OpenCode Go provider endpoints', () => {
  assert.equal(providerFor('opencode-go', 'https://opencode.ai/zen/go', 'kimi-k3'), 'opencode-go');
  assert.equal(providerFor('auto', 'https://opencode.ai/zen/go', 'kimi-k3'), 'opencode-go');
  assert.equal(endpointFor('https://opencode.ai/zen/go', 'opencode-go'), 'https://opencode.ai/zen/go/v1/chat/completions');
  assert.equal(modelsEndpointFor('https://opencode.ai/zen/go'), 'https://opencode.ai/zen/go/v1/models');
  assert.equal(endpointFor('https://opencode.ai/inference/go/openai/v1', 'opencode-go'), 'https://opencode.ai/inference/go/openai/v1/chat/completions');
  assert.equal(modelsEndpointFor('https://opencode.ai/inference/go/openai/v1'), 'https://opencode.ai/inference/go/v1/models');
});

test('generates a stable OpenCode Go session header unless explicitly supplied', () => {
  const endpoint = endpointFor('https://opencode.ai/zen/go', 'opencode-go');
  const first = withOpenCodeSession({}, endpoint, 'chatroom:gpt', 'kimi-k3');
  const second = withOpenCodeSession({}, endpoint, 'chatroom:gpt', 'kimi-k3');
  assert.match(first['x-opencode-session'], /^ses_[a-f0-9]{24}$/);
  assert.equal(first['User-Agent'], 'Rifugio/0.1.0');
  assert.equal(first['x-opencode-session'], second['x-opencode-session']);
  assert.equal(
    withOpenCodeSession({ 'X-OpenCode-Session': 'ses_custom' }, endpoint, 'chatroom:gpt', 'kimi-k3')['X-OpenCode-Session'],
    'ses_custom',
  );
});

test('forwards OpenCode Go auth, session, and client identity headers through the chat proxy', { concurrency: false }, async t => {
  const app = express();
  app.use(express.json());
  mountChatroomApiRoutes(app);
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const dns = require('node:dns').promises;
  const originalLookup = dns.lookup;
  dns.lookup = async () => [{ address: '8.8.8.8', family: 4 }];
  t.after(() => { dns.lookup = originalLookup; });
  const originalFetch = global.fetch;
  let captured;
  global.fetch = async (url, options = {}) => {
    captured = { url: String(url), headers: new Headers(options.headers || {}) };
    return new Response(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: 'ok' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  t.after(() => { global.fetch = originalFetch; });
  const response = await originalFetch(`http://127.0.0.1:${server.address().port}/api/chatroom-api/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      provider: 'opencode-go',
      base_url: 'https://opencode.ai/zen/go',
      api_key: 'go-test-token',
      model: 'kimi-k3',
      cache_namespace: 'chatroom:gpt',
      messages: [{ role: 'user', content: 'ping' }],
    }),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).choices[0].message.content, 'ok');
  assert.equal(captured.url, 'https://opencode.ai/zen/go/v1/chat/completions');
  assert.equal(captured.headers.get('authorization'), 'Bearer go-test-token');
  assert.match(captured.headers.get('x-opencode-session'), /^ses_[a-f0-9]{24}$/);
  assert.equal(captured.headers.get('user-agent'), 'Rifugio/0.1.0');
});
