import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import test from 'node:test';
import { readRawBody, verifyRetellWebhookSignature } from '../lib/server/retell-webhook.js';

test('reads the full raw body from a readable stream', async () => {
  const readable = Readable.from([Buffer.from('{"a":1}')]);
  const body = await readRawBody(readable);
  assert.equal(body, '{"a":1}');
});

test('accepts a signature computed over the raw body and timestamp', () => {
  const rawBody = '{"event":"call_started"}';
  const timestamp = String(Date.now());
  const digest = createHmac('sha256', 'test-key').update(`${rawBody}${timestamp}`).digest('hex');
  const header = `v=${timestamp},d=${digest}`;
  assert.equal(verifyRetellWebhookSignature(rawBody, header, 'test-key'), true);
});

test('rejects a signature computed with the wrong key', () => {
  const rawBody = '{"event":"call_started"}';
  const timestamp = String(Date.now());
  const digest = createHmac('sha256', 'wrong-key').update(`${rawBody}${timestamp}`).digest('hex');
  const header = `v=${timestamp},d=${digest}`;
  assert.equal(verifyRetellWebhookSignature(rawBody, header, 'test-key'), false);
});

test('rejects a signature older than 5 minutes', () => {
  const rawBody = '{"event":"call_started"}';
  const timestamp = String(Date.now() - 6 * 60 * 1000);
  const digest = createHmac('sha256', 'test-key').update(`${rawBody}${timestamp}`).digest('hex');
  const header = `v=${timestamp},d=${digest}`;
  assert.equal(verifyRetellWebhookSignature(rawBody, header, 'test-key'), false);
});

test('rejects a missing signature header', () => {
  assert.equal(verifyRetellWebhookSignature('{}', undefined, 'test-key'), false);
});
