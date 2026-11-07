'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateBaseUrl, completionUrl, buildPetProviderRequest, ALLOWED_AI_HOSTS } = require('../modules/pet-ai');

test('pet AI accepts the OpenCode Go host and builds its canonical chat-completions endpoint', () => {
  assert.equal(ALLOWED_AI_HOSTS.has('opencode.ai'), true);
  assert.equal(validateBaseUrl('https://opencode.ai/zen/go'), 'https://opencode.ai/zen/go');
  assert.equal(
    completionUrl('https://opencode.ai/zen/go', 'opencode-go'),
    'https://opencode.ai/zen/go/v1/chat/completions',
  );
});

test('pet AI keeps non-core provider presets on the generic OpenAI-compatible route', () => {
  assert.equal(
    completionUrl('https://open.bigmodel.cn/api/paas/v4', 'glm'),
    'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  );
});

test('pet AI continues to reject unapproved hosts and non-HTTPS URLs', () => {
  assert.throws(() => validateBaseUrl('http://opencode.ai/zen/go'), /HTTPS/);
  assert.throws(() => validateBaseUrl('https://example.com/v1'), /白名单/);
});

test('pet AI attaches OpenCode Go session and custom headers to background requests', () => {
  const request = buildPetProviderRequest({
    provider:'opencode-go',
    base_url:'https://opencode.ai/zen/go',
    api_key:'sk-test-token',
    model:'kimi-k3',
    custom_headers:JSON.stringify({ 'X-Pet-Client':'Nido' }),
  });
  const headers = new Headers(request.headers);
  assert.equal(request.endpoint, 'https://opencode.ai/zen/go/v1/chat/completions');
  assert.equal(headers.get('authorization'), 'Bearer sk-test-token');
  assert.equal(headers.get('x-pet-client'), 'Nido');
  assert.match(headers.get('x-opencode-session'), /^ses_[a-f0-9]{24}$/);
});
