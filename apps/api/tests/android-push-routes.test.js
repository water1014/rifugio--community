'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createPushRoutes } = require('../modules/push-routes');

test('Android push tokens require an authenticated owner and are encrypted at rest', () => {
  const store = new Map();
  const handlers = {};
  const app = {
    get(path, handler) { handlers['GET ' + path] = handler; },
    post(path, handler) { handlers['POST ' + path] = handler; },
    delete(path, handler) { handlers['DELETE ' + path] = handler; },
  };
  const routes = createPushRoutes({
    readJsonSetting: (key, fallback) => store.has(key) ? store.get(key) : fallback,
    writeJsonSetting: (key, value) => store.set(key, value),
    isAuthed: req => req.owner === true,
    encrypt: value => 'enc:' + value,
    decrypt: value => value.replace(/^enc:/, ''),
  });
  routes.mountPushRoutes(app);

  let statusCode = 200;
  let responseBody = null;
  const res = {
    status(code) { statusCode = code; return this; },
    json(value) { responseBody = value; return this; },
  };
  const token = 'fcm-registration-token-0123456789abcdefghijklmnopqrstuvwxyz';

  handlers['POST /api/push/android/register']({
    owner: false,
    body: { token, installationId: 'device-one' },
  }, res);
  assert.equal(statusCode, 401);

  statusCode = 200;
  handlers['POST /api/push/android/register']({
    owner: true,
    body: { token, installationId: 'device-one' },
  }, res);
  assert.equal(responseBody.ok, true);
  const stored = store.get('android_push_tokens');
  assert.equal(stored.length, 1);
  assert.equal(stored[0].tokenEnc, 'enc:' + token);
  assert.equal(Object.hasOwn(stored[0], 'token'), false);

  handlers['POST /api/push/android/register']({
    owner: true,
    body: { token: 'short', installationId: 'device-two' },
  }, res);
  assert.equal(statusCode, 400);
  assert.equal(store.get('android_push_tokens').length, 1);

  handlers['DELETE /api/push/android/register']({
    owner: true,
    body: { installationId: 'device-one' },
  }, res);
  assert.equal(responseBody.removed, 1);
  assert.equal(store.get('android_push_tokens').length, 0);
});
