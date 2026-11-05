import { BaseBrainModule } from './baseBrainModule.js';

export class Hippocampus extends BaseBrainModule {
  constructor() {
    super('Hippocampus', 'Memory persistence and vector store integration');
    this.systemPrompt = `You are the Hippocampus of a digital brain. Your role is MEMORY MANAGEMENT.
Decide what information should be stored for future context.
Respond with ONLY a JSON object (no markdown, no extra text):
{
  "shouldStore": true | false,
  "keyInformation": ["important", "facts"],
  "storageType": "short_term | long_term | episodic",
  "retrievalPriority": "high | medium | low",
  "summary": "brief summary to store"
}`;
  }

  async process(input, context) {
    this.log('Processing memory', { input: input.substring(0, 50) });

    try {
      const memory = await this.queryJSON(input, context.getHistory());

      if (memory.shouldStore) {
        const existing = context.getMemory('lastImportant') || [];
        context.setMemory('lastImportant', [...new Set([...existing, ...memory.keyInformation])].slice(-100));
      }

      return this.createOutput(
        `Memory type: ${memory.storageType}`,
        `Store: ${memory.shouldStore ? 'Yes' : 'No'}, Priority: ${memory.retrievalPriority}`,
        [],
        memory
      );
    } catch (error) {
      this.error('Memory processing failed', { error: error.message });
      return this.createOutput(
        'Memory error',
        'Skipping memory storage',
        [],
        { shouldStore: false }
      );
    }
  }
}

export default new Hippocampus();
