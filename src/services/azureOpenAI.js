import OpenAI from 'openai';

// Deployment names are passed through unchanged, including custom GPT-6+ aliases.
export class AzureOpenAIService {
  constructor({ client, env = process.env } = {}) {
    this.env = env;
    this.client = client;
  }

  getClient() {
    if (!this.client) {
      const { AZURE_OPENAI_ENDPOINT: endpoint, AZURE_OPENAI_API_KEY: apiKey } = this.env;
      if (!endpoint || !apiKey) throw new Error('Missing Azure OpenAI credentials');
      this.client = new OpenAI({
        apiKey,
        baseURL: `${endpoint.replace(/\/+$/, '').replace(/\/openai\/v1$/, '')}/openai/v1/`
      });
    }
    return this.client;
  }

  buildRequest(systemPrompt, userMessage, conversationHistory, stream) {
    const model = this.env.AZURE_OPENAI_DEPLOYMENT_ID;
    if (!model) throw new Error('Missing AZURE_OPENAI_DEPLOYMENT_ID');
    const mode = this.env.AZURE_OPENAI_API_MODE || 'responses';
    if (!['responses', 'chat'].includes(mode)) throw new Error('AZURE_OPENAI_API_MODE must be responses or chat');
    const limit = Number(this.env.AZURE_OPENAI_MAX_OUTPUT_TOKENS || 8192);
    if (!Number.isInteger(limit) || limit < 1) throw new Error('Invalid AZURE_OPENAI_MAX_OUTPUT_TOKENS');
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: userMessage }
    ];
    const effort = this.env.AZURE_OPENAI_REASONING_EFFORT;
    // Reasoning models may reject sampling controls, so omit them.
    if (mode === 'chat') {
      return { mode, params: { model, messages, stream, max_completion_tokens: limit,
        ...(effort ? { reasoning_effort: effort } : {}),
        ...(stream ? { stream_options: { include_usage: true } } : {}) } };
    }
    return { mode, params: { model, input: messages, stream, store: false,
      max_output_tokens: limit, ...(effort ? { reasoning: { effort } } : {}) } };
  }

  normalizeUsage(usage = {}) {
    const prompt = usage.input_tokens ?? usage.prompt_tokens ?? 0;
    const completion = usage.output_tokens ?? usage.completion_tokens ?? 0;
    return { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion };
  }

  checkResponse(response) {
    if (response.status && response.status !== 'completed') {
      throw new Error(response.error?.message || `Model response ${response.status}: ${response.incomplete_details?.reason || 'generation did not complete'}`);
    }
  }

  async chat(systemPrompt, userMessage, history = [], options = {}) {
    const { mode, params } = this.buildRequest(systemPrompt, userMessage, history, false);
    const client = this.getClient();
    const response = await (mode === 'responses' ? client.responses : client.chat.completions)
      .create(params, { signal: options.signal });
    if (mode === 'responses') this.checkResponse(response);
    if (mode === 'chat' && response.choices[0]?.finish_reason === 'length') throw new Error('Model output token limit reached');
    return {
      content: mode === 'responses' ? response.output_text || '' : response.choices[0]?.message?.content || '',
      tokenUsage: this.normalizeUsage(response.usage)
    };
  }

  async chatStream(systemPrompt, userMessage, history = [], { onChunk, signal } = {}) {
    const { mode, params } = this.buildRequest(systemPrompt, userMessage, history, true);
    const client = this.getClient();
    const stream = await (mode === 'responses' ? client.responses : client.chat.completions)
      .create(params, { signal });
    let content = '';
    let tokenUsage = this.normalizeUsage();
    let completed = false;
    try {
      for await (const event of stream) {
        signal?.throwIfAborted();
        let chunk = '';
        if (mode === 'responses') {
          if (event.type === 'response.output_text.delta' || event.type === 'response.refusal.delta') chunk = event.delta;
          if (event.type === 'response.completed') {
            completed = true;
            tokenUsage = this.normalizeUsage(event.response.usage);
          }
          if (event.type === 'response.failed' || event.type === 'response.incomplete') this.checkResponse(event.response);
          if (event.type === 'error') throw new Error(event.message || 'Model stream failed');
        } else {
          chunk = event.choices[0]?.delta?.content || event.choices[0]?.delta?.refusal || '';
          if (event.choices[0]?.finish_reason === 'length') throw new Error('Model output token limit reached');
          if (event.choices[0]?.finish_reason) completed = true;
          if (event.usage) tokenUsage = this.normalizeUsage(event.usage);
        }
        if (chunk) {
          content += chunk;
          await onChunk?.(chunk);
        }
      }
      signal?.throwIfAborted();
      if (!completed) throw new Error('Model stream ended before completion');
      return { content, tokenUsage };
    } finally {
      stream.controller?.abort();
    }
  }
}

export default new AzureOpenAIService();
