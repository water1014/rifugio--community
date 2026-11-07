'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCustomHeaders, providerRequestHeaders } = require('../modules/chatroom-api');

test('accepts valid custom headers and preserves provider defaults', () => {
  assert.deepEqual(normalizeCustomHeaders({ 'X-Client-Tag': 'rifugio' }), {
    'X-Client-Tag': 'rifugio',
  });
  assert.deepEqual(providerRequestHeaders('fallback-key', { 'X-Client-Tag': 'rifugio' }, 'compatible'), {
    'Content-Type': 'application/json',
    Authorization: 'Bearer fallback-key',
    'X-Client-Tag': 'rifugio',
  });
});

test('allows an explicit authorization or API-key override for subscription gateways', () => {
  assert.deepEqual(providerRequestHeaders('unused-fallback', {
    Authorization: 'Bearer opencode-go-token',
    'X-Client-Tag': 'rifugio',
  }, 'compatible'), {
    'Content-Type': 'application/json',
    Authorization: 'Bearer opencode-go-token',
    'X-Client-Tag': 'rifugio',
  });
  assert.equal(
    providerRequestHeaders('fallback-key', { 'x-api-key': 'subscription-token' }, 'compatible')['x-api-key'],
    'subscription-token',
  );
});

test('rejects malformed, unsafe, and oversized custom headers', () => {
  assert.throws(() => normalizeCustomHeaders('not-json'), /有效 JSON/);
  assert.throws(() => normalizeCustomHeaders([]), /JSON 对象/);
  assert.throws(() => normalizeCustomHeaders({ Host: 'attacker.example' }), /不允许覆盖安全请求头/);
  assert.throws(() => normalizeCustomHeaders({ 'X-Test': 'first\\r\\nInjected: yes' }), /值无效/);
  assert.throws(() => normalizeCustomHeaders(Object.fromEntries(
    Array.from({ length: 21 }, (_, i) => ['X-' + i, 'v'])
  )), /最多允许 20 项/);
});
