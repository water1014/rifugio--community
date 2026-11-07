'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const {
  mountChatroomApiRoutes,
  mountTalkApiRoutes,
  providerFor,
  normalizeApiKey,
  endpointFor,
  modelsEndpointFor,
  cacheUsage,
  isPrivateIp,
  stableCacheKey,
  reasoningText,
  providerAssistantMessage,
} = require('../modules/chatroom-api');

test('detects official providers without confusing compatible endpoints', () => {
  assert.equal(providerFor('auto', 'https://api.openai.com/v1', 'gpt-5.6'), 'openai');
  assert.equal(providerFor('auto', 'https://api.anthropic.com/v1', 'claude-opus-4-8'), 'anthropic');
  assert.equal(providerFor('auto', 'https://api.deepseek.com/v1', 'deepseek-chat'), 'deepseek');
  assert.equal(providerFor('auto', 'https://example.com/v1', 'custom'), 'compatible');
  assert.equal(providerFor('compatible', 'https://relay.example/v1', 'claude-sonnet-4'), 'compatible');
});

test('normalizes OpenCode Go endpoints and attaches a stable session header', () => {
  assert.equal(providerFor('opencode-go', 'https://opencode.ai/zen/go', 'kimi-k3'), 'opencode-go');
  assert.equal(endpointFor('https://opencode.ai/zen/go', 'opencode-go'), 'https://opencode.ai/zen/go/v1/chat/completions');
  assert.equal(modelsEndpointFor('https://opencode.ai/zen/go'), 'https://opencode.ai/zen/go/v1/models');
  assert.equal(endpointFor('https://opencode.ai/inference/go/openai/v1', 'opencode-go'), 'https://opencode.ai/inference/go/openai/v1/chat/completions');
  assert.equal(modelsEndpointFor('https://opencode.ai/inference/go/openai/v1'), 'https://opencode.ai/inference/go/v1/models');
  const endpoint = endpointFor('https://opencode.ai/zen/go', 'opencode-go');
  const first = withOpenCodeSession({}, endpoint, 'chatroom:gpt', 'kimi-k3');
  const second = withOpenCodeSession({}, endpoint, 'chatroom:gpt', 'kimi-k3');
  assert.match(first['x-opencode-session'], /^ses_[a-f0-9]{24}$/);
  assert.equal(first['x-opencode-session'], second['x-opencode-session']);
  assert.equal(withOpenCodeSession({ 'X-OpenCode-Session': 'ses_custom' }, endpoint, 'chatroom:gpt', 'kimi-k3')['X-OpenCode-Session'], 'ses_custom');
});

