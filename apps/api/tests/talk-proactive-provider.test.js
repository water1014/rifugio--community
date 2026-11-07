'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const dns = require('node:dns').promises;
const { createTalkProactive } = require('../modules/talk-proactive');

function makeProactive() {
  return createTalkProactive({
    DB_PATH: ':memory:',
    readJsonSetting: () => ({}),
    writeJsonSetting: () => {},
    sanitizeTalkMessages: value => value,
    sendWebPushNotification: async () => ({ ok: true }),
  });
}

test('scheduled proactive generation uses the configured OpenCode Go API, not terminal chat', { concurrency: false }, async t => {
  const originalLookup = dns.lookup;
  const originalFetch = global.fetch;
  let captured = null;
  dns.lookup = async () => [{ address: '8.8.8.8', family: 4 }];
  global.fetch = async (url, options = {}) => {
    captured = { url: String(url), options, headers: new Headers(options.headers || {}) };
    return new Response(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: '我刚刚想到你了。' } }],
      usage: { prompt_tokens: 12, completion_tokens: 8 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  t.after(() => {
    dns.lookup = originalLookup;
    global.fetch = originalFetch;
  });

  const proactive = makeProactive();
  const reply = await proactive.generateProactiveReply({
    provider: 'opencode-go',
    baseUrl: 'https://opencode.ai/zen/go',
    apiKey: 'go-test-token',
    apiModel: 'kimi-k3',
    customHeaders: JSON.stringify({ 'X-Nido-Test': 'proactive' }),
    systemPrompt: '系统人格上下文',
    characterPrompt: '角色外貌与关系上下文',
  }, {
    id: 'conversation-123',
    messages: [
      { role: 'user', content: '今天下雨了' },
      { role: 'assistant', content: '记得带伞。' },
    ],
  }, '对方已经 120 分钟没有联系，请自然地主动发消息。');

  assert.equal(reply, '我刚刚想到你了。');
  assert.equal(captured.url, 'https://opencode.ai/zen/go/v1/chat/completions');
  assert.equal(captured.headers.get('authorization'), 'Bearer go-test-token');
  assert.equal(captured.headers.get('x-nido-test'), 'proactive');
  assert.match(captured.headers.get('x-opencode-session'), /^ses_[a-f0-9]{24}$/);
  const body = JSON.parse(captured.options.body);
  assert.equal(body.model, 'kimi-k3');
  assert.deepEqual(body.messages.map(message => message.role), ['system', 'system', 'user', 'assistant', 'user']);
  assert.equal(body.messages[0].content, '系统人格上下文');
  assert.equal(body.messages[1].content, '角色外貌与关系上下文');
  assert.equal(body.messages.at(-1).content, '对方已经 120 分钟没有联系，请自然地主动发消息。');
});

test('scheduled proactive generation refuses to fall back to Claude when API credentials are missing', async () => {
  const proactive = makeProactive();
  await assert.rejects(
    proactive.generateProactiveReply({
      provider: 'opencode-go',
      baseUrl: 'https://opencode.ai/zen/go',
      apiKey: '',
      apiModel: 'kimi-k3',
    }, { id: 'conversation-123', messages: [] }, 'send a proactive message'),
    /不会调用 Claude Terminal/,
  );
});
