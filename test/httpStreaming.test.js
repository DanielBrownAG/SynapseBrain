import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import chatRoutes from '../src/routes/chat.js';
import orchestrator from '../src/brain/orchestrator.js';
import logger from '../src/utils/logger.js';
import { SessionStore } from '../src/services/sessionStore.js';

logger.silent = true;

test('session endpoints create, restore, clear and delete only the selected conversation', async t => {
  const previous = orchestrator.sessions;
  orchestrator.sessions = new SessionStore(null);
  t.after(() => { orchestrator.sessions = previous; });
  const app = express();
  app.use(express.json());
  app.use('/api/chat', chatRoutes);
  const server = app.listen(0, '127.0.0.1');
  t.after(() => { server.closeAllConnections(); server.close(); });
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/api/chat`;
  const create = async () => (await (await fetch(`${url}/sessions`, { method: 'POST' })).json()).session;
  const first = await create();
  const second = await create();
  first.history.push({ role: 'user', content: 'First conversation' });
  second.history.push({ role: 'user', content: 'Second conversation' });
  orchestrator.sessions.save(first);
  orchestrator.sessions.save(second);
  const clear = await fetch(`${url}/clear`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: first.id }) });
  assert.equal(clear.status, 200);
  assert.deepEqual(orchestrator.sessions.get(first.id).history, []);
  const restored = await (await fetch(`${url}/sessions/${second.id}`)).json();
  assert.equal(restored.session.history[0].content, 'Second conversation');
  assert.equal((await fetch(`${url}/sessions/${first.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await fetch(`${url}/sessions/${first.id}`)).status, 404);
  assert.ok(orchestrator.sessions.get(second.id));
  assert.equal((await fetch(`${url}/clear`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 400);
});

test('HTTP SSE sends a live chunk before completion, validates input and reports errors', async t => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  t.mock.method(orchestrator, 'orchestrate', async (message, user, options) => {
    if (message === 'fail') throw new Error('upstream failed');
    if (!options?.onChunk) return { success: true, response: 'Buffered' };
    options.onChunk('Live');
    await pending;
    return { success: true, response: 'Live' };
  });
  const app = express();
  app.use(express.json());
  app.use('/api/chat', chatRoutes);
  const server = app.listen(0, '127.0.0.1');
  t.after(() => { finish(); server.closeAllConnections(); server.close(); });
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/api/chat`;
  const post = (path, message) => fetch(`${url}/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message })
  });
  assert.equal((await post('stream', 123)).status, 400);
  const response = await post('stream', 'Question');
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  while (!text.includes('event: chunk')) {
    const { value, done } = await reader.read();
    assert.equal(done, false);
    text += decoder.decode(value, { stream: true });
  }
  assert.match(text, /"chunk":"Live"/);
  assert.equal(text.includes('event: end'), false);
  finish();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  assert.match(text, /event: end/);
  const failed = await (await post('stream', 'fail')).text();
  assert.match(failed, /event: error/);
  assert.match(failed, /upstream failed/);
  assert.equal(failed.includes('event: end'), false);
  assert.deepEqual(await (await post('chat', 'Question')).json(), { success: true, response: 'Buffered' });
});
