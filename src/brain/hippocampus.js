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
      const response = await this.queryLLM(input, context.getHistory());
      
      let parsed = response.content;
      if (parsed.includes('```json')) {
        parsed = parsed.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      }
      
      const memory = JSON.parse(parsed);

      if (memory.shouldStore) {
        context.setMemory('lastImportant', memory.keyInformation);
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
