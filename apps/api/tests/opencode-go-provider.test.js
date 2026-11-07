'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { providerFor, endpointFor, modelsEndpointFor, withOpenCodeSession } = require('../modules/chatroom-api');

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
