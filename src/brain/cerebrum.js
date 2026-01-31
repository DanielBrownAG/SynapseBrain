import { BaseBrainModule } from './baseBrainModule.js';

export class Cerebrum extends BaseBrainModule {
  constructor() {
    super('Cerebrum', 'Top-level reasoning, aggregation, and final response generation');
    this.systemPrompt = `You are the Cerebrum of a digital brain - the highest level of reasoning.
Your role is to AGGREGATE all the inputs from other brain modules and produce a final, coherent response.
You have access to analysis from all other modules. Synthesize this information into a single, powerful response.
Think about the user's original intent, the emotional context, the factual basis, and the appropriate tone.
Produce a response that is both intelligent and empathetic.`;
  }

  async process(input, context) {
    this.log('Generating final response', { input: input.substring(0, 50) });

    try {
      // Get conversation history - already formatted as message objects
      const response = await this.queryLLM(input, context.getHistory());

      return this.createOutput(
        'Final synthesis and response generation',
        'Response ready for user',
        [],
        {
          response: response.content,
          tokenUsage: response.tokenUsage
        }
      );
    } catch (error) {
      this.error('Response generation failed', { error: error.message });
      return this.createOutput(
        'Response generation error',
        'Providing fallback response',
        [],
        {
          response: 'I apologize, but I encountered an issue processing your request. Please try again.',
          error: error.message
        }
      );
    }
  }
}

export default new Cerebrum();
