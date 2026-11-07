const crypto = require('crypto');
const { validatePublicBaseUrl } = require('./chatroom-api');

function createPushRoutes({ readJsonSetting, writeJsonSetting, isAuthed, encrypt, decrypt }) {
  const PUSH_VAPID_KEYS_KEY = 'push_vapid_keys';
  const PUSH_SUBSCRIPTIONS_KEY = 'push_subscriptions';
  const ANDROID_PUSH_TOKENS_KEY = 'android_push_tokens';
  let fcmAccessToken = '';
  let fcmAccessTokenExpiresAt = 0;

  function requireOwner(req, res) {
    if (typeof isAuthed !== 'function' || !isAuthed(req)) {
      res.status(401).json({ ok: false, error: 'authentication required' });
      return false;
    }
    return true;
  }

  function readAndroidPushTokens() {
    const rows = readJsonSetting(ANDROID_PUSH_TOKENS_KEY, []);
    if (!Array.isArray(rows)) return [];
    return rows.map(row => {
      try {
        const token = row.tokenEnc && typeof decrypt === 'function' ? decrypt(row.tokenEnc) : '';
        return token ? { ...row, token } : null;
      } catch (_) { return null; }
    }).filter(Boolean);
  }

  function writeAndroidPushTokens(rows) {
    writeJsonSetting(ANDROID_PUSH_TOKENS_KEY, (Array.isArray(rows) ? rows : [])
      .filter(row => row && row.installationId && row.tokenEnc).slice(-20));
  }

  function upsertAndroidPushToken(input = {}) {
    const token = String(input.token || '').trim();
    const installationId = String(input.installationId || '').trim().slice(0, 120);
    if (token.length < 20 || token.length > 4096 || /\\s/.test(token) || !installationId || typeof encrypt !== 'function') return null;
    const rows = readJsonSetting(ANDROID_PUSH_TOKENS_KEY, []);
    const next = Array.isArray(rows) ? rows.filter(row => row.installationId !== installationId) : [];
    next.push({
      id: crypto.createHash('sha256').update(installationId).digest('hex').slice(0, 24),
      installationId,
      tokenEnc: encrypt(token),
      platform: 'android',
      updatedAt: new Date().toISOString(),
    });
    writeAndroidPushTokens(next);
    return { id: next[next.length - 1].id, count: next.length };
  }

  function removeAndroidPushToken(installationId) {
    const id = String(installationId || '').trim();
    if (!id) return 0;
    const rows = readJsonSetting(ANDROID_PUSH_TOKENS_KEY, []);
    const next = Array.isArray(rows) ? rows.filter(row => row.installationId !== id) : [];
    writeAndroidPushTokens(next);
    return (Array.isArray(rows) ? rows.length : 0) - next.length;
  }

  function readFcmServiceAccount() {
    const raw = String(process.env.FCM_SERVICE_ACCOUNT_JSON || '').trim();
    if (!raw) return null;
    try {
      const decoded = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
      const account = JSON.parse(decoded);
      if (!account.client_email || !account.private_key || !account.project_id) return null;
      return account;
    } catch (_) { return null; }
  }

  async function getFcmAccessToken(account) {
    if (fcmAccessToken && fcmAccessTokenExpiresAt > Date.now() + 60000) return fcmAccessToken;
    const now = Math.floor(Date.now() / 1000);
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = encode({ alg: 'RS256', typ: 'JWT' }) + '.' + encode({
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    });
    const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), account.private_key).toString('base64url');
    const assertion = unsigned + '.' + signature;
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.access_token) throw new Error('FCM OAuth token exchange failed: ' + (body.error_description || body.error || response.status));
    fcmAccessToken = body.access_token;
    fcmAccessTokenExpiresAt = Date.now() + Math.max(60, Number(body.expires_in || 3600)) * 1000;
    return fcmAccessToken;
  }

  async function sendAndroidPushNotification(payload = {}) {
    const account = readFcmServiceAccount();
    if (!account) return { ok: false, unavailable: true, reason: 'FCM_SERVICE_ACCOUNT_JSON is not configured', sent: 0, failed: 0 };
    const rows = readAndroidPushTokens();
    if (!rows.length) return { ok: false, unavailable: true, reason: 'no Android devices registered', sent: 0, failed: 0 };
    const projectId = String(process.env.FCM_PROJECT_ID || account.project_id).trim();
    const accessToken = await getFcmAccessToken(account);
    const alive = [];
    let sent = 0, failed = 0;
    for (const row of rows) {
      try {
        const data = Object.fromEntries(Object.entries({
          app: 'nido',
          conversationId: payload.conversationId || payload.convoId || '',
          messageId: payload.messageId || '',
          title: String(payload.title || 'Nido').slice(0, 80),
          body: String(payload.body || '有一条新消息').slice(0, 180),
        }).map(([key, value]) => [key, String(value)]));
        const response = await fetch('https://fcm.googleapis.com/v1/projects/' + encodeURIComponent(projectId) + '/messages:send', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              token: row.token,
              notification: { title: data.title, body: data.body },
              data,
              android: {
                priority: 'HIGH',
                notification: { channel_id: 'nido_messages' },
              },
            },
          }),
          signal: AbortSignal.timeout(15000),
        });
        const result = await response.json().catch(() => ({}));
        if (response.ok) {
          sent += 1;
          alive.push(row);
        } else {
          failed += 1;
          const errorText = JSON.stringify(result);
          if (!/UNREGISTERED|registration-token-not-registered/i.test(errorText)) alive.push(row);
        }
      } catch (_) {
        failed += 1;
        alive.push(row);
      }
    }
    if (alive.length !== rows.length) {
      const stored = readJsonSetting(ANDROID_PUSH_TOKENS_KEY, []);
      const aliveIds = new Set(alive.map(row => row.installationId));
      writeAndroidPushTokens(Array.isArray(stored) ? stored.filter(row => aliveIds.has(row.installationId)) : []);
    }
    return { ok: sent > 0, sent, failed, total: rows.length };
  }
  const WEB_PUSH_SUBJECT = process.env.WEB_PUSH_SUBJECT || 'mailto:admin@example.com';
  let webPushModule = null;
  let webPushLoadTried = false;

  function getWebPushModule() {
    if (webPushModule || webPushLoadTried) return webPushModule;
    webPushLoadTried = true;
    try {
      webPushModule = require('web-push');
    } catch (e) {
      console.warn('[push] web-push dependency unavailable:', e.message);
    }
    return webPushModule;
  }

  function readPushSubscriptions() {
    const rows = readJsonSetting(PUSH_SUBSCRIPTIONS_KEY, []);
    return Array.isArray(rows) ? rows.filter(s => s && s.endpoint) : [];
  }

  function writePushSubscriptions(rows) {
    writeJsonSetting(PUSH_SUBSCRIPTIONS_KEY, (Array.isArray(rows) ? rows : []).filter(s => s && s.endpoint).slice(-80));
  }

  function normalizePushSubscription(input = {}) {
    const subscription = input.subscription || input;
    const endpoint = String(subscription.endpoint || '').trim();
    const keys = subscription.keys || {};
    const p256dh = String(keys.p256dh || '').trim();
    const auth = String(keys.auth || '').trim();
    if (!endpoint || endpoint.length > 2048 || !p256dh || !auth) return null;
    return {
      id: crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 24),
      endpoint,
      expirationTime: subscription.expirationTime || null,
      keys: { p256dh, auth },
      userAgent: String(input.userAgent || '').slice(0, 240),
      platform: String(input.platform || '').slice(0, 80),
      updatedAt: new Date().toISOString(),
    };
  }

  function ensureVapidKeys() {
    const webPush = getWebPushModule();
    if (!webPush) return null;
    const envPublic = String(process.env.WEB_PUSH_PUBLIC_KEY || '').trim();
    const envPrivate = String(process.env.WEB_PUSH_PRIVATE_KEY || '').trim();
    if (envPublic && envPrivate) return { publicKey: envPublic, privateKey: envPrivate, source: 'env' };
    const stored = readJsonSetting(PUSH_VAPID_KEYS_KEY, null);
    if (stored?.publicKey && stored?.privateKey) return { ...stored, source: 'stored' };
    const generated = webPush.generateVAPIDKeys();
    writeJsonSetting(PUSH_VAPID_KEYS_KEY, generated);
    return { ...generated, source: 'generated' };
  }

  function configureWebPush() {
    const webPush = getWebPushModule();
    const keys = ensureVapidKeys();
    if (!webPush || !keys) return null;
    webPush.setVapidDetails(WEB_PUSH_SUBJECT, keys.publicKey, keys.privateKey);
    return webPush;
  }

  function upsertPushSubscription(input = {}) {
    const next = normalizePushSubscription(input);
    if (!next) return null;
    const rows = readPushSubscriptions().filter(s => s.endpoint !== next.endpoint);
    rows.push(next);
    writePushSubscriptions(rows);
    return next;
  }

  function removePushSubscription(endpoint) {
    const clean = String(endpoint || '').trim();
    if (!clean) return 0;
    const rows = readPushSubscriptions();
    const next = rows.filter(s => s.endpoint !== clean);
    writePushSubscriptions(next);
    return rows.length - next.length;
  }

  async function sendWebPushNotification(payload = {}) {
    const webPush = configureWebPush();
    if (!webPush) return { ok: false, unavailable: true, sent: 0, failed: 0 };
    const body = JSON.stringify({
      title: String(payload.title || 'Nido').slice(0, 80),
      body: String(payload.body || '有新消息').slice(0, 180),
      icon: payload.icon || '/icon.svg',
      badge: payload.badge || '/icon.svg',
      tag: payload.tag || 'rifugio-talk',
      data: payload.data || {},
    });
    const rows = readPushSubscriptions();
    const alive = [];
    let sent = 0, failed = 0;
    for (const sub of rows) {
      try {
        await validatePublicBaseUrl(sub.endpoint);
        await webPush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, body, { TTL: 3600, urgency: 'high' });
        sent += 1;
        alive.push(sub);
      } catch (e) {
        failed += 1;
        const status = Number(e.statusCode || e.status || 0);
        if (status !== 404 && status !== 410) alive.push(sub);
      }
    }
    if (alive.length !== rows.length) writePushSubscriptions(alive);
    return { ok: sent > 0, sent, failed, total: rows.length };
  }

  function mountPushRoutes(app) {
    app.post('/api/push/android/register', (req, res) => {
      if (!requireOwner(req, res)) return;
      const saved = upsertAndroidPushToken(req.body || {});
      if (!saved) return res.status(400).json({ ok: false, error: 'invalid Android push token or encryption unavailable' });
      res.json({ ok: true, ...saved });
    });

    app.delete('/api/push/android/register', (req, res) => {
      if (!requireOwner(req, res)) return;
      res.json({ ok: true, removed: removeAndroidPushToken(req.body?.installationId || req.query.installationId || '') });
    });

    app.get('/api/push/vapid-public-key', (_req, res) => {
      const keys = ensureVapidKeys();
      res.json({
        ok: Boolean(keys?.publicKey),
        publicKey: keys?.publicKey || '',
        source: keys?.source || '',
        available: Boolean(getWebPushModule()),
      });
    });

    app.post('/api/push/subscribe', async (req, res) => {
      if (!requireOwner(req, res)) return;
      const endpoint = req.body?.subscription?.endpoint || req.body?.endpoint || '';
      try {
        await validatePublicBaseUrl(endpoint);
      } catch (error) {
        return res.status(400).json({ ok: false, error: error.message || 'invalid push endpoint' });
      }
      const saved = upsertPushSubscription(req.body || {});
      if (!saved) return res.status(400).json({ ok: false, error: 'invalid push subscription' });
      res.json({ ok: true, id: saved.id, count: readPushSubscriptions().length });
    });

    app.delete('/api/push/subscribe', (req, res) => {
      if (!requireOwner(req, res)) return;
      const endpoint = req.body?.endpoint || req.query.endpoint || '';
      res.json({ ok: true, removed: removePushSubscription(endpoint), count: readPushSubscriptions().length });
    });

    app.post('/api/push/test', async (req, res) => {
      try {
        const result = await sendWebPushNotification({
          title: req.body?.title || 'Nido',
          body: req.body?.body || '系统通知测试成功。',
          tag: 'rifugio-test',
          data: { app: 'talk', test: true },
        });
        res.json({ ok: true, result });
      } catch (e) {
        res.status(500).json({ ok: false, error: e.message || String(e) });
      }
    });
  }

  return {
    sendWebPushNotification,
    sendAndroidPushNotification,
    mountPushRoutes,
  };
}

module.exports = { createPushRoutes };
