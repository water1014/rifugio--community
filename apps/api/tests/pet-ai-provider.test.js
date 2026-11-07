'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateBaseUrl, completionUrl, ALLOWED_AI_HOSTS } = require('../modules/pet-ai');

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
