(() => {
  'use strict';

  // Native Android push is deliberately opt-in at the distributor/OS level.
  // This bridge only registers credentials already issued by Android; it never
  // exposes provider API keys or stores push tokens in localStorage.
  const native = window.NidoNative;
  if (!native) return;

  const postJson = async (path, payload) => {
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) {
      throw new Error(result.error || 'Push registration failed (' + response.status + ')');
    }
    return result;
  };

  const registerFcm = async detail => {
    if (!detail || !detail.token || !detail.installationId) return;
    await postJson('/api/push/android/register', {
      token: String(detail.token),
      installationId: String(detail.installationId),
    });
  };

  const registerUnifiedPush = async detail => {
    if (!detail || detail.removed) return;
    if (!detail.endpoint || !detail.keys || !detail.keys.p256dh || !detail.keys.auth) return;
    await postJson('/api/push/subscribe', {
      subscription: detail,
      platform: 'android-unifiedpush',
      userAgent: navigator.userAgent,
    });
  };

  window.addEventListener('nido:push-token', event => {
    registerFcm(event.detail).catch(error => console.warn('[Nido push] FCM registration:', error.message));
  });

  window.addEventListener('nido:push-subscription', event => {
    registerUnifiedPush(event.detail).catch(error => console.warn('[Nido push] UnifiedPush registration:', error.message));
  });

  // Restore an existing native registration after WebView reload/restart.
  try {
    const token = native.getPushToken && native.getPushToken();
    const installationId = native.getInstallationId && native.getInstallationId();
    if (token && installationId) registerFcm({ token, installationId })
      .catch(error => console.warn('[Nido push] FCM restore:', error.message));
  } catch (error) {
    console.warn('[Nido push] Native token bridge unavailable:', error.message);
  }

  try {
    const raw = native.getUnifiedPushSubscription && native.getUnifiedPushSubscription();
    if (raw) registerUnifiedPush(JSON.parse(raw))
      .catch(error => console.warn('[Nido push] UnifiedPush restore:', error.message));
  } catch (error) {
    console.warn('[Nido push] UnifiedPush restore unavailable:', error.message);
  }

  // Keep the native notification tap payload until the Talk screen consumes it.
  // The actual screen-navigation adapter is intentionally a separate integration.
  const dispatchPending = () => {
    try {
      const raw = native.getPendingNotification && native.getPendingNotification();
      if (!raw) return;
      const detail = JSON.parse(raw);
      if (!detail.conversationId) return;
      window.dispatchEvent(new CustomEvent('nido:open-conversation', { detail }));
    } catch (error) {
      console.warn('[Nido push] Pending notification:', error.message);
    }
  };
  window.addEventListener('load', dispatchPending, { once: true });
})();
