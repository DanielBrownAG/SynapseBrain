import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SessionStore } from '../src/services/sessionStore.js';
import { BrainContext } from '../src/utils/context.js';
import { parseModuleOutput, moduleSchemas } from '../src/utils/moduleSchemas.js';
import { BrainOrchestrator } from '../src/brain/orchestrator.js';
import azureOpenAI from '../src/services/azureOpenAI.js';
import logger from '../src/utils/logger.js';

logger.silent = true;

function sample(schema) {
  if (schema.enum) return schema.enum[0];
  if (schema.type === 'object') return Object.fromEntries(Object.entries(schema.properties || {}).map(([key, value]) => [key, sample(value)]));
  if (schema.type === 'array') return [];
  if (schema.type === 'boolean') return true;
  if (schema.type === 'number') return schema.minimum || 0;
  return 'Example';
}

function mockModels(t, brain, override = () => {}) {
  return t.mock.method(azureOpenAI, 'chat', async (prompt, input) => {
    const module = [...brain.modules.values()].find(module => module.systemPrompt === prompt);
    assert.ok(module, 'Model call must come from a registered module');
    if (module.name === 'Cerebrum') {
      const payload = JSON.parse(input);
      return { content: 'Answer: ' + payload.userInput, tokenUsage: { prompt_tokens: 1, completion_tokens: 1 } };
    }
    const output = sample(moduleSchemas[module.name]);
    if (module.name === 'FrontalLobe') {
      output.primaryModules = ['ParietalLobe'];
      output.requiresLongTermMemory = false;
      output.requiresSafetyCheck = false;
    }
    if (module.name === 'Hippocampus') output.keyInformation = [input];
    const replacement = override(module.name, output, input);
    return { content: replacement ?? JSON.stringify(output), tokenUsage: { prompt_tokens: 1, completion_tokens: 1 } };
  });
}

test('all module schemas reject missing fields, incorrect types, extra fields and invalid values', () => {
  for (const [name, schema] of Object.entries(moduleSchemas)) {
    const valid = sample(schema);
    assert.deepEqual(parseModuleOutput(name, JSON.stringify(valid)), valid);
    assert.deepEqual(parseModuleOutput(name, '```json\n' + JSON.stringify(valid) + '\n```'), valid);
    assert.throws(() => parseModuleOutput(name, '{}'));
    assert.throws(() => parseModuleOutput(name, '[]'));
    assert.throws(() => parseModuleOutput(name, JSON.stringify({ ...valid, unexpected: true })));
    for (const field of Object.keys(schema.properties)) {
      assert.throws(() => parseModuleOutput(name, JSON.stringify({ ...valid, [field]: null })));
    }
  }
  assert.throws(() => parseModuleOutput('OccipitalLobe', JSON.stringify({ ...sample(moduleSchemas.OccipitalLobe), confidence: 2 })));
  assert.throws(() => parseModuleOutput('FrontalLobe', JSON.stringify({ ...sample(moduleSchemas.FrontalLobe), primaryModules: ['UnknownModule'] })));
});

test('sessions survive store recreation and clearing or deleting one leaves the other untouched', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'synapse-sessions-test-'));
  try {
    const store = new SessionStore(directory);
    const first = store.create('first');
    first.history.push({ role: 'user', content: 'Private first conversation' });
    first.memory = { lastImportant: ['Remember me'] };
    store.save(first);
    store.create('second');
    const restored = new SessionStore(directory);
    assert.deepEqual(restored.get('first').memory.lastImportant, ['Remember me']);
    assert.equal(restored.get('first').history.length, 1);
    await restored.clear('second');
    assert.equal(restored.get('first').history.length, 1);
    await restored.delete('second');
    assert.equal(restored.get('second'), null);
    assert.ok(restored.get('first'));
    assert.throws(() => restored.get('../outside'));
    assert.throws(() => restored.create('..'));
  } finally {
    assert.ok(directory.startsWith(path.join(tmpdir(), 'synapse-sessions-test-')));
    rmSync(directory, { recursive: true, force: true });
  }
});

test('session locks serialize turns and recover after failed turns', async () => {
  const store = new SessionStore(null);
  store.create('chat');
  let release;
  const order = [];
  const first = store.withLock('chat', async () => {
    order.push('first');
    await new Promise(resolve => { release = resolve; });
    order.push('first complete');
    throw new Error('failed turn');
  });
  const caught = assert.rejects(first, /failed turn/);
  const second = store.withLock('chat', () => { order.push('second'); });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(order, ['first']);
  release();
  await Promise.all([caught, second]);
  assert.deepEqual(order, ['first', 'first complete', 'second']);
});

test('adaptive routing uses planner specialists while preserving mandatory checks and isolated history', async t => {
  const brain = new BrainOrchestrator({ store: new SessionStore(null) });
  const query = mockModels(t, brain);
  const first = await brain.orchestrate('First question', 'first');
  assert.equal(first.success, true);
  assert.deepEqual(first.orchestrationLog.moduleExecutionOrder,
    ['Midbrain', 'Medulla', 'FrontalLobe', 'Amygdala', 'ParietalLobe', 'Cerebrum', 'Brainstem', 'Cerebellum']);
  assert.ok(first.orchestrationLog.skippedModules.includes('OccipitalLobe'));
  const second = await brain.orchestrate('Second question', 'second');
  assert.equal(second.activities.every(activity => activity.sessionId === 'second'), true);
  assert.equal(brain.sessions.get('first').history.at(-1).content, 'Example');
  const secondCalls = query.mock.calls.slice(8);
  assert.equal(secondCalls.every(call => call.arguments[2].length === 0), true);
  assert.equal(first.activities.length, 8);
  assert.equal(first.activities.every(activity => typeof activity.durationMs === 'number'), true);
});

test('invalid safety output blocks synthesis; invalid specialist output is visibly degraded', async t => {
  const brain = new BrainOrchestrator({ store: new SessionStore(null) });
  let breakSafety = true;
  mockModels(t, brain, name => {
    if (name === 'Medulla' && breakSafety) return '{"isSafe":"true"}';
    if (name === 'ParietalLobe') return '{"facts":[]}';
  });
  const blocked = await brain.orchestrate('Question', 'first');
  assert.equal(blocked.success, false);
  assert.equal(blocked.orchestrationLog.moduleExecutionOrder.includes('Cerebrum'), false);
  assert.equal(blocked.activities.find(activity => activity.module === 'Medulla').status, 'failed');
  breakSafety = false;
  const degraded = await brain.orchestrate('Question', 'second');
  assert.equal(degraded.success, true);
  const failed = degraded.orchestrationLog.responses.ParietalLobe;
  assert.equal(failed.status, 'failed');
  assert.match(failed.error, /output invalid/);
});

test('memory is saved per conversation and supplied on later synthesis', async t => {
  const brain = new BrainOrchestrator({ store: new SessionStore(null) });
  const query = mockModels(t, brain, (name, output) => {
    if (name === 'FrontalLobe') output.requiresLongTermMemory = true;
  });
  await brain.orchestrate('Remember this', 'first');
  await brain.orchestrate('Recall', 'first');
  const synthesisCalls = query.mock.calls.filter(call => call.arguments[0] === brain.modules.get('Cerebrum').systemPrompt);
  assert.deepEqual(brain.sessions.get('first').memory.lastImportant, ['Remember this', 'Recall']);
  assert.deepEqual(JSON.parse(synthesisCalls[1].arguments[1]).memory.lastImportant, ['Remember this', 'Recall']);
  assert.equal(synthesisCalls[1].arguments[2][0].content, 'Remember this');
  assert.deepEqual(brain.sessions.get('second'), null);
});

test('token reservations bound concurrent calls and reported usage stops later calls', () => {
  const context = new BrainContext('user');
  context.maxTokens = 2000;
  const reservation = context.reserveLLM('system', 'question', []);
  assert.ok(reservation.outputLimit < 2000);
  assert.throws(() => context.reserveLLM('system', 'other', []), /budget/);
  reservation.release();
  assert.equal(context.reservedTokens, 0);
  const exceeded = new BrainContext('user');
  exceeded.maxTokens = 10;
  exceeded.recordUsage('Module', { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 });
  assert.throws(() => exceeded.throwIfStopped(), /budget/);
});

test('an invalid plan runs all specialists, and invalid stability output blocks before refinement', async t => {
  const brain = new BrainOrchestrator({ store: new SessionStore(null) });
  let breakStability = false;
  mockModels(t, brain, name => {
    if (name === 'FrontalLobe') return '{"primaryModules":["UnknownModule"]}';
    if (name === 'Brainstem' && breakStability) return '{"isStable":"true"}';
  });
  const result = await brain.orchestrate('Question', 'first');
  assert.equal(result.success, true);
  assert.equal(result.orchestrationLog.moduleExecutionOrder.length, 14);
  assert.deepEqual(result.orchestrationLog.skippedModules, []);
  assert.equal(result.orchestrationLog.responses.FrontalLobe.status, 'failed');
  breakStability = true;
  const chunks = [];
  const blocked = await brain.orchestrate('Question', 'second', { onChunk: chunk => chunks.push(chunk) });
  assert.equal(blocked.success, false);
  assert.equal(blocked.orchestrationLog.moduleExecutionOrder.includes('Cerebellum'), false);
  assert.deepEqual(chunks, [blocked.response]);
});

test('queued turns read the previous completed history and separate orchestrators own their modules', async t => {
  const brain = new BrainOrchestrator({ store: new SessionStore(null) });
  const other = new BrainOrchestrator({ store: new SessionStore(null) });
  assert.notEqual(brain.modules.get('Cerebrum'), other.modules.get('Cerebrum'));
  assert.equal(brain.modules.get('Cerebrum').orchestrator, brain);
  const query = mockModels(t, brain);
  await Promise.all([brain.orchestrate('First', 'chat'), brain.orchestrate('Second', 'chat')]);
  const calls = query.mock.calls.filter(call => call.arguments[0] === brain.modules.get('Cerebrum').systemPrompt);
  assert.equal(calls[0].arguments[2].length, 0);
  assert.equal(calls[1].arguments[2][0].content, 'First');
  assert.deepEqual(brain.sessions.get('chat').history.map(message => message.content), ['First', 'Example', 'Second', 'Example']);
});

test('deadline cancels upstream calls and does not save an incomplete answer', async t => {
  const previous = process.env.SYNAPSE_REQUEST_TIMEOUT_MS;
  process.env.SYNAPSE_REQUEST_TIMEOUT_MS = '25';
  t.after(() => { if (previous === undefined) delete process.env.SYNAPSE_REQUEST_TIMEOUT_MS; else process.env.SYNAPSE_REQUEST_TIMEOUT_MS = previous; });
  const brain = new BrainOrchestrator({ store: new SessionStore(null) });
  let signal;
  t.mock.method(azureOpenAI, 'chat', (prompt, input, history, options) => {
    signal = options.signal;
    return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
  });
  await assert.rejects(brain.orchestrate('Question', 'chat'), /deadline/);
  assert.equal(signal.aborted, true);
  assert.deepEqual(brain.sessions.get('chat').history, []);
});
