import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { BrainOrchestrator } from '../src/brain/orchestrator.js';
import { Cerebellum } from '../src/brain/cerebellum.js';
import azureOpenAI from '../src/services/azureOpenAI.js';
import { registerChatSocket } from '../src/routes/socketChat.js';
import logger from '../src/utils/logger.js';

logger.silent = true;

class TestBrain extends BrainOrchestrator {
  registerAllModules() {
    for (const name of ['Midbrain', 'Medulla', 'FrontalLobe', 'TemporalLobe', 'ParietalLobe',
      'OccipitalLobe', 'LimbicSystem', 'Hippocampus', 'Amygdala', 'Pons', 'Hypothalamus', 'Cerebrum', 'Brainstem']) {
      this.modules.set(name, { async process(input) {
        return { output: { isSafe: true, isStable: true, response: `Draft: ${input}` } };
      } });
    }
    const refinement = new Cerebellum();
    refinement.setOrchestrator(this);
    this.modules.set('Cerebellum', refinement);
  }
}

test('orchestration streams refined plain text, records usage and saves the same answer', async t => {
  t.mock.method(azureOpenAI, 'chatStream', async (prompt, input, history, options) => {
    assert.match(prompt, /plain text/);
    assert.equal(input, 'Draft: Question');
    await options.onChunk('Polished ');
    await options.onChunk('answer');
    return { content: 'Polished answer', tokenUsage: { prompt_tokens: 8, completion_tokens: 2 } };
  });
  const brain = new TestBrain();
  const chunks = [];
  const activities = [];
  const result = await brain.orchestrate('Question', 'user', {
    onChunk: chunk => chunks.push(chunk), onActivity: activity => activities.push(activity)
  });
  assert.equal(result.success, true);
  assert.equal(result.response, chunks.join(''));
  assert.equal(brain.conversationHistory.at(-1).content, result.response);
  assert.equal(result.tokenUsage.total, 10);
  assert.equal(activities.length, 14);
});

test('parallel requests keep their stream callbacks and context separate', async t => {
  t.mock.method(azureOpenAI, 'chatStream', async (prompt, input, history, options) => {
    await new Promise(resolve => setImmediate(resolve));
    await options.onChunk(input);
    return { content: input, tokenUsage: { prompt_tokens: 1, completion_tokens: 2 } };
  });
  const brain = new TestBrain();
  const first = [], second = [];
  const results = await Promise.all([
    brain.orchestrate('one', 'one', { onChunk: chunk => first.push(chunk), onActivity() {} }),
    brain.orchestrate('two', 'two', { onChunk: chunk => second.push(chunk), onActivity() {} })
  ]);
  assert.deepEqual(first, ['Draft: one']);
  assert.deepEqual(second, ['Draft: two']);
  assert.deepEqual(results.map(result => result.tokenUsage.total), [3, 3]);
});

test('partial stream errors propagate without saving a fallback answer', async t => {
  t.mock.method(azureOpenAI, 'chatStream', async (prompt, input, history, options) => {
    options.onChunk('Partial');
    throw new Error('Stream failed');
  });
  const brain = new TestBrain();
  await assert.rejects(brain.orchestrate('Question', 'user', { onChunk() {}, onActivity() {} }), /Stream failed/);
  assert.deepEqual(brain.conversationHistory, []);
});

test('blocked requests stream the safety response and skip refinement', async t => {
  const query = t.mock.method(azureOpenAI, 'chatStream', () => { throw new Error('Must not query'); });
  const brain = new TestBrain();
  brain.modules.set('Medulla', { async process() { return { output: { isSafe: false } }; } });
  const chunks = [];
  const result = await brain.orchestrate('Question', 'user', { onChunk: chunk => chunks.push(chunk), onActivity() {} });
  assert.equal(result.success, false);
  assert.equal(result.response, chunks.join(''));
  assert.equal(query.mock.callCount(), 0);
});

test('buffered orchestration still uses JSON refinement', async t => {
  t.mock.method(azureOpenAI, 'chat', async () => ({
    content: JSON.stringify({ refined: 'Buffered answer', clarity_score: 1, improvements: [] }),
    tokenUsage: { prompt_tokens: 3, completion_tokens: 4 }
  }));
  const result = await new TestBrain().orchestrate('Question');
  assert.equal(result.response, 'Buffered answer');
  assert.equal(result.tokenUsage.total, 7);
});

class FakeSocket extends EventEmitter {
  constructor() { super(); this.events = []; }
  emit(name, data) { this.events.push({ name, data }); return super.emit(name, data); }
}

test('Socket.IO forwards live chunks before the end event and cancels on disconnect', async () => {
  const socket = new FakeSocket();
  let options;
  let finish;
  registerChatSocket(socket, { async orchestrate(message, user, requestOptions) {
    options = requestOptions;
    requestOptions.onChunk('Live');
    await new Promise(resolve => { finish = resolve; });
    return { success: true, tokenUsage: { total: 3 } };
  } });
  socket.emit('chat-message', { message: 'Question' });
  assert.equal(socket.events.some(event => event.name === 'chat-response-chunk'), true);
  assert.equal(socket.events.some(event => event.name === 'chat-response-end'), false);
  socket.emit('disconnect');
  assert.equal(options.signal.aborted, true);
  finish();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(socket.events.some(event => event.name === 'chat-response-end'), false);
});

test('Socket.IO reports failed streams without a successful end event', async () => {
  const socket = new FakeSocket();
  registerChatSocket(socket, { async orchestrate(message, user, options) {
    options.onChunk('Partial');
    throw new Error('upstream failed');
  } });
  socket.emit('chat-message', { message: 'Question' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(socket.events.find(event => event.name === 'chat-error').data.error, 'upstream failed');
  assert.equal(socket.events.some(event => event.name === 'chat-response-end'), false);
});
