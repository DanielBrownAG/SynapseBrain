import test from 'node:test';
import assert from 'node:assert/strict';
import { AzureOpenAIService } from '../src/services/azureOpenAI.js';

function fixture(events, mode = 'responses') {
  const calls = [];
  const abort = { called: false };
  const api = { create: async (params, options) => {
    calls.push({ params, options });
    if (!params.stream) return events;
    return { controller: { abort() { abort.called = true; } },
      async *[Symbol.asyncIterator]() { yield* events; } };
  } };
  const service = new AzureOpenAIService({
    client: { responses: api, chat: { completions: api } },
    env: { AZURE_OPENAI_DEPLOYMENT_ID: 'custom-gpt-6.1-deployment', AZURE_OPENAI_API_MODE: mode }
  });
  return { service, calls, abort };
}

test('Responses requests preserve deployment, roles, history and normalize usage', async () => {
  const { service, calls } = fixture({ status: 'completed', output_text: 'Hello', usage: { input_tokens: 5, output_tokens: 3 } });
  const result = await service.chat('System', 'Question', [{ role: 'assistant', content: 'Earlier' }]);
  assert.equal(result.content, 'Hello');
  assert.equal(result.tokenUsage.total_tokens, 8);
  const request = calls[0].params;
  assert.equal(request.model, 'custom-gpt-6.1-deployment');
  assert.equal(request.input[1].content, 'Earlier');
  assert.equal(request.max_output_tokens, 8192);
  assert.equal(request.store, false);
  for (const key of ['temperature', 'max_tokens', 'top_p']) assert.equal(key in request, false);
});

test('model deltas are delivered before upstream completion and usage survives', async () => {
  let delivered = false;
  const events = (async function* () {
    yield { type: 'response.output_text.delta', delta: 'Hello ' };
    assert.equal(delivered, true);
    yield { type: 'response.output_text.delta', delta: 'world' };
    yield { type: 'response.completed', response: { usage: { input_tokens: 10, output_tokens: 2 } } };
  })();
  const { service, abort } = fixture(events);
  const chunks = [];
  const result = await service.chatStream('System', 'Question', [], { onChunk: chunk => { delivered = true; chunks.push(chunk); } });
  assert.deepEqual(chunks, ['Hello ', 'world']);
  assert.equal(result.content, chunks.join(''));
  assert.equal(result.tokenUsage.total_tokens, 12);
  assert.equal(abort.called, true);
});

test('chat compatibility mode streams chunks and usage-only final events', async () => {
  const { service, calls } = fixture([
    { choices: [{ delta: { content: 'Hi' } }] },
    { choices: [{ delta: {}, finish_reason: 'stop' }] },
    { choices: [], usage: { prompt_tokens: 3, completion_tokens: 1 } }
  ], 'chat');
  service.env.AZURE_OPENAI_REASONING_EFFORT = 'low';
  const result = await service.chatStream('System', 'Question');
  assert.equal(result.content, 'Hi');
  assert.equal(result.tokenUsage.total_tokens, 4);
  assert.equal(calls[0].params.reasoning_effort, 'low');
  assert.equal(calls[0].params.max_completion_tokens, 8192);
});

test('truncated, failed and incomplete streams reject after partial output', async () => {
  for (const terminal of [null,
    { type: 'error', message: 'upstream failed' },
    { type: 'response.incomplete', response: { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } } },
    { type: 'response.failed', response: { status: 'failed', error: { message: 'failed' } } }
  ]) {
    const { service, abort } = fixture([
      { type: 'response.output_text.delta', delta: 'partial' }, ...(terminal ? [terminal] : [])
    ]);
    await assert.rejects(service.chatStream('System', 'Question'));
    assert.equal(abort.called, true);
  }
});

test('cancellation stops streaming and passes the signal to the SDK', async () => {
  const controller = new AbortController();
  const { service, calls, abort } = fixture([
    { type: 'response.output_text.delta', delta: 'first' },
    { type: 'response.output_text.delta', delta: 'second' }
  ]);
  const chunks = [];
  await assert.rejects(service.chatStream('System', 'Question', [], {
    signal: controller.signal, onChunk(chunk) { chunks.push(chunk); controller.abort(); }
  }), { name: 'AbortError' });
  assert.deepEqual(chunks, ['first']);
  assert.equal(calls[0].options.signal, controller.signal);
  assert.equal(abort.called, true);
});

test('invalid configuration and incomplete buffered output fail clearly', async () => {
  const { service } = fixture({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } });
  await assert.rejects(service.chat('System', 'Question'), /max_output_tokens/);
  service.env.AZURE_OPENAI_MAX_OUTPUT_TOKENS = 'invalid';
  await assert.rejects(service.chat('System', 'Question'), /Invalid/);
  delete service.env.AZURE_OPENAI_DEPLOYMENT_ID;
  await assert.rejects(service.chat('System', 'Question'), /DEPLOYMENT_ID/);
});
