import { BaseBrainModule } from './baseBrainModule.js';

export class Midbrain extends BaseBrainModule {
  constructor() {
    super('Midbrain', 'Fast reflex classification and quick intent detection');
    this.systemPrompt = `You are the Midbrain module of a digital brain. Your role is FAST intent classification.
Analyze the user input and respond with ONLY a JSON object (no markdown, no extra text):
{
  "intent": "one of: greeting, question, command, statement, request_analysis",
  "urgency": "low | medium | high",
  "sentiment": "positive | neutral | negative",
  "keywords": ["array", "of", "keywords"],
  "requiresContext": true | false
}`;
  }

  async process(input, context) {
    this.log('Processing input for intent classification', { input: input.substring(0, 50) });

    try {
      const classification = await this.queryJSON(input, context.getHistory());

      return this.createOutput(
        `Classified user intent as: ${classification.intent}`,
        `Route to appropriate modules based on: ${classification.intent}`,
        [classification.intent === 'greeting' ? 'Cerebrum' : 'FrontalLobe'],
        classification
      );
    } catch (error) {
      this.error('Classification failed', { error: error.message });
      return this.createOutput(
        'Classification error',
        'Fallback to general processing',
        ['FrontalLobe'],
        { intent: 'general', urgency: 'medium', sentiment: 'neutral' }
      );
    }
  }
}

export default new Midbrain();
