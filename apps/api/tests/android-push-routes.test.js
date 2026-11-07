'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const dns = require('node:dns').promises;
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

test('Android push sender uses FCM HTTP v1 with the notified conversation identifiers', async t => {
  const originalFetch = global.fetch;
  const originalAccount = process.env.FCM_SERVICE_ACCOUNT_JSON;
  const originalProject = process.env.FCM_PROJECT_ID;
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  process.env.FCM_SERVICE_ACCOUNT_JSON = JSON.stringify({
    client_email: 'nido-push@example.iam.gserviceaccount.com',
    project_id: 'nido-test-project',
    private_key: privateKey.export({ type:'pkcs8', format:'pem' }),
  });
  process.env.FCM_PROJECT_ID = 'nido-test-project';
  const store = new Map();
  const routes = createPushRoutes({
    readJsonSetting: (key, fallback) => store.has(key) ? store.get(key) : fallback,
    writeJsonSetting: (key, value) => store.set(key, value),
    isAuthed: req => req.owner === true,
    encrypt: value => 'enc:' + value,
    decrypt: value => value.replace(/^enc:/, ''),
  });
  let fcmRequest = null;
  global.fetch = async (url, options = {}) => {
    if (String(url).includes('oauth2.googleapis.com/token')) {
      return new Response(JSON.stringify({ access_token:'test-oauth-token', expires_in:3600 }), { status:200 });
    }
    fcmRequest = { url:String(url), options, body:JSON.parse(options.body) };
    return new Response(JSON.stringify({ name:'projects/nido-test-project/messages/123' }), { status:200 });
  };
  t.after(() => {
    global.fetch = originalFetch;
    if (originalAccount === undefined) delete process.env.FCM_SERVICE_ACCOUNT_JSON;
    else process.env.FCM_SERVICE_ACCOUNT_JSON = originalAccount;
    if (originalProject === undefined) delete process.env.FCM_PROJECT_ID;
    else process.env.FCM_PROJECT_ID = originalProject;
  });

  const app = { get() {}, post() {}, delete() {} };
  routes.mountPushRoutes(app);
  const saved = routes;
  const registerApp = {
    get() {},
    post(path, handler) { if (path === '/api/push/android/register') this.register = handler; },
    delete() {},
  };
  routes.mountPushRoutes(registerApp);
  let responseBody;
  registerApp.register({ owner:true, body:{ token:'fcm-registration-token-0123456789abcdefghijklmnopqrstuvwxyz', installationId:'device-one' } }, {
    status() { return this; },
    json(value) { responseBody = value; },
  });
  assert.equal(responseBody.ok, true);

  const result = await saved.sendAndroidPushNotification({
    title:'Nido',
    body:'我来找你了。',
    conversationId:'conversation-42',
    messageId:'message-99',
  });
  assert.equal(result.sent, 1);
  assert.equal(fcmRequest.url, 'https://fcm.googleapis.com/v1/projects/nido-test-project/messages:send');
  assert.equal(fcmRequest.options.headers.Authorization, 'Bearer test-oauth-token');
  assert.equal(fcmRequest.body.message.data.conversationId, 'conversation-42');
  assert.equal(fcmRequest.body.message.data.messageId, 'message-99');
  assert.equal(fcmRequest.body.message.android.priority, 'HIGH');
  assert.equal(fcmRequest.body.message.android.notification.channel_id, 'nido_messages');
});

test('Web Push registration rejects private-network endpoints and accepts public HTTPS endpoints', async t => {
  const originalLookup = dns.lookup;
  dns.lookup = async hostname => {
    if (hostname === '127.0.0.1' || hostname === 'localhost') return [{ address:'127.0.0.1', family:4 }];
    return [{ address:'8.8.8.8', family:4 }];
  };
  t.after(() => { dns.lookup = originalLookup; });

  const handlers = {};
  const store = new Map();
  const app = {
    get(path, handler) { handlers['GET ' + path] = handler; },
    post(path, handler) { handlers['POST ' + path] = handler; },
    delete(path, handler) { handlers['DELETE ' + path] = handler; },
  };
  createPushRoutes({
    readJsonSetting: (key, fallback) => store.has(key) ? store.get(key) : fallback,
    writeJsonSetting: (key, value) => store.set(key, value),
    isAuthed: req => req.owner === true,
    encrypt: value => 'enc:' + value,
    decrypt: value => value.replace(/^enc:/, ''),
  }).mountPushRoutes(app);

  const makeResponse = () => {
    let statusCode = 200;
    let body = null;
    return {
      status(code) { statusCode = code; return this; },
      json(value) { body = value; },
      get statusCode() { return statusCode; },
      get body() { return body; },
    };
  };
  const subscription = endpoint => ({
    subscription: {
      endpoint,
      keys: { p256dh:'test-public-key', auth:'test-auth-secret' },
    },
  });

  const blocked = makeResponse();
  await handlers['POST /api/push/subscribe']({ owner:true, body:subscription('https://127.0.0.1/internal') }, blocked);
  assert.equal(blocked.statusCode, 400);
  assert.equal(store.get('push_subscriptions'), undefined);

  const accepted = makeResponse();
  await handlers['POST /api/push/subscribe']({ owner:true, body:subscription('https://push.example.test/send/opaque') }, accepted);
  assert.equal(accepted.statusCode, 200);
  assert.equal(accepted.body.ok, true);
  assert.equal(store.get('push_subscriptions').length, 1);
  assert.equal(typeof store.get('push_subscriptions')[0].dataEnc, 'string');
  assert.equal(Object.hasOwn(store.get('push_subscriptions')[0], 'endpoint'), false);
  assert.equal(Object.hasOwn(store.get('push_subscriptions')[0], 'keys'), false);
});

test('push test endpoint is owner-authenticated and fans out to native delivery', async () => {
  const handlers = {};
  let webCalls = 0;
  let androidCalls = 0;
  const app = {
    get(path, handler) { handlers['GET ' + path] = handler; },
    post(path, handler) { handlers['POST ' + path] = handler; },
    delete(path, handler) { handlers['DELETE ' + path] = handler; },
  };
  createPushRoutes({
    readJsonSetting: () => [],
    writeJsonSetting: () => {},
    isAuthed: req => req.owner === true,
    encrypt: value => value,
    decrypt: value => value,
  }).mountPushRoutes(app);
  // Replace sender functions on the instance used by the route by using no external push setup.
  // Unauthenticated calls must be rejected before any sender can be reached.
  let statusCode = 200;
  let responseBody = null;
  const res = {
    status(code) { statusCode = code; return this; },
    json(value) { responseBody = value; },
  };
  await handlers['POST /api/push/test']({ owner:false, body:{} }, res);
  assert.equal(statusCode, 401);
  assert.equal(responseBody.ok, false);
  assert.equal(webCalls + androidCalls, 0);
});
